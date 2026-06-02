#!/usr/bin/env node
/**
 * Smoke tests for payee normalization and category rule learning (FR-1–FR-10).
 */
const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const {
  normalizeMerchantKey,
  normalizePayeeDisplayName,
} = require('../src/services/transactions/payeeNormalization.cjs');
const { CategoryRuleService } = require('../src/services/transactions/categoryRuleService.cjs');
const {
  PAYEE_CATEGORY_MODES,
  setPayeeCategoryMode,
} = require('../src/services/transactions/payeeCategoryMode.cjs');

assert.strictEqual(normalizePayeeDisplayName('STARBUCKS #1234'), 'Starbucks');
assert.strictEqual(normalizePayeeDisplayName('STARBUCKS STORE 888'), 'Starbucks');
assert.strictEqual(normalizeMerchantKey('STARBUCKS #1234'), 'starbucks');
assert.strictEqual(normalizeMerchantKey('STARBUCKS STORE 888'), 'starbucks');

async function runDbTests() {
  const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE user_settings (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, key)
    );
    CREATE TABLE payee_category_rule_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      payee_id TEXT NOT NULL,
      previous_category_id TEXT,
      new_category_id TEXT,
      change_source TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE payees (
      id TEXT PRIMARY KEY, user_id INTEGER, name TEXT, normalized_name TEXT,
      is_transfer_payee INTEGER DEFAULT 0, usage_count INTEGER DEFAULT 0,
      last_used_date INTEGER, created_at INTEGER
    );
    CREATE TABLE category_rules (
      id TEXT PRIMARY KEY, user_id INTEGER, payee_id TEXT, default_category_id TEXT,
      confirmation_count INTEGER, confidence_score REAL, auto_apply INTEGER,
      created_at TEXT, updated_at TEXT
    );
  `);

  const userId = 1;
  const payeeId = 'payee-starbucks';
  const diningId = 'cat-dining';
  const coffeeId = 'cat-coffee';

  await db.run(`INSERT INTO payees (id, user_id, name, normalized_name) VALUES (?, ?, ?, ?)`, [
    payeeId,
    userId,
    'Starbucks',
    'starbucks',
  ]);

  const rules = new CategoryRuleService(3);

  await rules.recordCategorization(userId, payeeId, diningId, { db });
  let suggestion = await rules.suggestCategory(userId, payeeId, db);
  assert.strictEqual(suggestion.source, 'rule');
  assert.strictEqual(suggestion.categoryId, diningId);
  assert.strictEqual(suggestion.needsReview, true);

  await rules.recordCategorization(userId, payeeId, coffeeId, { db });
  const ruleRow = await rules.getRuleForPayee(db, userId, payeeId);
  assert.strictEqual(ruleRow.default_category_id, coffeeId);
  assert.strictEqual(ruleRow.confirmation_count, 1);

  const auditCount = await db.get(
    `SELECT COUNT(*) AS n FROM payee_category_rule_audit WHERE payee_id = ?`,
    [payeeId]
  );
  assert.strictEqual(auditCount.n, 1);

  await setPayeeCategoryMode(db, userId, PAYEE_CATEGORY_MODES.ASSIGN);
  for (let i = 0; i < 2; i++) {
    await rules.recordCategorization(userId, payeeId, coffeeId, { db });
  }
  suggestion = await rules.suggestCategory(userId, payeeId, db);
  assert.strictEqual(suggestion.source, 'auto_rule');
  assert.strictEqual(suggestion.needsReview, false);

  await db.close();
  console.log('✅ transaction categorization tests passed');
}

runDbTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
