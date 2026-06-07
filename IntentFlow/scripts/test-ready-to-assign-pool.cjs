#!/usr/bin/env node
'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { computeGlobalBudgetSummary } = require('../src/shared/readyToAssignEngine.cjs');
const readyToAssignPoolService = require('../src/services/budget/readyToAssignPoolService.cjs');

async function openDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE user_budget_pool (
      user_id TEXT PRIMARY KEY,
      ready_to_assign_balance REAL NOT NULL DEFAULT 0,
      pool_backfilled INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT,
      account_type_category TEXT,
      on_budget INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      balance REAL DEFAULT 0
    );
    CREATE TABLE categories (id TEXT PRIMARY KEY, type TEXT);
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY,
      account_id TEXT,
      user_id TEXT,
      amount REAL,
      category_id TEXT,
      is_transfer INTEGER DEFAULT 0,
      is_adjustment INTEGER DEFAULT 0,
      payee TEXT
    );
    INSERT INTO users (id) VALUES ('u1');
    INSERT INTO categories (id, type) VALUES ('inc', 'income');
    INSERT INTO accounts (id, user_id, type, account_type_category, on_budget, balance)
      VALUES ('chk', 'u1', 'checking', 'budget', 1, 1000);
  `);
  return db;
}

async function testSpendingPreservesPersistedPool() {
  const db = await openDb();
  const userId = 'u1';
  await readyToAssignPoolService.setPoolBalance(db, userId, 100);
  await db.run(
    'UPDATE user_budget_pool SET pool_backfilled = 1 WHERE user_id = ?',
    [userId]
  );

  const rows = [
    { month: '2026-06-01', category_id: 'g', category_name: 'Groceries', budgeted_amount: 200 },
  ];
  const cashBefore = 1000;
  const summaryBefore = computeGlobalBudgetSummary(rows, '2026-06-01', cashBefore, {
    readyToAssignBalance: 100,
  });
  assert.strictEqual(summaryBefore.readyToAssign, 100);

  const cashAfter = 950;
  const summaryAfter = computeGlobalBudgetSummary(rows, '2026-06-01', cashAfter, {
    readyToAssignBalance: 100,
  });
  assert.strictEqual(summaryAfter.readyToAssign, 100, 'RTA pool unchanged after spending');

  const legacyAfter = computeGlobalBudgetSummary(rows, '2026-06-01', cashAfter);
  assert.strictEqual(legacyAfter.readyToAssign, 750, 'legacy cash-assigned formula still drops on spend');
  console.log('  ok persisted RTA pool unchanged when on-budget cash decreases');
}

async function testIncomeIncreasesPool() {
  const db = await openDb();
  const userId = 'u1';
  await readyToAssignPoolService.setPoolBalance(db, userId, 100);
  const account = await db.get('SELECT * FROM accounts WHERE id = ?', ['chk']);
  const tx = {
    account_id: 'chk',
    amount: 50,
    category_id: null,
    is_transfer: 0,
    payee: 'Employer',
  };
  const after = await readyToAssignPoolService.syncPoolForTransaction(db, userId, tx, 'apply');
  assert.strictEqual(after, 150);
  console.log('  ok RTA inflow increases persisted pool');
}

async function testBudgetToTrackingTransferReducesPool() {
  const db = await openDb();
  const userId = 'u1';
  await db.run(
    `INSERT INTO accounts (id, user_id, type, account_type_category, on_budget, balance)
     VALUES ('track', 'u1', 'investment', 'tracking', 0, 0)`
  );
  await readyToAssignPoolService.setPoolBalance(db, userId, 100);
  await db.run(
    'UPDATE user_budget_pool SET pool_backfilled = 1 WHERE user_id = ?',
    [userId]
  );

  const after = await readyToAssignPoolService.syncPoolForTransferPair(
    db,
    userId,
    { sourceAccountId: 'chk', destinationAccountId: 'track', amount: 200 },
    'apply'
  );
  assert.strictEqual(after, -100);

  const restored = await readyToAssignPoolService.syncPoolForTransferPair(
    db,
    userId,
    { sourceAccountId: 'chk', destinationAccountId: 'track', amount: 200 },
    'reverse'
  );
  assert.strictEqual(restored, 100);
  console.log('  ok budget-to-tracking transfer reduces RTA pool');
}

async function testCheckingToSavingsTransferPreservesPool() {
  const db = await openDb();
  const userId = 'u1';
  await db.run(
    `INSERT INTO accounts (id, user_id, type, account_type_category, on_budget, balance)
     VALUES ('sav', 'u1', 'savings', 'budget', 1, 500)`
  );
  await readyToAssignPoolService.setPoolBalance(db, userId, 100);

  const after = await readyToAssignPoolService.syncPoolForTransferPair(
    db,
    userId,
    { sourceAccountId: 'chk', destinationAccountId: 'sav', amount: 200 },
    'apply'
  );
  assert.strictEqual(after, 100);
  console.log('  ok checking-to-savings transfer leaves RTA pool unchanged');
}

async function testIncomeCategoryIncreasesPool() {
  const db = await openDb();
  const userId = 'u1';
  await readyToAssignPoolService.setPoolBalance(db, userId, 100);
  const tx = {
    account_id: 'chk',
    amount: 75,
    category_id: 'inc',
    is_transfer: 0,
    payee: 'Paycheck',
  };
  const after = await readyToAssignPoolService.syncPoolForTransaction(db, userId, tx, 'apply');
  assert.strictEqual(after, 175);
  console.log('  ok income-type category inflow increases persisted pool');
}

async function testReconciliationAdjustmentMutatesPool() {
  const db = await openDb();
  const userId = 'u1';
  await readyToAssignPoolService.setPoolBalance(db, userId, 100);
  const positive = {
    account_id: 'chk',
    amount: 25,
    category_id: null,
    is_transfer: 0,
    is_adjustment: 1,
    payee: 'Reconciliation Adjustment',
  };
  const afterPositive = await readyToAssignPoolService.syncPoolForTransaction(
    db,
    userId,
    positive,
    'apply'
  );
  assert.strictEqual(afterPositive, 125);

  const negative = {
    account_id: 'chk',
    amount: -10,
    category_id: null,
    is_transfer: 0,
    is_adjustment: 1,
    payee: 'Reconciliation Adjustment',
  };
  const afterNegative = await readyToAssignPoolService.syncPoolForTransaction(
    db,
    userId,
    negative,
    'apply'
  );
  assert.strictEqual(afterNegative, 115);
  console.log('  ok reconciliation adjustments mutate persisted pool');
}

async function openProductionSchemaDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT,
      group_id TEXT
    );
    CREATE TABLE category_groups (
      id TEXT PRIMARY KEY,
      name TEXT
    );
    INSERT INTO category_groups (id, name) VALUES ('g-inc', 'Income');
    INSERT INTO category_groups (id, name) VALUES ('g-exp', 'Monthly Expenses');
    INSERT INTO categories (id, name, group_id) VALUES ('paycheck', 'Paycheck', 'g-inc');
    INSERT INTO categories (id, name, group_id) VALUES ('groceries', 'Groceries', 'g-exp');
  `);
  return db;
}

async function testIsIncomeTypeCategoryProductionSchema() {
  const db = await openProductionSchemaDb();
  assert.strictEqual(await readyToAssignPoolService.isIncomeTypeCategory(db, 'paycheck'), true);
  assert.strictEqual(await readyToAssignPoolService.isIncomeTypeCategory(db, 'groceries'), false);
  assert.strictEqual(readyToAssignPoolService.categoryLooksLikeIncome('Side Income', null), true);
  console.log('  ok isIncomeTypeCategory uses category name/group (no categories.type column)');
}

async function testCategorizedRefundDoesNotMutatePool() {
  const db = await openProductionSchemaDb();
  await db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE user_budget_pool (
      user_id TEXT PRIMARY KEY,
      ready_to_assign_balance REAL NOT NULL DEFAULT 0,
      pool_backfilled INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT,
      account_type_category TEXT,
      on_budget INTEGER DEFAULT 1,
      balance REAL DEFAULT 0
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY,
      account_id TEXT,
      amount REAL,
      category_id TEXT,
      is_transfer INTEGER DEFAULT 0,
      is_adjustment INTEGER DEFAULT 0,
      payee TEXT
    );
    INSERT INTO users (id) VALUES ('u1');
    INSERT INTO accounts (id, user_id, type, account_type_category, on_budget, balance)
      VALUES ('chk', 'u1', 'checking', 'budget', 1, 1000);
  `);
  const userId = 'u1';
  await readyToAssignPoolService.setPoolBalance(db, userId, 500);
  await db.run('UPDATE user_budget_pool SET pool_backfilled = 1 WHERE user_id = ?', [userId]);

  const refund = {
    account_id: 'chk',
    amount: 50,
    category_id: 'groceries',
    is_transfer: 0,
    payee: 'Grocery Refund',
  };
  const after = await readyToAssignPoolService.syncPoolForTransaction(db, userId, refund, 'apply');
  assert.strictEqual(after, 500, 'categorized expense refund must not mutate RTA pool');
  console.log('  ok categorized grocery refund does not mutate RTA pool');
}

async function testAssignmentMovesFundsBetweenPoolAndCategory() {
  const db = await openDb();
  const userId = 'u1';
  await readyToAssignPoolService.setPoolBalance(db, userId, 300);
  const afterAssign = await readyToAssignPoolService.applyAssignmentPoolDelta(db, userId, 0, 200);
  assert.strictEqual(afterAssign, 100);
  const afterUnassign = await readyToAssignPoolService.applyAssignmentPoolDelta(db, userId, 200, 0);
  assert.strictEqual(afterUnassign, 300);
  console.log('  ok assignment deltas move funds between RTA pool and categories');
}

async function main() {
  await testSpendingPreservesPersistedPool();
  await testIncomeIncreasesPool();
  await testIncomeCategoryIncreasesPool();
  await testReconciliationAdjustmentMutatesPool();
  await testBudgetToTrackingTransferReducesPool();
  await testCheckingToSavingsTransferPreservesPool();
  await testIsIncomeTypeCategoryProductionSchema();
  await testCategorizedRefundDoesNotMutatePool();
  await testAssignmentMovesFundsBetweenPoolAndCategory();
  console.log('✅ test-ready-to-assign-pool passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
