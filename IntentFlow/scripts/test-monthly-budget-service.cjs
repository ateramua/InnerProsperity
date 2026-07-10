#!/usr/bin/env node
'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const {
  toLocalMonthKey,
  resolveBudgetedForMonth,
  applyMonthBudgetBulk,
  applyMonthBudgetBulkAndRefresh,
  getBudgetMonthSnapshot,
  repairImplicitAssignmentsForMonth,
  getCategoryActivityTransactionIds,
  applyMonthBudgetedAmount,
  getGlobalBudgetSummary,
  refreshBudgetMonthsForward,
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

test('resolveBudgetedForMonth uses monthly_budgets row only', () => {
  const mb = { budgeted_amount: 75 };
  assert.strictEqual(resolveBudgetedForMonth(null, mb, true), 75);
});

test('resolveBudgetedForMonth returns 0 when month row missing', () => {
  const cat = { assigned: 40 };
  assert.strictEqual(resolveBudgetedForMonth(cat, undefined, true), 0);
});

test('resolveBudgetedForMonth ignores stale category rollup', () => {
  const cat = { assigned: 5000 };
  const mb = { budgeted_amount: 1437.51 };
  assert.strictEqual(resolveBudgetedForMonth(cat, mb, true), 1437.51);
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
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
  assert.strictEqual(result.repairs[0].type, 'realign_available');
  assert.strictEqual(result.repairs[0].correctedAvailable, 0);

  const mb = await db.get(
    'SELECT budgeted_amount, available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c1', '2026-05-01']
  );
  assert.strictEqual(Number(mb.budgeted_amount), 0);
  assert.strictEqual(Number(mb.available_amount), 0);

  await db.close();
  console.log('  ok repair realigns orphan Available without inflating Assigned');
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO categories (id, user_id, name) VALUES ('c1', 1, 'Groceries');
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb1', 'c1', '2026-04-01', 0, 0, 150);
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb2', 'c1', '2026-05-01', 0, 0, 150);
  `);

  const { consolidateAvailableIntoMonthAssignments } = require('../src/services/budget/monthlyBudgetService.cjs');
  const result = await consolidateAvailableIntoMonthAssignments(db, 1, '2026-05-01', {
    userIntentAssignment: true,
  });
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

async function testGlobalSummaryDoesNotAutoClearAssigned() {
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
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id) VALUES ('c1', 1, 'Groceries', 'g1');
    INSERT INTO categories (id, user_id, name, group_id) VALUES ('c2', 1, 'Rent', 'g1');
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb1', 'c1', '2026-05-01', 4000, 0, 4000);
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb2', 'c2', '2026-06-01', 3000, 0, 3000);
  `);

  const { getGlobalBudgetSummary, releasePhantomImplicitAssignments } = require('../src/services/budget/monthlyBudgetService.cjs');
  const cash = 5000;
  const summary = await getGlobalBudgetSummary(db, 1, cash, { autoHealPhantomAssignments: true });
  assert.strictEqual(summary.totalAssigned, 7000);
  assert.strictEqual(summary.readyToAssign, -2000);

  const heal = await releasePhantomImplicitAssignments(db, 1);
  assert.strictEqual(heal.released, 0);
  assert.ok(heal.skipped);

  const rows = await db.all(
    'SELECT budgeted_amount FROM monthly_budgets WHERE category_id IN (?, ?)',
    ['c1', 'c2']
  );
  for (const row of rows) {
    assert.ok(Number(row.budgeted_amount) > 0);
  }

  await db.close();
  console.log('  ok global summary never auto-clears Assigned (phantom heal disabled)');
}

async function testAssignedPreservedAfterActivityRefresh() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const monthKey = toLocalMonthKey(new Date());
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE category_groups (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
    INSERT INTO category_groups (id, user_id, name) VALUES ('g1', 1, 'Essentials');
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      average_spending REAL DEFAULT 0,
      target_amount REAL DEFAULT 0,
      target_type TEXT,
      target_frequency TEXT,
      target_date TEXT
    );
    INSERT INTO categories (id, user_id, name, group_id) VALUES ('c1', 1, 'Groceries', 'g1');
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
      is_transfer INTEGER DEFAULT 0,
      direction TEXT
    );
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    INSERT INTO accounts (id, user_id, type) VALUES ('a1', 1, 'checking');
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await applyMonthBudgetedAmount(db, 1, 'c1', monthKey, 250, { auditSource: 'assign' });
  const txDate = `${monthKey.slice(0, 8)}15`;
  await db.run(
    `INSERT INTO transactions (account_id, user_id, category_id, amount, date)
     VALUES ('a1', 1, 'c1', -50, ?)`,
    [txDate]
  );
  await refreshBudgetMonthsForward(db, 1, monthKey, 1);

  const mb = await db.get(
    'SELECT budgeted_amount, activity_amount, available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c1', monthKey]
  );
  assert.strictEqual(Number(mb.budgeted_amount), 250);
  assert.strictEqual(Number(mb.activity_amount), 50);
  assert.strictEqual(Number(mb.available_amount), 200);

  const summary = await getGlobalBudgetSummary(db, 1, 10000);
  assert.strictEqual(summary.totalAssigned, 250);
  assert.strictEqual(summary.readyToAssign, 9750);

  await db.close();
  console.log('  ok Assigned preserved after transaction activity refresh');
}

async function testAutomatedAssignmentChangeRejected() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const monthKey = toLocalMonthKey(new Date());
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
    INSERT INTO categories (id, user_id, name) VALUES ('c1', 1, 'Groceries');
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb1', 'c1', '${monthKey}', 500, 0, 500);
  `);

  let rejected = false;
  try {
    await applyMonthBudgetedAmount(db, 1, 'c1', monthKey, 0, {
      auditSource: 'heal_phantom_assign',
    });
  } catch (err) {
    rejected = err.code === 'ASSIGNMENT_CHANGE_NOT_USER_INTENT';
  }
  assert.ok(rejected, 'phantom heal source must not clear Assigned');

  const mb = await db.get(
    'SELECT budgeted_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c1', monthKey]
  );
  assert.strictEqual(Number(mb.budgeted_amount), 500);

  await db.close();
  console.log('  ok automated assignment mutations are rejected');
}


async function testBulkAssignInsideOpenTransaction() {
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id) VALUES ('c1', 1, 'Groceries', 'g1');
  `);

  const monthKey = toLocalMonthKey(new Date());
  await db.exec('BEGIN');
  try {
    const result = await applyMonthBudgetBulk(
      db,
      1,
      monthKey,
      [{ categoryId: 'c1', delta: 25 }],
      { mode: 'delta', totalCash: 10000, auditSource: 'fund_underfunded' }
    );
    assert.strictEqual(result.assignments.length, 1);
    assert.strictEqual(result.assignments[0].assigned, 25);
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  await db.close();
  console.log('  ok bulk assign works inside an open transaction (Fund Underfunded path)');
}

async function testFundUnderfundedNotClearedByGlobalSummary() {
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
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id) VALUES ('c1', 1, 'Vacation', 'g1');
  `);

  const monthKey = '2026-06-01';
  const { getGlobalBudgetSummary, findPhantomImplicitAssignmentRows } = require('../src/services/budget/monthlyBudgetService.cjs');

  await applyMonthBudgetBulk(db, 1, monthKey, [{ categoryId: 'c1', delta: 500 }], {
    mode: 'delta',
    totalCash: 10000,
    auditSource: 'fund_underfunded',
  });

  const mb = await db.get(
    'SELECT budgeted_amount, available_amount, activity_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c1', monthKey]
  );
  assert.strictEqual(Number(mb.budgeted_amount), 500);
  assert.strictEqual(Number(mb.available_amount), 500);
  assert.strictEqual(Number(mb.activity_amount), 0);

  const phantoms = await findPhantomImplicitAssignmentRows(db, 1);
  assert.strictEqual(phantoms.length, 0);

  const summary = await getGlobalBudgetSummary(db, 1, 10000);
  assert.strictEqual(summary.totalAssigned, 500);
  assert.strictEqual(summary.readyToAssign, 9500);

  const mbAfter = await db.get(
    'SELECT budgeted_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c1', monthKey]
  );
  assert.strictEqual(Number(mbAfter.budgeted_amount), 500);

  await db.close();
  console.log('  ok fund_underfunded assignments survive global summary (not treated as phantom)');
}

async function testConcurrentBulkAssignNoSavepointError() {
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
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id) VALUES ('c1', 1, 'Groceries', 'g1');
    INSERT INTO categories (id, user_id, name, group_id) VALUES ('c2', 1, 'Dining', 'g1');
  `);

  const monthKey = toLocalMonthKey(new Date());
  const opts = { mode: 'delta', totalCash: 50000, auditSource: 'fund_underfunded', forwardMonths: 2 };

  const results = await Promise.allSettled([
    applyMonthBudgetBulkAndRefresh(db, 1, monthKey, [{ categoryId: 'c1', delta: 10 }], opts),
    applyMonthBudgetBulkAndRefresh(db, 1, monthKey, [{ categoryId: 'c2', delta: 15 }], opts),
    getBudgetMonthSnapshot(db, 1, monthKey),
    getBudgetMonthSnapshot(db, 1, monthKey),
  ]);

  for (const r of results) {
    if (r.status === 'rejected') {
      const msg = String(r.reason?.message || r.reason);
      assert.ok(!msg.toLowerCase().includes('no such savepoint'), msg);
    }
  }

  const c1 = await db.get('SELECT assigned FROM categories WHERE id = ?', ['c1']);
  const c2 = await db.get('SELECT assigned FROM categories WHERE id = ?', ['c2']);
  assert.ok(Number(c1.assigned) > 0 || Number(c2.assigned) > 0);

  await db.close();
  console.log('  ok concurrent bulk assign + snapshots do not hit missing savepoint');
}

async function testCategoryActivityTransactionIds() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const monthKey = '2026-06-01';
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE categories (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT);
    INSERT INTO categories (id, user_id, name) VALUES ('c1', 1, 'Groceries');
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      date TEXT,
      is_transfer INTEGER DEFAULT 0
    );
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT NOT NULL,
      amount REAL NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
    INSERT INTO transactions (id, user_id, category_id, amount, date, is_transfer)
      VALUES (1, 1, 'c1', -50, '2026-06-10', 0);
    INSERT INTO transactions (id, user_id, category_id, amount, date, is_transfer)
      VALUES (2, 1, 'c1', -20, '2026-06-15', 0);
    INSERT INTO transactions (id, user_id, category_id, amount, date, is_transfer)
      VALUES (3, 1, 'c1', -10, '2026-05-15', 0);
    INSERT INTO transactions (id, user_id, category_id, amount, date, is_transfer)
      VALUES (4, 1, NULL, 100, '2026-06-20', 0);
    INSERT INTO transactions (id, user_id, category_id, amount, date, is_transfer)
      VALUES (5, 1, 'c1', -30, '2026-06-22', 1);
    INSERT INTO transactions (id, user_id, category_id, amount, date, is_transfer)
      VALUES (6, 1, NULL, -80, '2026-06-18', 0);
    INSERT INTO transaction_splits (id, transaction_id, user_id, category_id, amount, sort_order)
      VALUES ('s1', '6', 1, 'c1', 40, 0);
  `);

  const ids = await getCategoryActivityTransactionIds(db, 1, 'c1', monthKey);
  assert.deepStrictEqual(ids.sort(), ['1', '2', '6']);

  const rtaIds = await getCategoryActivityTransactionIds(
    db,
    1,
    'inflow_ready_to_assign',
    monthKey
  );
  assert.deepStrictEqual(rtaIds, ['4']);

  await db.close();
  console.log('  ok getCategoryActivityTransactionIds (direct, split, month, RTA, no transfer)');
}

async function testCategoryToCategoryMoveDoesNotRequireRta() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const monthKey = toLocalMonthKey(new Date());
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id, assigned, available)
      VALUES ('c1', 1, 'Source', 'g1', 0, 0),
             ('c2', 1, 'Dest', 'g1', 0, 0);
  `);

  const totalCash = 10000;
  await applyMonthBudgetedAmount(db, 1, 'c1', monthKey, 5000);
  await applyMonthBudgetedAmount(db, 1, 'c2', monthKey, 3394);

  const summary = await getGlobalBudgetSummary(db, 1, totalCash);
  const moveAmount = 3562.49;
  assert.ok(
    summary.readyToAssign + 0.005 < moveAmount,
    'test setup: RTA must be less than move amount'
  );

  await applyMonthBudgetBulk(
    db,
    1,
    monthKey,
    [
      { categoryId: 'c1', delta: -moveAmount },
      { categoryId: 'c2', delta: moveAmount },
    ],
    { mode: 'delta', totalCash, auditSource: 'move_money' }
  );

  const c1 = await db.get('SELECT assigned FROM categories WHERE id = ?', ['c1']);
  const c2 = await db.get('SELECT assigned FROM categories WHERE id = ?', ['c2']);
  assert.strictEqual(Number(c1.assigned), 1437.51);
  assert.strictEqual(Number(c2.assigned), 6956.49);

  await db.close();
  console.log('  ok category-to-category move does not require Ready to Assign');
}

async function testCategoryMovePreservesReadyToAssign() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const monthKey = toLocalMonthKey(new Date());
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id, assigned, available)
      VALUES ('c1', 1, 'Source', 'g1', 0, 0),
             ('c2', 1, 'Dest', 'g1', 0, 0),
             ('c3', 1, 'Drift', 'g1', 250, 0);
  `);

  const totalCash = 20000;
  await applyMonthBudgetedAmount(db, 1, 'c1', monthKey, 5000);
  await applyMonthBudgetedAmount(db, 1, 'c2', monthKey, 1000);
  await applyMonthBudgetedAmount(db, 1, 'c3', monthKey, 50);
  await db.run(
    `UPDATE categories SET assigned = 250 WHERE id = 'c3'`
  );

  const before = await getGlobalBudgetSummary(db, 1, totalCash);
  const moveAmount = 500;

  await applyMonthBudgetBulkAndRefresh(
    db,
    1,
    monthKey,
    [
      { categoryId: 'c1', delta: -moveAmount },
      { categoryId: 'c2', delta: moveAmount },
    ],
    { mode: 'delta', totalCash, auditSource: 'move_money' }
  );

  const after = await getGlobalBudgetSummary(db, 1, totalCash);
  assert.ok(
    Math.abs(after.readyToAssign - before.readyToAssign) <= 0.02,
    `RTA should be unchanged (before=${before.readyToAssign}, after=${after.readyToAssign})`
  );
  assert.ok(
    Math.abs(after.totalAssigned - before.totalAssigned) <= 0.02,
    `totalAssigned should be unchanged (before=${before.totalAssigned}, after=${after.totalAssigned})`
  );

  const driftMb = await db.get(
    'SELECT budgeted_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c3', monthKey]
  );
  assert.strictEqual(
    Number(driftMb.budgeted_amount),
    50,
    'unrelated category budgeted_amount must not inflate from drift heal'
  );

  await db.close();
  console.log('  ok category move preserves Ready to Assign');
}

async function testReadyToAssignToOverspentCategory() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const monthKey = toLocalMonthKey(new Date());
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id, assigned, available)
      VALUES ('c1', 1, 'Overspent', 'g1', 0, 0);
    INSERT INTO accounts (id, user_id, type) VALUES ('a1', 1, 'checking');
    INSERT INTO transactions (account_id, user_id, category_id, amount, date)
      VALUES ('a1', 1, 'c1', -100, '${monthKey}');
  `);

  const totalCash = 500;
  const before = await getGlobalBudgetSummary(db, 1, totalCash);
  assert.strictEqual(before.readyToAssign, 500);

  await applyMonthBudgetBulkAndRefresh(
    db,
    1,
    monthKey,
    [{ categoryId: 'c1', delta: 50 }],
    { mode: 'delta', totalCash, auditSource: 'move_money' }
  );

  const cat = await db.get('SELECT assigned, available FROM categories WHERE id = ?', ['c1']);
  assert.strictEqual(Number(cat.assigned), 50);
  assert.ok(Number(cat.available) < -40 && Number(cat.available) > -60, 'available should be ~-50');

  const after = await getGlobalBudgetSummary(db, 1, totalCash);
  assert.strictEqual(after.readyToAssign, 450);

  let rejected = false;
  try {
    await applyMonthBudgetBulk(
      db,
      1,
      monthKey,
      [{ categoryId: 'c1', delta: 500 }],
      { mode: 'delta', totalCash, auditSource: 'move_money' }
    );
  } catch (err) {
    rejected = err.code === 'INSUFFICIENT_RTA';
  }
  assert.ok(rejected, 'assigning more than RTA from pool must fail');

  await db.close();
  console.log('  ok Ready to Assign can fund overspent category');
}

async function testFundUnderfundedForMonthAppliesDeltas() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const monthKey = toLocalMonthKey(new Date());
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE user_budget_pool (
      user_id INTEGER PRIMARY KEY,
      ready_to_assign_balance REAL NOT NULL DEFAULT 0,
      pool_backfilled INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO user_budget_pool (user_id, ready_to_assign_balance, pool_backfilled)
      VALUES (1, 1000, 1);
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
      target_amount REAL DEFAULT 0,
      target_type TEXT,
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
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      date TEXT,
      direction TEXT,
      is_transfer INTEGER DEFAULT 0
    );
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id, assigned, available, target_amount, target_type)
      VALUES ('c-overspent', 1, 'Overspent', 'g1', 0, -80, 0, NULL);
    INSERT INTO categories (id, user_id, name, group_id, assigned, available, target_amount, target_type)
      VALUES ('c-goal', 1, 'Vacation', 'g1', 30, 30, 100, 'monthly');
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb1', 'c-overspent', '${monthKey}', 0, 80, -80);
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb2', 'c-goal', '${monthKey}', 30, 0, 30);
    INSERT INTO accounts (id, user_id, type) VALUES ('a1', 1, 'checking');
    INSERT INTO transactions (account_id, user_id, category_id, amount, date, direction)
      VALUES ('a1', 1, 'c-overspent', 80, '${monthKey}', 'outflow');
  `);

  const { fundUnderfundedForMonth } = require('../src/services/budget/monthlyBudgetService.cjs');

  const dryRun = await fundUnderfundedForMonth(db, 1, monthKey, { dryRun: true, totalCash: 1000 });
  assert.strictEqual(dryRun.plan.totalToAssign, 150);
  assert.strictEqual(dryRun.assignments.length, 0);
  const mbDry = await db.get(
    'SELECT budgeted_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c-overspent', monthKey]
  );
  assert.strictEqual(Number(mbDry.budgeted_amount), 0, 'dryRun must not mutate assigned');

  const result = await fundUnderfundedForMonth(db, 1, monthKey, { totalCash: 1000 });
  assert.strictEqual(result.plan.totalToAssign, 150);
  assert.strictEqual(result.assignments.length, 2);
  assert.strictEqual(result.readyToAssignDelta, -150);

  const overspentMb = await db.get(
    'SELECT budgeted_amount, available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c-overspent', monthKey]
  );
  assert.strictEqual(Number(overspentMb.budgeted_amount), 80);
  assert.strictEqual(Number(overspentMb.available_amount), 0);

  const goalMb = await db.get(
    'SELECT budgeted_amount, available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c-goal', monthKey]
  );
  assert.strictEqual(Number(goalMb.budgeted_amount), 100);
  assert.strictEqual(Number(goalMb.available_amount), 100);

  const pool = await db.get('SELECT ready_to_assign_balance FROM user_budget_pool WHERE user_id = 1');
  assert.strictEqual(Number(pool.ready_to_assign_balance), 850);

  assert.ok(
    Number(result.snapshot.underfundedTotal) <= 0.02,
    `underfunded should clear after funding, got ${result.snapshot.underfundedTotal}`
  );

  await db.close();
  console.log('  ok fundUnderfundedForMonth applies delta assignments and syncs RTA');
}

async function testFundUnderfundedSucceedsWithPreExistingInvariantDrift() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const monthKey = toLocalMonthKey(new Date());
  const budgetIntegrityService = require('../src/services/budget/budgetIntegrityService.cjs');
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE user_budget_pool (
      user_id INTEGER PRIMARY KEY,
      ready_to_assign_balance REAL NOT NULL DEFAULT 0,
      pool_backfilled INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO user_budget_pool (user_id, ready_to_assign_balance, pool_backfilled)
      VALUES (1, 1000, 1);
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
      target_amount REAL DEFAULT 0,
      target_type TEXT,
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
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      date TEXT,
      direction TEXT,
      is_transfer INTEGER DEFAULT 0
    );
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT,
      account_type_category TEXT DEFAULT 'budget',
      on_budget INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      account_status TEXT DEFAULT 'active',
      balance REAL DEFAULT 0,
      working_balance REAL DEFAULT 1000
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id, assigned, available, target_amount, target_type)
      VALUES ('c-overspent', 1, 'Overspent', 'g1', 0, -80, 0, NULL);
    INSERT INTO categories (id, user_id, name, group_id, assigned, available, target_amount, target_type)
      VALUES ('c-goal', 1, 'Vacation', 'g1', 30, 30, 100, 'monthly');
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb1', 'c-overspent', '${monthKey}', 0, 80, -80);
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb2', 'c-goal', '${monthKey}', 30, 0, 30);
    INSERT INTO accounts (id, user_id, type, working_balance) VALUES ('a1', 1, 'checking', 1000);
    INSERT INTO transactions (account_id, user_id, category_id, amount, date, direction)
      VALUES ('a1', 1, 'c-overspent', 80, '${monthKey}', 'outflow');
  `);

  const before = await budgetIntegrityService.evaluateBudgetIdentity(db, 1, { monthKey });
  assert.strictEqual(before.invariantValid, false, 'pre-existing drift must be present');
  assert.ok(Math.abs(before.budgetInvariantDelta) > 0.02);

  const { fundUnderfundedForMonth } = require('../src/services/budget/monthlyBudgetService.cjs');
  const result = await fundUnderfundedForMonth(db, 1, monthKey, { totalCash: 1000 });
  assert.strictEqual(result.plan.totalToAssign, 150);

  const after = await budgetIntegrityService.evaluateBudgetIdentity(db, 1, { monthKey });
  assert.strictEqual(
    Math.abs(after.budgetInvariantDelta - before.budgetInvariantDelta) < 0.05,
    true,
    'fund underfunded must not worsen pre-existing invariant drift'
  );

  await db.close();
  console.log('  ok fundUnderfundedForMonth succeeds with pre-existing invariant drift');
}

async function testUnassignCategoryReleasesManualAssignedWhenMonthRowIsZero() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const monthKey = toLocalMonthKey(new Date());
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE user_budget_pool (
      user_id INTEGER PRIMARY KEY,
      ready_to_assign_balance REAL NOT NULL DEFAULT 0,
      pool_backfilled INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO user_budget_pool (user_id, ready_to_assign_balance, pool_backfilled)
      VALUES (1, 600, 1);
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
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO category_groups (id, user_id, name, sort_order) VALUES ('g1', 1, 'Essentials', 0);
    INSERT INTO categories (id, user_id, name, group_id, assigned, available)
      VALUES ('c-manual', 1, 'Manual Fund', 'g1', 400, 400);
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      date TEXT,
      direction TEXT,
      is_transfer INTEGER DEFAULT 0
    );
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT
    );
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('mb-stale', 'c-manual', '${monthKey}', 0, 0, 0);
  `);

  const { unassignCategoryForMonth } = require('../src/services/budget/monthlyBudgetService.cjs');

  const result = await unassignCategoryForMonth(db, 1, 'c-manual', monthKey, {
    auditSource: 'unassign_category',
  });
  assert.strictEqual(result.released, 400);
  assert.strictEqual(result.readyToAssignDelta, 400);

  const cat = await db.get('SELECT assigned, available FROM categories WHERE id = ?', ['c-manual']);
  assert.strictEqual(Number(cat.assigned), 0);
  assert.strictEqual(Number(cat.available), 0);

  const mb = await db.get(
    'SELECT budgeted_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    ['c-manual', monthKey]
  );
  assert.strictEqual(Number(mb.budgeted_amount), 0);

  const pool = await db.get('SELECT ready_to_assign_balance FROM user_budget_pool WHERE user_id = 1');
  assert.strictEqual(Number(pool.ready_to_assign_balance), 1000);

  const snapshot = await getBudgetMonthSnapshot(db, 1, monthKey);
  const row = snapshot.categories.find((c) => c.id === 'c-manual');
  assert.ok(row, 'category row missing from snapshot');
  assert.strictEqual(Number(row.assigned), 0);

  await db.close();
  console.log('  ok unassignCategory releases manual assigned when monthly row is zero');
}

(async () => {
  try {
    await testCategoryToCategoryMoveDoesNotRequireRta();
    await testCategoryMovePreservesReadyToAssign();
    await testReadyToAssignToOverspentCategory();
    await testCategoryActivityTransactionIds();
    await testBulkAssignPersistsAssignedAndAvailable();
    await testRepairImplicitAssignments();
    await testConsolidateAvailableIntoAssignments();
    await testReducingAssignedReturnsFundsToRtaPool();
    await testGlobalSummaryDoesNotAutoClearAssigned();
    await testAssignedPreservedAfterActivityRefresh();
    await testAutomatedAssignmentChangeRejected();
    await testBulkAssignInsideOpenTransaction();
    await testFundUnderfundedNotClearedByGlobalSummary();
    await testFundUnderfundedForMonthAppliesDeltas();
    await testFundUnderfundedSucceedsWithPreExistingInvariantDrift();
    await testUnassignCategoryReleasesManualAssignedWhenMonthRowIsZero();
    await testConcurrentBulkAssignNoSavepointError();
  } catch (e) {
    console.error('  FAIL integration:', e.message);
    process.exitCode = 1;
  }
  console.log(process.exitCode ? '\nFailed' : '\nAll passed');
})();
