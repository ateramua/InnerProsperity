#!/usr/bin/env node
'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const {
  isEligibleBudgetCreditCardAccount,
  buildCreditCardPaymentCategoryName,
  categoryNameMatchesAccount,
  ensureCreditCardPaymentCategoryForAccount,
  archiveCreditCardPaymentCategoryForAccount,
  syncCreditCardPaymentCategoriesForUser,
} = require('../src/services/accounts/creditCardPaymentCategoryService.cjs');

async function setupDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE category_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, sort_order INTEGER DEFAULT 0,
      system_managed INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, user_id INTEGER, name TEXT, group_id TEXT,
      assigned REAL DEFAULT 0, target_type TEXT, target_amount REAL, target_date TEXT,
      is_credit_card_payment_category INTEGER DEFAULT 0, linked_account_id TEXT,
      priority INTEGER DEFAULT 2, archived INTEGER DEFAULT 0, archived_at TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, user_id INTEGER, name TEXT, type TEXT,
      account_type_category TEXT, is_active INTEGER DEFAULT 1,
      account_status TEXT DEFAULT 'active', merged_into_account_id TEXT,
      paired_category_id TEXT, created_at TEXT, updated_at TEXT
    );
  `);
  return db;
}

async function main() {
  const db = await setupDb();

  const active = {
    id: 'acc-1',
    user_id: 1,
    name: 'Chase Sapphire',
    type: 'credit',
    account_type_category: 'credit',
    is_active: 1,
    account_status: 'active',
    merged_into_account_id: null,
    paired_category_id: null,
  };
  assert.strictEqual(isEligibleBudgetCreditCardAccount(active), true);
  assert.strictEqual(
    isEligibleBudgetCreditCardAccount({ ...active, account_type_category: 'tracking' }),
    false
  );
  assert.strictEqual(buildCreditCardPaymentCategoryName('Chase Sapphire'), 'Chase Sapphire');
  assert.strictEqual(
    categoryNameMatchesAccount('Chase Sapphire Payment', 'Chase Sapphire'),
    true
  );

  await db.run(
    `INSERT INTO accounts (id, user_id, name, type, account_type_category, is_active, account_status)
     VALUES (?, 1, ?, 'credit', 'credit', 1, 'active')`,
    [active.id, active.name]
  );

  const cat = await ensureCreditCardPaymentCategoryForAccount(db, active);
  assert.ok(cat);
  assert.strictEqual(cat.name, 'Chase Sapphire');
  assert.strictEqual(cat.linked_account_id, active.id);

  const row = await db.get('SELECT paired_category_id FROM accounts WHERE id = ?', [active.id]);
  assert.strictEqual(row.paired_category_id, cat.id);

  await db.run(
    `UPDATE accounts SET name = 'Chase Sapphire Preferred' WHERE id = ?`,
    [active.id]
  );
  const renamed = await db.get('SELECT * FROM accounts WHERE id = ?', [active.id]);
  const cat2 = await ensureCreditCardPaymentCategoryForAccount(db, renamed);
  assert.strictEqual(cat2.name, 'Chase Sapphire Preferred');

  await db.run(`UPDATE accounts SET is_active = 0 WHERE id = ?`, [active.id]);
  const inactive = await db.get('SELECT * FROM accounts WHERE id = ?', [active.id]);
  await archiveCreditCardPaymentCategoryForAccount(db, inactive);
  const archivedCat = await db.get('SELECT archived FROM categories WHERE id = ?', [cat.id]);
  assert.strictEqual(archivedCat.archived, 1);

  await db.run(
    `INSERT INTO accounts (id, user_id, name, type, account_type_category, is_active, account_status)
     VALUES ('acc-2', 1, 'Amex Blue', 'credit', 'credit', 1, 'active')`
  );
  const sync = await syncCreditCardPaymentCategoriesForUser(db, 1, { reason: 'test' });
  assert.ok(sync.categoriesEnsured >= 1);

  console.log('✅ test-credit-card-payment-category-service passed');
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
