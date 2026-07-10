#!/usr/bin/env node
/**
 * Verifies category activity excludes soft-deleted and uncleared transactions.
 */
const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { getCategoryTransactionTotals } = require('../src/shared/categoryAvailableEngine.cjs');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      account_id TEXT,
      category_id TEXT,
      amount REAL,
      date TEXT,
      direction TEXT,
      is_transfer INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      is_cleared INTEGER DEFAULT 1,
      is_reconciled INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      account_status TEXT DEFAULT 'active',
      type TEXT
    );
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
  `);

  const userId = 1;
  const categoryId = 'cat-groceries';
  const month = '2026-06';
  const activeAcct = 'acct-active';
  const inactiveAcct = 'acct-inactive';

  await db.run(
    `INSERT INTO accounts (id, user_id, is_active, account_status, type)
     VALUES (?, ?, 1, 'active', 'checking'), (?, ?, 0, 'active', 'checking')`,
    [activeAcct, userId, inactiveAcct, userId]
  );

  await db.run(
    `INSERT INTO transactions (user_id, account_id, category_id, amount, date, is_cleared)
     VALUES (?, ?, ?, -50, '2026-06-04', 1)`,
    [userId, activeAcct, categoryId]
  );
  await db.run(
    `INSERT INTO transactions (user_id, account_id, category_id, amount, date, is_cleared)
     VALUES (?, ?, ?, -30, '2026-06-05', 0)`,
    [userId, activeAcct, categoryId]
  );
  await db.run(
    `INSERT INTO transactions (user_id, account_id, category_id, amount, date, is_cleared, is_deleted)
     VALUES (?, ?, ?, -20, '2026-06-06', 1, 1)`,
    [userId, activeAcct, categoryId]
  );
  await db.run(
    `INSERT INTO transactions (user_id, account_id, category_id, amount, date, is_cleared)
     VALUES (?, ?, ?, -81.19, '2026-06-02', 1)`,
    [userId, inactiveAcct, categoryId]
  );

  const totals = await getCategoryTransactionTotals(db, userId, categoryId, month);
  assert.strictEqual(totals.spending, 50, 'only cleared, non-deleted spending on active accounts counts');
  assert.strictEqual(totals.activity, 50);

  await db.run('DELETE FROM transactions');
  await db.run(
    `INSERT INTO transactions (user_id, account_id, category_id, amount, direction, date, is_cleared)
     VALUES (?, ?, ?, 100, 'outflow', '2026-06-04', 1)`,
    [userId, activeAcct, categoryId]
  );
  const directionTotals = await getCategoryTransactionTotals(db, userId, categoryId, month);
  assert.strictEqual(
    directionTotals.spending,
    100,
    'direction=outflow with positive amount counts as spending'
  );
  assert.strictEqual(directionTotals.inflows, 0);

  await db.run(
    `UPDATE transactions SET amount = 150, direction = 'outflow' WHERE user_id = ?`,
    [userId]
  );
  const updatedTotals = await getCategoryTransactionTotals(db, userId, categoryId, month);
  assert.strictEqual(
    updatedTotals.spending,
    150,
    'amount edit with direction=outflow updates spending'
  );
  assert.strictEqual(updatedTotals.activity, 150);

  await db.run('DELETE FROM transactions');
  const creditAccountId = 'cc-1';
  const paymentCategoryId = 'cc-pay-1';
  await db.run(
    `INSERT INTO accounts (id, user_id, type, is_active, account_status)
     VALUES (?, ?, 'credit', 1, 'active')`,
    [creditAccountId, userId]
  );
  await db.run(
    `INSERT INTO transactions (user_id, account_id, category_id, amount, date, is_transfer, is_cleared)
     VALUES (?, ?, NULL, 100, '2026-06-10', 1, 0)`,
    [userId, creditAccountId]
  );
  const ccTotals = await getCategoryTransactionTotals(db, userId, paymentCategoryId, month, {
    linkedAccountId: creditAccountId,
  });
  assert.strictEqual(
    ccTotals.cardPayments,
    100,
    'uncleared credit-card payment transfers count toward cardPayments'
  );

  await db.close();
  console.log('category activity filters: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
