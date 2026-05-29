#!/usr/bin/env node
/**
 * Lightweight Plaid helper tests (no API calls). Run: npm run test:plaid
 */
const assert = require('assert');
const crypto = require('crypto');
const {
  plaidAmountToAppAmount,
  plaidBalanceToAppBalance,
  mapPlaidTypeToInternal,
  accountFingerprint,
  isPlaidTransferTransaction,
  getPlaidConfig,
  buildLinkTokenCreatePayload,
  sanitizeLinkedItemRow,
} = require('../src/services/plaid/plaidService.cjs');

function assertNoSecrets(obj) {
  const s = JSON.stringify(obj);
  assert.ok(!s.includes('access-super-secret'), 'must not leak access_token');
  assert.ok(!obj.access_token, 'DTO must omit access_token');
}
const {
  filterPlaidTransactionUpdates,
  isPlaidImportedTransaction,
} = require('../src/utils/plaidTransactionUtils.cjs');
const { peekJwtKidAndAlg, timingSafeEqualHex } = require('./lib/plaidWebhookVerify.cjs');

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('Plaid service unit tests\n');

void (async () => {
  await test('plaidAmountToAppAmount negates outflows', () => {
    assert.strictEqual(plaidAmountToAppAmount(50), -50);
    assert.strictEqual(plaidAmountToAppAmount(-20), 20);
  });

  await test('plaidBalanceToAppBalance credit is negative', () => {
    const bal = plaidBalanceToAppBalance({ type: 'credit' }, 500);
    assert.strictEqual(bal, -500);
  });

  await test('plaidBalanceToAppBalance checking is positive', () => {
    const bal = plaidBalanceToAppBalance({ type: 'depository' }, 1200);
    assert.strictEqual(bal, 1200);
  });

  await test('extractPlaidRawBalance prefers current for credit accounts', () => {
    const { extractPlaidRawBalance, plaidBalanceToAppBalance } = require('../src/services/plaid/plaidService.cjs');
    const raw = extractPlaidRawBalance({
      type: 'credit',
      balances: { current: 1250.45, available: 8750, limit: 10000 },
    });
    assert.strictEqual(raw, 1250.45);
    assert.strictEqual(
      plaidBalanceToAppBalance({ type: 'credit' }, raw),
      -1250.45
    );
  });

  await test('mapPlaidTypeToInternal credit card subtype', () => {
    assert.strictEqual(
      mapPlaidTypeToInternal({ type: 'credit', subtype: 'credit card' }),
      'credit'
    );
    assert.strictEqual(
      mapPlaidTypeToInternal({ type: 'credit', subtype: 'credit_card' }),
      'credit'
    );
    assert.strictEqual(
      mapPlaidTypeToInternal({ type: 'other', subtype: 'credit card' }),
      'credit'
    );
  });

  await test('mapPlaidTypeToInternal depository checking', () => {
    assert.strictEqual(
      mapPlaidTypeToInternal({ type: 'depository', subtype: 'checking' }),
      'checking'
    );
  });

  await test('accountFingerprint is stable', () => {
    const fp = accountFingerprint('ins_1', {
      type: 'depository',
      subtype: 'checking',
      mask: '1234',
    });
    assert(fp.includes('ins_1'));
    assert(fp.includes('1234'));
  });

  await test('isPlaidTransferTransaction detects PFC transfer', () => {
    assert.strictEqual(
      isPlaidTransferTransaction({
        personal_finance_category: { primary: 'TRANSFER_OUT' },
      }),
      true
    );
    assert.strictEqual(
      isPlaidTransferTransaction({
        personal_finance_category: { primary: 'FOOD_AND_DRINK' },
      }),
      false
    );
  });

  await test('buildLinkTokenCreatePayload uses transactions and account filters', () => {
    const prev = process.env.PLAID_LINK_PRODUCTS;
    process.env.PLAID_LINK_PRODUCTS = 'transactions';
    const payload = buildLinkTokenCreatePayload('user-1');
    assert.deepStrictEqual(payload.products, ['transactions']);
    assert.ok(payload.account_filters?.depository);
    assert.ok(payload.account_filters?.credit);
    assert.strictEqual(payload.account_filters?.loan, undefined);
    assert.strictEqual(payload.account_selection, undefined);
    if (prev === undefined) delete process.env.PLAID_LINK_PRODUCTS;
    else process.env.PLAID_LINK_PRODUCTS = prev;
  });

  await test('buildAccountFiltersForProducts adds loan filters with liabilities', () => {
    const { buildAccountFiltersForProducts } = require('../src/services/plaid/plaidService.cjs');
    const filters = buildAccountFiltersForProducts(['transactions', 'liabilities']);
    assert.ok(filters.loan);
  });

  await test('filterPlaidTransactionUpdates blocks amount on plaid txns', () => {
    const tx = { plaid_transaction_id: 'ptx_1' };
    assert.strictEqual(isPlaidImportedTransaction(tx), true);
    const { updates, removed } = filterPlaidTransactionUpdates(tx, {
      amount: 50,
      memo: 'groceries',
    });
    assert.ok(removed.includes('amount'));
    assert.strictEqual(updates.memo, 'groceries');
    assert.strictEqual(updates.amount, undefined);
  });

  await test('sanitizeLinkedItemRow omits access_token', () => {
    const dto = sanitizeLinkedItemRow({
      id: 'item_1',
      user_id: 1,
      access_token: 'access-super-secret',
      institution_name: 'Chase',
      status: 'active',
    });
    assertNoSecrets(dto);
    assert.strictEqual(dto.institution_name, 'Chase');
  });

  await test('peekJwtKidAndAlg reads ES256 kid from JWT-shaped string', () => {
    const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'test-kid', typ: 'JWT' }))
      .toString('base64url');
    const probe = peekJwtKidAndAlg(`${h}.payload.sig`);
    assert.ok(probe);
    assert.strictEqual(probe.kid, 'test-kid');
  });

  await test('timingSafeEqualHex compares hashes in constant time', () => {
    const body = '{"item_id":"x"}';
    const hex = crypto.createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex');
    assert.ok(timingSafeEqualHex(hex, hex));
    const wrongSameLen = `${hex.slice(0, -2)}aa`;
    assert.strictEqual(wrongSameLen.length, hex.length);
    assert.ok(!timingSafeEqualHex(hex, wrongSameLen));
  });

  await test('reapplyPlaidCategoryMapping updates matching transactions', async () => {
    const sqlite3 = require('sqlite3');
    const { open } = require('sqlite');
    const { reapplyPlaidCategoryMapping } = require('../src/services/plaid/plaidCategoryMapping.cjs');
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        plaid_transaction_id TEXT,
        plaid_category_key TEXT,
        category_id INTEGER,
        is_deleted INTEGER DEFAULT 0,
        updated_at TEXT
      );
    `);
    await db.run(
      `INSERT INTO transactions (user_id, plaid_transaction_id, plaid_category_key, category_id)
       VALUES (1, 'tx1', 'FOOD_AND_DRINK:RESTAURANTS', NULL),
              (1, 'tx2', 'OTHER', NULL)`
    );
    const r = await reapplyPlaidCategoryMapping(db, 1, 'FOOD_AND_DRINK:RESTAURANTS', 42);
    assert.strictEqual(r.updated, 1);
    const row = await db.get(`SELECT category_id FROM transactions WHERE plaid_transaction_id = 'tx1'`);
    assert.strictEqual(row.category_id, 42);
    await db.close();
  });

  await test('sanitizeLinkedItemRow includes consent_expires_at', () => {
    const dto = sanitizeLinkedItemRow({
      id: 'item_1',
      user_id: 1,
      access_token: 'secret',
      consent_expires_at: '2026-12-01T00:00:00Z',
    });
    assert.strictEqual(dto.consent_expires_at, '2026-12-01T00:00:00Z');
    assertNoSecrets(dto);
  });

  await test('getPlaidConfig treats development env as configured with production base path', () => {
    const prevEnv = process.env.PLAID_ENV;
    const prevId = process.env.PLAID_CLIENT_ID;
    const prevSecret = process.env.PLAID_SECRET;
    process.env.PLAID_ENV = 'development';
    process.env.PLAID_CLIENT_ID = 'test';
    process.env.PLAID_SECRET = 'test';
    const cfg = getPlaidConfig();
    assert.strictEqual(cfg.configured, true);
    assert.strictEqual(cfg.env, 'development');
    assert.ok(cfg.basePath.includes('production.plaid.com'));
    if (prevEnv === undefined) delete process.env.PLAID_ENV;
    else process.env.PLAID_ENV = prevEnv;
    if (prevId === undefined) delete process.env.PLAID_CLIENT_ID;
    else process.env.PLAID_CLIENT_ID = prevId;
    if (prevSecret === undefined) delete process.env.PLAID_SECRET;
    else process.env.PLAID_SECRET = prevSecret;
  });

  await test('deepLinkToReceivedRedirectUri maps intentflow query to HTTPS redirect', () => {
    const {
      deepLinkToReceivedRedirectUri,
      isPlaidOAuthDeepLink,
    } = require('../src/services/plaid/plaidOAuth.cjs');
    const deep =
      'intentflow://plaid-oauth?oauth_state_id=abc-123';
    const base = 'https://intentflow-6c9b.vercel.app/oauth-callback.html';
    assert.strictEqual(isPlaidOAuthDeepLink(deep), true);
    const received = deepLinkToReceivedRedirectUri(deep, base);
    assert.ok(received.includes('oauth_state_id=abc-123'));
    assert.ok(received.startsWith('https://'));
  });

  await test('getPlaidConfig respects PLAID_ENABLED=false', () => {
    const prev = process.env.PLAID_ENABLED;
    process.env.PLAID_ENABLED = 'false';
    process.env.PLAID_CLIENT_ID = 'test';
    process.env.PLAID_SECRET = 'test';
    const cfg = getPlaidConfig();
    assert.strictEqual(cfg.enabled, false);
    assert.strictEqual(cfg.configured, false);
    if (prev === undefined) delete process.env.PLAID_ENABLED;
    else process.env.PLAID_ENABLED = prev;
  });

  console.log(process.exitCode === 1 ? '\nFailed' : '\nAll passed');
})();
