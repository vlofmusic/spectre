#!/usr/bin/env node
/* Owner-run local administration only. Never imported by the public Worker. */
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SETTINGS = fileURLToPath(new URL('../.dev.vars', import.meta.url));
const ORIGINS = new Set([
  'https://spectre-studio-refresh.riabchenko-vla995208.chatgpt.site',
  'https://spectre-studio.co',
  'https://www.spectre-studio.co',
]);
const KEYS = new Set(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET']);

export class SetupError extends Error {}

export function validateOrigin(value) {
  if (typeof value !== 'string' || value.length > 256) throw new SetupError('Provide a known public HTTPS origin with --origin.');
  let parsed;
  try { parsed = new URL(value); } catch { throw new SetupError('The origin must be a public HTTPS origin, without a path, port, or query.'); }
  if (!ORIGINS.has(parsed.origin) || value.replace(/\/$/, '') !== parsed.origin || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new SetupError('Origin rejected. Use one of the approved Spectre HTTPS origins, without a path, port, credentials, or query.');
  }
  return parsed.origin;
}

export function parseArguments(argv) {
  const options = { help: false, apply: false, replace: false, dry: false, origin: null };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (seen.has(argument)) throw new SetupError('Duplicate command option. Use --help for usage.');
    seen.add(argument);
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--apply') options.apply = true;
    else if (argument === '--dry-run') options.dry = true;
    else if (argument === '--replace') options.replace = true;
    else if (argument === '--origin') options.origin = argv[++index];
    else throw new SetupError('Unknown command option. Use --help for usage.');
  }
  if (options.help) return options;
  if (options.apply && options.dry) throw new SetupError('Choose either --apply or --dry-run.');
  if (options.replace && !options.apply) throw new SetupError('--replace requires --apply.');
  options.origin = validateOrigin(options.origin);
  return options;
}

export function parseSettings(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 65536) throw new SetupError('Local settings could not be read safely.');
  const values = Object.create(null);
  for (const line of text.split(/\r?\n/)) {
    const assignment = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!assignment || !KEYS.has(assignment[1])) continue;
    const [, key, source] = assignment;
    if (Object.hasOwn(values, key)) throw new SetupError('Duplicate Telegram settings found. Resolve them locally before configuration.');
    let value;
    if (source.startsWith('"')) {
      try { value = JSON.parse(source); } catch { throw new SetupError('Use a single quoted or unquoted line for each Telegram setting.'); }
    } else if (source.startsWith("'")) {
      if (!/^'[^'\r\n]*'$/.test(source)) throw new SetupError('Use a single quoted or unquoted line for each Telegram setting.');
      value = source.slice(1, -1);
    } else value = source.replace(/\s+#.*$/, '');
    if (typeof value !== 'string') throw new SetupError('Telegram settings must contain text values.');
    values[key] = value;
  }
  if (!/^\d{1,20}:[A-Za-z0-9_-]{20,128}$/.test(values.TELEGRAM_BOT_TOKEN || '')) throw new SetupError('Set a valid TELEGRAM_BOT_TOKEN in the private local settings file.');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(values.TELEGRAM_BOT_USERNAME || '')) throw new SetupError('Set TELEGRAM_BOT_USERNAME without @ in the private local settings file.');
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(values.TELEGRAM_WEBHOOK_SECRET || '')) throw new SetupError('Set TELEGRAM_WEBHOOK_SECRET to 32–256 random letters, digits, underscores or hyphens in both local and production settings.');
  return values;
}

async function loadSettings() {
  let handle;
  try {
    handle = await open(SETTINGS, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 65536 || (stat.mode & 0o077) !== 0) throw new SetupError('Private .dev.vars must be a regular file with owner-only permissions (chmod 600).');
    return parseSettings(await handle.readFile('utf8'));
  } catch (error) {
    if (error instanceof SetupError) throw error;
    throw new SetupError('Could not safely read the project .dev.vars. No settings were changed.');
  } finally { await handle?.close().catch(() => {}); }
}

export async function configureWebhook({ origin, replace, settings }, fetchImpl = globalThis.fetch) {
  const endpoint = `${validateOrigin(origin)}/api/telegram/webhook`;
  // Also validate injected settings so callers cannot bypass the local-file checks.
  const validated = parseSettings([...KEYS].map(key => `${key}=${JSON.stringify(settings?.[key] || '')}`).join('\n'));
  const telegram = async (method, body = {}) => {
    let response;
    let data;
    try {
      response = await fetchImpl(`https://api.telegram.org/bot${validated.TELEGRAM_BOT_TOKEN}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(12000),
      });
      data = await response.json();
    } catch { throw new SetupError('Telegram could not be reached or returned an unreadable response. No secret details are displayed.'); }
    if (!response.ok || data?.ok !== true) throw new SetupError('Telegram rejected the configuration request. Check the bot credentials and account status privately.');
    return data.result;
  };

  // Read before mutating. Never print an existing webhook URL: it may contain secrets.
  const existing = await telegram('getWebhookInfo');
  if (typeof existing?.url !== 'string') throw new SetupError('Telegram returned an invalid webhook status. No configuration was changed.');
  const bot = await telegram('getMe');
  if (bot?.is_bot !== true || typeof bot.username !== 'string' || bot.username.toLowerCase() !== validated.TELEGRAM_BOT_USERNAME.toLowerCase()) {
    throw new SetupError('Bot identity does not match TELEGRAM_BOT_USERNAME. No configuration was changed.');
  }
  if (existing.url && existing.url !== endpoint && !replace) {
    throw new SetupError('A different webhook is already configured. Review that integration first; use --replace only if you intend to replace it.');
  }

  try {
    const accepted = await telegram('setWebhook', {
      url: endpoint,
      secret_token: validated.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message'],
      // Do not drop pending updates or override certificate/IP settings.
    });
    if (accepted !== true) throw new SetupError('Telegram did not confirm the webhook update.');
    const current = await telegram('getWebhookInfo');
    if (current?.url !== endpoint || !Array.isArray(current.allowed_updates) || current.allowed_updates.length !== 1 || current.allowed_updates[0] !== 'message') {
      throw new SetupError('The final webhook status does not match the requested configuration.');
    }
  } catch {
    throw new SetupError('The webhook update could not be confirmed and may already be applied. Keep the same secret; check Telegram webhook status before further changes.');
  }
  return { endpoint, replaced: Boolean(existing.url && existing.url !== endpoint) };
}

const HELP = `Configure customer Telegram receipts for Spectre (owner-run administration).

Preview only; no settings file is read and no network request is made:
  node scripts/configure-customer-webhook.mjs --origin HTTPS_ORIGIN --dry-run

After deploying the matching webhook handler and production secrets:
  SPECTRE_ALLOW_TELEGRAM_WEBHOOK_CONFIG=1 node scripts/configure-customer-webhook.mjs --origin HTTPS_ORIGIN --apply

Optional --replace explicitly permits replacing a different existing webhook.
Approved origins: ${[...ORIGINS].join(', ')}

The apply command reads only the project's private .dev.vars (owner-only permissions).
It checks the existing webhook and bot identity, then updates and verifies the webhook.
It never sends a bot message or drops pending updates.
Setting a webhook disables getUpdates polling, including the old local bot setup flow.
The same TELEGRAM_WEBHOOK_SECRET must already exist in the production runtime.
`;

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const log = dependencies.log || console.log;
  const options = parseArguments(argv);
  if (options.help) { log(HELP); return; }
  const endpoint = `${options.origin}/api/telegram/webhook`;
  if (!options.apply) {
    log(`Preview only: ${endpoint}\nNo settings read, requests made, or configuration changed. Use --help for explicit apply instructions.`);
    return;
  }
  const environment = dependencies.environment || process.env;
  if (environment.SPECTRE_ALLOW_TELEGRAM_WEBHOOK_CONFIG !== '1') {
    throw new SetupError('Apply requires SPECTRE_ALLOW_TELEGRAM_WEBHOOK_CONFIG=1 for this explicit command.');
  }
  log(`Configuring ${endpoint}\nWebhook delivery replaces getUpdates polling. Pending updates will not be dropped.`);
  const settings = await (dependencies.loadSettings || loadSettings)();
  const result = await configureWebhook({ ...options, settings }, dependencies.fetchImpl);
  log(`Webhook endpoint confirmed: ${result.endpoint}\nNo bot message was sent by this script. Test the customer receipt flow separately.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof SetupError ? error.message : 'Webhook configuration failed. No secret details are displayed.');
    process.exitCode = 1;
  });
}
