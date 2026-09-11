import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, open, rename, unlink, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const DESTINATION = `${PROJECT_ROOT}/.dev.vars`;
const HOST = '127.0.0.1';
const PORT = 8766;
const ORIGIN = `http://${HOST}:${PORT}`;
const capability = randomBytes(32).toString('hex');
const csrf = randomBytes(32).toString('hex');
const prefix = `/setup/${capability}`;
const pageURL = `${ORIGIN}${prefix}/`;
const cspNonce = randomBytes(24).toString('base64');
const htmlTemplate = await readFile(new URL('./setup-telegram.html', import.meta.url), 'utf8');
let state = null;
let busy = false;
let lastPoll = 0;
let ended = false;

class SetupError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function constantEqual(a, b) {
  if (typeof a !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function reply(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type, 'Cache-Control': 'no-store, max-age=0', 'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${cspNonce}'; style-src 'nonce-${cspNonce}'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
  });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
async function bodyJSON(req) {
  if (req.headers['content-type'] !== 'application/json') throw new SetupError('Use the setup form.', 415);
  let bytes = 0;
  const parts = [];
  for await (const part of req) {
    bytes += part.length;
    if (bytes > 4096) throw new SetupError('The submitted value is too long.', 413);
    parts.push(part);
  }
  try {
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new SetupError('The form could not be read. Please try again.'); }
}
async function telegram(token, method, body = {}) {
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(12000), redirect: 'error',
    });
  } catch { throw new SetupError('Telegram is not responding. Please try again shortly.', 502); }
  if (response.status === 401 || response.status === 404) throw new SetupError('Telegram did not accept this token. Copy the full token from BotFather.');
  if (response.status === 409) throw new SetupError('This bot is already connected to another service. Use the new Spectre bot, or stop its other connection first.', 409);
  if (response.status === 429) throw new SetupError('Telegram needs a short pause. Please try again in a minute.', 429);
  let data;
  try { data = await response.json(); } catch { throw new SetupError('Telegram returned an unreadable response. Try again.', 502); }
  if (!response.ok || data.ok !== true) throw new SetupError('Telegram could not complete this step. Please try again.', 502);
  return data.result;
}
async function writeSettings(token, chatId) {
  let existing = '';
  let originalStat = null;
  try {
    const handle = await open(DESTINATION, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      originalStat = await handle.stat();
      if (!originalStat.isFile() || originalStat.size > 65536) throw new Error('Unsupported settings file');
      existing = await handle.readFile('utf8');
    } finally { await handle.close(); }
  } catch (error) {
    if (error.code !== 'ENOENT') throw new SetupError('Local settings could not be read safely. Ask Codex to check the setup file.', 500);
  }
  const lines = existing.split(/\r?\n/);
  const kept = lines.filter(line => !/^\s*(?:export\s+)?(?:TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)\s*=/.test(line));
  // Refuse unusual multi-line target values rather than risk damaging another setting.
  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?(?:TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)\s*=\s*(["'])(.*)$/);
    if (match && !match[2].includes(match[1])) throw new SetupError('Existing Telegram settings need a small local cleanup. Ask Codex to check them.', 500);
  }
  const text = `${kept.join('\n').replace(/\n*$/, '')}\nTELEGRAM_BOT_TOKEN=${JSON.stringify(token)}\nTELEGRAM_CHAT_ID=${JSON.stringify(chatId)}\n`;
  const temporary = `${PROJECT_ROOT}/.dev.vars.setup-${randomBytes(12).toString('hex')}`;
  let handle;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close(); handle = null;
    let currentStat = null;
    try { currentStat = await lstat(DESTINATION); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (currentStat?.isSymbolicLink() || (originalStat && (!currentStat || currentStat.ino !== originalStat.ino || currentStat.mtimeMs !== originalStat.mtimeMs)) || (!originalStat && currentStat)) throw new Error('Settings changed while saving');
    await rename(temporary, DESTINATION);
  } catch {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw new SetupError('Settings were not saved. Please retry; if this repeats, ask Codex to check the local file.', 500);
  }
}
function clearState() { if (state) state.token = ''; state = null; }
const server = http.createServer(async (req, res) => {
  try {
    if (ended || req.socket.remoteAddress !== HOST || req.headers.host !== `${HOST}:${PORT}`) return reply(res, 403, { error: 'This setup is available only on this computer.' });
    if (req.url.includes('?')) return reply(res, 400, { error: 'Use the local setup page without query parameters.' });
    const path = new URL(req.url, ORIGIN).pathname;
    if (req.method === 'GET' && path === `${prefix}/` && !req.url.includes('?')) {
      const html = htmlTemplate.replaceAll('__CSP_NONCE__', cspNonce).replaceAll('__CSRF__', csrf).replaceAll('__PREFIX__', prefix);
      return reply(res, 200, html, 'text/html; charset=utf-8');
    }
    if (req.method !== 'POST' || ![`${prefix}/validate`, `${prefix}/poll`, `${prefix}/confirm`].includes(path)) return reply(res, 404, { error: 'Setup page not found.' });
    if (req.headers.origin !== ORIGIN || !constantEqual(req.headers['x-setup-csrf'], csrf) || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) return reply(res, 403, { error: 'Please reopen the local setup page.' });
    if (busy) return reply(res, 409, { error: 'The previous step is still running. Please wait.' });
    busy = true;
    try {
      const body = await bodyJSON(req);
      if (state?.saved) return reply(res, 200, { saved: true, notified: state.notified, username: state.username });
      if (path.endsWith('/validate')) {
        const token = typeof body.token === 'string' ? body.token.trim() : '';
        if (!/^\d{1,20}:[A-Za-z0-9_-]{20,128}$/.test(token)) throw new SetupError('Paste the full token from BotFather, including the numbers before the colon.');
        const bot = await telegram(token, 'getMe');
        if (bot?.is_bot !== true || !/^[A-Za-z0-9_]{5,32}$/.test(bot.username || '')) throw new SetupError('Telegram did not return a valid bot account.', 502);
        clearState();
        state = { token, username: bot.username, nonce: randomBytes(24).toString('hex'), created: Math.floor(Date.now() / 1000), recipient: null, saved: false, notified: false };
        return reply(res, 200, { username: state.username, link: `https://t.me/${state.username}?start=${state.nonce}` });
      }
      if (!state) throw new SetupError('First verify the bot token.');
      if (path.endsWith('/poll')) {
        if (Date.now() - lastPoll < 2000) throw new SetupError('Wait a moment before checking again.', 429);
        lastPoll = Date.now();
        const updates = await telegram(state.token, 'getUpdates', { limit: 100, timeout: 0, allowed_updates: ['message'] });
        if (!Array.isArray(updates)) throw new SetupError('Telegram returned an unreadable response.', 502);
        const matches = updates.map(update => update.message).filter(message =>
          message?.chat?.type === 'private' && !message.from?.is_bot &&
          Number.isSafeInteger(message.chat.id) && message.chat.id > 0 && message.from?.id === message.chat.id &&
          message.date >= state.created - 5 && message.text === `/start ${state.nonce}`);
        const unique = [...new Map(matches.map(message => [message.chat.id, message])).values()];
        if (unique.length > 1) throw new SetupError('More than one person opened this connection link. Verify the token again to make a fresh private link.', 409);
        if (!unique.length) return reply(res, 200, { found: false });
        const match = unique[0];
        state.recipient = { id: String(match.chat.id), name: String(match.chat.first_name || 'Your private chat').slice(0,80), username: typeof match.chat.username === 'string' ? match.chat.username.slice(0,40) : '' };
        return reply(res, 200, { found: true, recipient: { name: state.recipient.name, username: state.recipient.username } });
      }
      if (!state.recipient || body.confirm !== true) throw new SetupError('Open the private bot link, press Start, then check the connection before saving.');
      await writeSettings(state.token, state.recipient.id);
      state.saved = true;
      try {
        await telegram(state.token, 'sendMessage', {
          chat_id: state.recipient.id,
          text: 'Spectre: Telegram connected for order notifications. This message confirms the connection from your local site. Customer orders will appear here after the site checkout is enabled. No order has been placed by this setup.',
          link_preview_options: { is_disabled: true },
        });
        state.notified = true;
      } catch { /* Settings are already saved. Report delivery uncertainty without repeating a message. */ }
      state.token = '';
      console.log('Telegram setup saved locally. Secret values are not displayed.');
      return reply(res, 200, { saved: true, notified: state.notified, username: state.username });
    } finally { busy = false; }
  } catch (error) {
    if (!res.headersSent) reply(res, error instanceof SetupError ? error.status : 500, { error: error instanceof SetupError ? error.message : 'This step could not finish. Please try again.' });
    else res.end();
  }
});
server.requestTimeout = 20000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 3000;
server.maxHeadersCount = 30;
const expiry = setTimeout(() => {
  ended = true; clearState();
  server.close(); server.closeAllConnections();
  console.log('Local Telegram setup closed after 30 minutes.');
}, 30 * 60 * 1000);
function stop() { clearTimeout(expiry); ended = true; clearState(); server.close(); server.closeAllConnections(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
server.on('error', () => { clearTimeout(expiry); clearState(); console.error('Could not open local setup on127.0.0.1:8766. Another setup may already be running.'); process.exitCode = 1; });
server.listen(PORT, HOST, () => console.log(`Open this one-time local setup page: ${pageURL}`));
