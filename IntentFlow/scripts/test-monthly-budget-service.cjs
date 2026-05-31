#!/usr/bin/env node
'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const {
  toLocalMonthKey,
  resolveBudgetedForMonth,
  applyMonthBudgetBulk,
  getBudgetMonthSnapshot,
  repairImplicitAssignmentsForMonth,
} = require('../src/services/budget/monthlyBudgetService.cjs');

function test(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}:`, e.message);
    process.exitCode = 1;
  }
}

console.log('monthlyBudgetService');

test('toLocalMonthKey parses YYYY-MM-DD as local calendar month', () => {
  assert.strictEqual(toLocalMonthKey('2026-05-01'), '2026-05-01');
  assert.strictEqual(toLocalMonthKey('2026-04-01'), '2026-04-01');
  assert.strictEqual(toLocalMonthKey(new Date(2026, 4, 28, 12)), '2026-05-01');
});

test('resolveBudgetedForMonth prefers monthly row for current month', () => {
  const cat = { assigned: 0 };
  const mb = { budgeted_amount: 75 };
  assert.strictEqual(resolveBudgetedForMonth(cat, mb, true), 75);
});

test('resolveBudgetedForMonth uses category rollup when month row missing', () => {
  const cat = { assigned: 40 };
  assert.strictEqual(resolveBudgetedForMonth(cat, undefined, true), 40);
});

async function testBulkAssignPersistsAssignedAndAvailable() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE category_groups (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      assigned REAL DEFAULT 0,
      activity REAL DEFAULT 0,
      available REAL DEFAULT 0,
      archived INTEGER DEFAULT 0,
      is_credit_card_payment_category INTEGER DEFAULT 0,
      is_loan_payment_category INTEGER DEFAULT 0,
      group_id TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monthly_budgets (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      month DATE NOT NULL,
      budgeted_amount REAL DEFAULT 0,
      activity_amount REAL DEFAULT 0,
      available_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, month)
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      date TEXT,
      is_transfer INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id, assigned, available)
      VALUES ('c1', 1, 'Groceries', 'g1', 0, 0);
  `);

  const monthKey = toLocalMonthKey(new Date());
  await applyMonthBudgetBulk(db, 1, monthKey, [{ categoryId: 'c1', delta: 120 }], { mode: 'delta' });

  const cat = await db.get('SELECT assigned, available FROM categories WHERE id = ?', ['c1']);
  assert.strictEqual(Number(cat.assigned), 120);
  assert.strictEqual(Number(cat.available), 120);

  const mb = await db.get(
    'SELECT budgeted_amount, available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c1', monthKey]
  );
  assert.strictEqual(Number(mb.budgeted_amount), 120);
  assert.strictEqual(Number(mb.available_amount), 120);

  await applyMonthBudgetBulk(db, 1, monthKey, [{ categoryId: 'c1', delta: 30 }], { mode: 'delta' });
  const cat2 = await db.get('SELECT assigned, available FROM categories WHERE id = ?', ['c1']);
  assert.strictEqual(Number(cat2.assigned), 150);
  assert.strictEqual(Number(cat2.available), 150);

  const snapshot = await getBudgetMonthSnapshot(db, 1, monthKey);
  const row = snapshot.categories.find((c) => c.id === 'c1');
  assert.ok(row, 'category row missing from snapshot');
  assert.strictEqual(Number(row.assigned), 150);
  assert.strictEqual(Number(row.available), 150);

  await db.close();
  console.log('  ok delta bulk assign writes Assigned and derives Available');
}

async function testRepairImplicitAssignments() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      assigned REAL DEFAULT 0,
      activity REAL DEFAULT 0,
      available REAL DEFAULT 0,
      archived INTEGER DEFAULT 0,
      is_credit_card_payment_category INTEGER DEFAULT 0,
      is_loan_payment_category INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monthly_budgets (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      month DATE NOT NULL,
      budgeted_amount REAL DEFAULT 0,
      activity_amount REAL DEFAULT 0,
      available_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, month)
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      date TEXT,
      is_transfer INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    INSERT INTO categories (id, user_id, name) VALUES ('c1', 1, 'Groceries');
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb1', 'c1', '2026-05-01', 0, 0, 200);
  `);

  const result = await repairImplicitAssignmentsForMonth(db, 1, '2026-05-01');
  assert.strictEqual(result.repairs.length, 1);
  assert.strictEqual(result.repairs[0].correctedBudgeted, 200);

  const mb = await db.get(
    'SELECT budgeted_amount, available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c1', '2026-05-01']
  );
  assert.strictEqual(Number(mb.budgeted_amount), 200);
  assert.strictEqual(Number(mb.available_amount), 200);

  await db.close();
  console.log('  ok repair reconstructs missing assignment records from orphan Available');
}

async function testConsolidateAvailableIntoAssignments() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE category_groups (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      group_id TEXT,
      assigned REAL DEFAULT 0,
      activity REAL DEFAULT 0,
      available REAL DEFAULT 0,
      archived INTEGER DEFAULT 0,
      is_credit_card_payment_category INTEGER DEFAULT 0,
      is_loan_payment_category INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monthly_budgets (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      month DATE NOT NULL,
      budgeted_amount REAL DEFAULT 0,
      activity_amount REAL DEFAULT 0,
      available_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, month)
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      date TEXT,
      is_transfer INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    INSERT INTO categories (id, user_id, name) VALUES ('c1', 1, 'Groceries');
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb1', 'c1', '2026-04-01', 0, 0, 150);
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb2', 'c1', '2026-05-01', 0, 0, 150);
  `);

  const { consolidateAvailableIntoMonthAssignments } = require('../src/services/budget/monthlyBudgetService.cjs');
  const result = await consolidateAvailableIntoMonthAssignments(db, 1, '2026-05-01');
  assert.strictEqual(result.conversions.length, 1);
  assert.strictEqual(result.conversions[0].assigned, 150);

  const mb = await db.get(
    'SELECT budgeted_amount, available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c1', '2026-05-01']
  );
  assert.strictEqual(Number(mb.budgeted_amount), 150);
  assert.strictEqual(Number(mb.available_amount), 150);

  await db.close();
  console.log('  ok consolidate converts untraceable Available into Assigned records');
}

async function testReducingAssignedReturnsFundsToRtaPool() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE category_groups (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      group_id TEXT,
      assigned REAL DEFAULT 0,
      activity REAL DEFAULT 0,
      available REAL DEFAULT 0,
      archived INTEGER DEFAULT 0,
      is_credit_card_payment_category INTEGER DEFAULT 0,
      is_loan_payment_category INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monthly_budgets (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      month DATE NOT NULL,
      budgeted_amount REAL DEFAULT 0,
      activity_amount REAL DEFAULT 0,
      available_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, month)
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      date TEXT,
      is_transfer INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id) VALUES ('c1', 1, 'Clothing', 'g1');
  `);

  const monthKey = toLocalMonthKey(new Date());
  const { applyMonthBudgetedAmount } = require('../src/services/budget/monthlyBudgetService.cjs');

  const first = await applyMonthBudgetedAmount(db, 1, 'c1', monthKey, 500);
  assert.strictEqual(first.assigned, 500);
  assert.strictEqual(first.available, 500);

  const second = await applyMonthBudgetedAmount(db, 1, 'c1', monthKey, 300);
  assert.strictEqual(second.assigned, 300);
  assert.strictEqual(second.available, 300);

  const mb = await db.get(
    'SELECT budgeted_amount, available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c1', monthKey]
  );
  assert.strictEqual(Number(mb.budgeted_amount), 300);
  assert.strictEqual(Number(mb.available_amount), 300);

  await db.close();
  console.log('  ok reducing Assigned lowers Available by the same amount (funds return to RTA pool)');
}

(async () => {
  try {
    await testBulkAssignPersistsAssignedAndAvailable();
    await testRepairImplicitAssignments();
    await testConsolidateAvailableIntoAssignments();
    await testReducingAssignedReturnsFundsToRtaPool();
  } catch (e) {
    console.error('  FAIL integration:', e.message);
    process.exitCode = 1;
  }
  console.log(process.exitCode ? '\nFailed' : '\nAll passed');
})();
