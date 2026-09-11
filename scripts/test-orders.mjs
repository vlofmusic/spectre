import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Run from the project root; no real notification transport is used in these tests.
const root = process.cwd();
const { parseOrder, submitOrder, checkoutEnabled, notificationText } = await import(pathToFileURL(resolve(root, 'server/orders.js')));
const { setQuantity, readBag, HOLD_SECONDS } = await import(pathToFileURL(resolve(root, 'server/reservations.js')));
const { default: worker } = await import(pathToFileURL(resolve(root, 'server/worker.js')));

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(resolve(root, 'drizzle')).filter(file => file.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(resolve(root, 'drizzle', file), 'utf8'));
  }
  sql.exec(readFileSync(resolve(root, 'db/seed-local.sql'), 'utf8'));
  return {
    rows(query, ...params) { return sql.prepare(query).all(...params); },
    close() { sql.close(); },
    prepare(query) { return { query, params: [], bind(...params) { this.params = params; return this; } }; },
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map(({ query, params }) => {
          const statement = sql.prepare(query);
          return query.trim().startsWith('SELECT')
            ? { results: statement.all(...params), meta: { changes: 0 } }
            : { results: [], meta: { changes: Number(statement.run(...params).changes) } };
        });
        sql.exec('COMMIT');
        return result;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    }
  };
}
function fixture(t) {
  const db = database();
  t.after(() => db.close());
  return { DB: db, TELEGRAM_BOT_TOKEN: '123456789:TEST_ONLY_NOT_A_REAL_TOKEN_123456789', TELEGRAM_CHAT_ID: '123456789' };
}
const input = overrides => ({ name: 'Test Customer', contactMethod: 'email', contact: 'customer@example.com', drawstrings: false, notes: '', requestKey: crypto.randomUUID(), ...overrides });
const sent = () => Response.json({ ok: true, result: { message_id: 17 } });
const orders = env => env.DB.rows('SELECT * FROM orders');
const failOnSend = async () => { assert.fail('Unexpected notification attempt'); };

test('same request key submitted concurrently stores one order and attempts Telegram once', { timeout: 3000 }, async t => {
  const env = fixture(t);
  await setQuantity(env.DB, 'shopper', 'S', 1, 100);
  const payload = input();
  let attempts = 0, release, announce;
  const deliveryStarted = new Promise(resolve => { announce = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const transport = async () => { attempts++; announce(); await gate; return sent(); };
  const first = submitOrder(env, 'shopper', payload, 101, transport);
  await deliveryStarted;
  const duplicates = await Promise.all(Array.from({ length: 4 }, () => submitOrder(env, 'shopper', payload, 101, transport)));
  assert.equal(attempts, 1);
  assert.equal(orders(env).length, 1);
  for (const response of duplicates) assert.equal(response.body.order.notificationStatus, 'pending');
  release();
  const result = await first;
  assert.equal(result.body.order.notificationStatus, 'sent');
  for (const response of duplicates) assert.equal(response.body.order.reference, result.body.order.reference);
  assert.equal((await submitOrder(env, 'shopper', payload, 102, failOnSend)).body.order.notificationStatus, 'sent');
});

test('order and notification use the database hold and fixed price, ignoring injected items and totals', async t => {
  const env = fixture(t);
  await setQuantity(env.DB, 'shopper', 'S', 1, 100);
  await setQuantity(env.DB, 'shopper', 'M', 1, 100);
  let outgoing;
  const payload = input({ items: { L: 99 }, unitPrice: 1, price: 1, currency: 'USD', subtotal: 0 });
  const response = await submitOrder(env, 'shopper', payload, 120, async (url, options) => {
    assert.match(url, /^https:\/\/api\.telegram\.org\/bot.+\/sendMessage$/);
    outgoing = JSON.parse(options.body);
    return sent();
  });
  const [row] = orders(env);
  assert.deepEqual(JSON.parse(row.items), { M: 1, S: 1 });
  assert.equal(row.unit_price, 50);
  assert.equal(row.currency, 'CHF');
  assert.equal(row.hold_expires_at, 100 + HOLD_SECONDS);
  assert.equal(response.body.order.holdExpiresAt, (100 + HOLD_SECONDS) * 1000);
  assert.match(outgoing.text, /Subtotal: CHF 100/);
  assert.match(outgoing.text, /M × 1/);
  assert.match(outgoing.text, /S × 1/);
  assert.doesNotMatch(outgoing.text, /L × 99|USD/);
  assert.equal(outgoing.link_preview_options.is_disabled, true);
  assert.equal(outgoing.parse_mode, undefined);
  assert.equal((await readBag(env.DB, '', 120)).available.S, 1);
});

test('exact hold expiry and an empty hold cannot create an order or send a notification', async t => {
  const env = fixture(t);
  await setQuantity(env.DB, 'expired', 'XS', 1, 100);
  const expired = await submitOrder(env, 'expired', input(), 100 + HOLD_SECONDS, failOnSend);
  assert.equal(expired.status, 409);
  const missing = await submitOrder(env, 'missing', input(), 101, failOnSend);
  assert.equal(missing.status, 409);
  await setQuantity(env.DB, 'empty', 'M', 1, 101);
  await setQuantity(env.DB, 'empty', 'M', 0, 102);
  assert.equal((await submitOrder(env, 'empty', input(), 103, failOnSend)).status, 409);
  assert.equal(orders(env).length, 0);
});

test('saved request can be recovered after hold deletion and config removal without resending', async t => {
  const env = fixture(t);
  const payload = input();
  await setQuantity(env.DB, 'shopper', 'XS', 1, 100);
  const first = await submitOrder(env, 'shopper', payload, 101, async () => sent());
  await setQuantity(env.DB, 'another-shopper', 'XS', 1, 1901);
  assert.equal(env.DB.rows('SELECT * FROM holds WHERE token_hash=?', 'shopper').length, 0);
  const retry = await submitOrder({ DB: env.DB }, 'shopper', payload, 2000, failOnSend);
  assert.deepEqual(retry.body.order, first.body.order);
  assert.equal(orders(env).length, 1);
});

test('missing Telegram configuration returns 503 before inserting or sending', async t => {
  const env = fixture(t);
  await setQuantity(env.DB, 'shopper', 'S', 1, 100);
  for (const configuration of [{ DB: env.DB }, { ...env, TELEGRAM_BOT_TOKEN: '' }, { ...env, TELEGRAM_CHAT_ID: 'not-a-chat' }]) {
    assert.equal(checkoutEnabled(configuration), false);
    assert.equal((await submitOrder(configuration, 'shopper', input(), 101, failOnSend)).status, 503);
  }
  assert.equal(checkoutEnabled(env), true);
  assert.equal(orders(env).length, 0);
});

test('explicit Telegram rejection is failed and a browser retry never blindly resends it', async t => {
  const env = fixture(t), payload = input();
  await setQuantity(env.DB, 'shopper', 'M', 1, 100);
  let attempts = 0;
  const first = await submitOrder(env, 'shopper', payload, 101, async () => {
    attempts++;
    return Response.json({ ok: false, description: 'Synthetic rejection' }, { status: 400 });
  });
  assert.equal(first.body.order.notificationStatus, 'failed');
  assert.equal(orders(env)[0].message_id, null);
  assert.deepEqual((await submitOrder(env, 'shopper', payload, 102, failOnSend)).body.order, first.body.order);
  assert.equal(attempts, 1);
});

test('ambiguous transport outcomes are uncertain and are not retried automatically', async t => {
  const cases = [
    ['network failure', async () => { throw new TypeError('Synthetic network failure'); }],
    ['unreadable response', async () => new Response('not JSON')],
    ['missing message id', async () => Response.json({ ok: true, result: {} })],
    ['invalid message id', async () => Response.json({ ok: true, result: { message_id: '17' } })]
  ];
  for (const [name, transport] of cases) await t.test(name, async t => {
    const env = fixture(t), payload = input();
    await setQuantity(env.DB, 'shopper', 'L', 1, 100);
    const first = await submitOrder(env, 'shopper', payload, 101, transport);
    assert.equal(first.body.order.notificationStatus, 'uncertain');
    assert.equal(orders(env)[0].message_id, null);
    assert.deepEqual((await submitOrder(env, 'shopper', payload, 102, failOnSend)).body.order, first.body.order);
  });
});

test('a status-write failure after Telegram delivery remains recoverable and never claims confirmation', async t => {
  const env = fixture(t), payload = input(), originalBatch = env.DB.batch.bind(env.DB);
  await setQuantity(env.DB, 'shopper', 'L', 1, 100);
  let attempts = 0;
  env.DB.batch = async statements => {
    if (statements.some(statement => statement.query.startsWith('UPDATE orders SET notification_status=?'))) throw new Error('Synthetic write failure');
    return originalBatch(statements);
  };
  await assert.rejects(submitOrder(env, 'shopper', payload, 101, async () => { attempts++; return sent(); }), /Synthetic write failure/);
  env.DB.batch = originalBatch;
  const recovered = await submitOrder(env, 'shopper', payload, 102, failOnSend);
  assert.equal(recovered.body.order.notificationStatus, 'pending');
  assert.equal(attempts, 1);
});

test('parseOrder rejects malformed contacts and bounds fields while discarding injected commercial data', () => {
  for (const override of [
    { name: '  ' }, { name: 'a'.repeat(121) }, { contact: 'not-an-email' },
    { contact: 'a b@example.com' }, { contactMethod: 'sms' },
    { contactMethod: 'telegram', contact: '@bad user' },
    { contactMethod: 'instagram', contact: 'https://example.com/user' },
    { contact: 'a'.repeat(201) }, { notes: 'a'.repeat(1001) },
    { drawstrings: 'yes' }, { requestKey: false }
  ]) assert.equal(parseOrder(input(override)), null, JSON.stringify(override));
  assert.equal(parseOrder(null), null);
  assert.equal(parseOrder([]), null);
  assert.ok(parseOrder(input({ contactMethod: 'telegram', contact: '@valid_username' })));
  assert.ok(parseOrder(input({ contactMethod: 'instagram', contact: '@valid.username' })));
  const parsed = parseOrder(input({ name: ' Customer ', items: { XS: 9 }, price: 1 }));
  assert.equal(parsed.name, 'Customer');
  assert.equal(parsed.items, undefined);
  assert.equal(parsed.price, undefined);
});

test('request keys must retain the UUID structure generated by the checkout client', () => {
  assert.equal(parseOrder(input({ requestKey: '-'.repeat(36) })), null);
  assert.equal(parseOrder(input({ requestKey: 'a'.repeat(36) })), null);
});

test('worker rejects wrong method, cross-origin or missing origin, non-JSON and oversized requests without outbound calls', async t => {
  const env = fixture(t);
  let outbound = 0;
  t.mock.method(globalThis, 'fetch', async () => { outbound++; throw new Error('No network allowed in this test'); });
  const cases = [
    [new Request('https://spectre.example/api/orders'), 405],
    [new Request('https://spectre.example/api/checkout', { method: 'POST' }), 405],
    [new Request('https://spectre.example/api/orders', { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: JSON.stringify(input()) }), 403],
    [new Request('https://spectre.example/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input()) }), 403],
    [new Request('https://spectre.example/api/orders', { method: 'POST', headers: { Origin: 'https://spectre.example', 'Content-Type': 'text/plain' }, body: '{}' }), 415],
    [new Request('https://spectre.example/api/orders', { method: 'POST', headers: { Origin: 'https://spectre.example', 'Content-Type': 'application/json' }, body: 'x'.repeat(8193) }), 413],
    [new Request('https://spectre.example/api/orders', { method: 'POST', headers: { Origin: 'https://spectre.example', 'Content-Type': 'application/json' }, body: '{' }), 400]
  ];
  for (const [request, expected] of cases) assert.equal((await worker.fetch(request, env)).status, expected);
  assert.equal(orders(env).length, 0);
  assert.equal(outbound, 0);
});

test('notification remains plain text, contains the persisted selection and does not imply payment', () => {
  const text = notificationText({ reference: 'SP-TEST', items: '{"XS":1}', currency: 'CHF', unit_price: 50, name: '<b>Customer</b>', contact_method: 'email', contact: 'customer@example.com', drawstrings: 0, notes: 'A fit question', hold_expires_at: 1900 });
  assert.match(text, /XS × 1/);
  assert.match(text, /Subtotal: CHF 50/);
  assert.match(text, /No payment taken/);
  assert.match(text, /<b>Customer<\/b>/);
});
