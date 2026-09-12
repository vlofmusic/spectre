import test from 'node:test';
import assert from 'node:assert/strict';
import { configureWebhook, main, parseArguments, parseSettings, validateOrigin } from './configure-customer-webhook.mjs';

const origin = 'https://spectre-studio-refresh.riabchenko-vla995208.chatgpt.site';
const endpoint = `${origin}/api/telegram/webhook`;
const settings = {
  TELEGRAM_BOT_TOKEN: '123456:TEST_ONLY_NOT_A_REAL_TOKEN_12345678',
  TELEGRAM_BOT_USERNAME: 'spectreorders_bot',
  TELEGRAM_WEBHOOK_SECRET: 'TEST_ONLY_NOT_A_REAL_SECRET_1234567890',
};

function telegramMock({ existing = '', username = 'spectreorders_bot', failSet = false } = {}) {
  const calls = [];
  let configured = false;
  return {
    calls,
    fetch: async (url, request) => {
      const method = new URL(url).pathname.split('/').at(-1);
      const body = JSON.parse(request.body);
      calls.push({ method, body });
      assert.equal(request.redirect, 'error');
      if (method === 'setWebhook' && failSet) throw new Error(`Transport details containing ${settings.TELEGRAM_BOT_TOKEN}`);
      let result;
      if (method === 'getWebhookInfo') result = { url: configured ? endpoint : existing, allowed_updates: ['message'] };
      else if (method === 'getMe') result = { is_bot: true, username };
      else if (method === 'setWebhook') { configured = true; result = true; }
      else assert.fail('Unexpected Telegram method');
      return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
    },
  };
}

test('only exact known public HTTPS origins are accepted', () => {
  assert.equal(validateOrigin(origin), origin);
  assert.equal(validateOrigin('https://spectre-studio.co/'), 'https://spectre-studio.co');
  for (const invalid of [
    'http://spectre-studio.co', 'https://localhost', 'https://127.0.0.1',
    'https://unrelated.example', 'https://spectre-studio.co:443',
    'https://spectre-studio.co/path', 'https://spectre-studio.co?secret=test',
    'https://spectre-studio.co#part', 'https://user:pass@spectre-studio.co',
  ]) assert.throws(() => validateOrigin(invalid));
});

test('ambiguous command combinations and unknown flags are rejected', () => {
  assert.throws(() => parseArguments(['--origin', origin, '--dry-run', '--apply']));
  assert.throws(() => parseArguments(['--origin', origin, '--replace']));
  assert.throws(() => parseArguments(['--origin', origin, '--apply', '--apply']));
  assert.throws(() => parseArguments(['--token', 'never-on-command-line']));
  assert.throws(() => parseArguments(['--origin']));
});

test('help and default dry run never read settings or call the network', async () => {
  const logs = [];
  const dependencies = {
    log: value => logs.push(value),
    loadSettings: () => assert.fail('Settings must not be read'),
    fetchImpl: () => assert.fail('Network must not be used'),
  };
  await main(['--help'], dependencies);
  await main(['--origin', origin], dependencies);
  await main(['--origin', origin, '--dry-run'], dependencies);
  assert.ok(logs.at(-1).includes(endpoint));
  assert.ok(!logs.join('\n').includes(settings.TELEGRAM_BOT_TOKEN));
});

test('apply needs an explicit environment gate before reading secrets', async () => {
  await assert.rejects(main(['--origin', origin, '--apply'], {
    environment: {}, log: () => {},
    loadSettings: () => assert.fail('Settings must not be read without authorization'),
  }), /SPECTRE_ALLOW_TELEGRAM_WEBHOOK_CONFIG/);
});

test('settings parse without shell expansion and reject duplicates or weak secrets', () => {
  const text = Object.entries(settings).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n');
  assert.equal(parseSettings(text).TELEGRAM_BOT_USERNAME, settings.TELEGRAM_BOT_USERNAME);
  assert.throws(() => parseSettings(`${text}\nTELEGRAM_BOT_USERNAME="another_bot"`), /Duplicate/);
  assert.throws(() => parseSettings(text.replace(settings.TELEGRAM_WEBHOOK_SECRET, 'short')), /32–256/);
  assert.throws(() => parseSettings(text.replace(settings.TELEGRAM_BOT_TOKEN, '$(echo injected)')), /valid TELEGRAM_BOT_TOKEN/);
});

test('bot identity is checked before any configuration change', async () => {
  const mock = telegramMock({ username: 'different_bot' });
  await assert.rejects(configureWebhook({ origin, settings }, mock.fetch), /identity/);
  assert.deepEqual(mock.calls.map(call => call.method), ['getWebhookInfo', 'getMe']);
});

test('existing other webhook cannot be overwritten without explicit replace', async () => {
  const mock = telegramMock({ existing: 'https://private.example/hidden-credential' });
  await assert.rejects(configureWebhook({ origin, settings }, mock.fetch), error => {
    assert.match(error.message, /different webhook/);
    assert.ok(!error.message.includes('hidden-credential'));
    return true;
  });
  assert.deepEqual(mock.calls.map(call => call.method), ['getWebhookInfo', 'getMe']);
});

test('configured webhook uses the secret, messages only and never discards pending updates', async () => {
  const mock = telegramMock();
  assert.deepEqual(await configureWebhook({ origin, settings }, mock.fetch), { endpoint, replaced: false });
  assert.deepEqual(mock.calls.map(call => call.method), ['getWebhookInfo', 'getMe', 'setWebhook', 'getWebhookInfo']);
  assert.deepEqual(mock.calls[2].body, { url: endpoint, secret_token: settings.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'] });
  assert.ok(!mock.calls.some(call => call.method === 'sendMessage'));
});

test('replace is an intentional switch and same-endpoint retries need no replace', async () => {
  const replacement = telegramMock({ existing: 'https://old.example/handler' });
  const same = telegramMock({ existing: endpoint });
  assert.equal((await configureWebhook({ origin, replace: true, settings }, replacement.fetch)).replaced, true);
  assert.equal((await configureWebhook({ origin, settings }, same.fetch)).replaced, false);
});

test('uncertain writes are reported without leaking transport details or secrets', async () => {
  const mock = telegramMock({ failSet: true });
  await assert.rejects(configureWebhook({ origin, settings }, mock.fetch), error => {
    assert.match(error.message, /may already be applied/);
    assert.ok(!error.message.includes(settings.TELEGRAM_BOT_TOKEN));
    assert.ok(!error.message.includes(settings.TELEGRAM_WEBHOOK_SECRET));
    return true;
  });
  assert.equal(mock.calls.filter(call => call.method === 'setWebhook').length, 1);
});
