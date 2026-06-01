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

async function testGlobalSummaryHealsPhantomAssignments() {
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

  const { getGlobalBudgetSummary } = require('../src/services/budget/monthlyBudgetService.cjs');
  const cash = 5000;
  const summary = await getGlobalBudgetSummary(db, 1, cash, { autoHealPhantomAssignments: true });
  assert.strictEqual(summary.totalAssigned, 0);
  assert.strictEqual(summary.readyToAssign, cash);

  const rows = await db.all(
    'SELECT budgeted_amount FROM monthly_budgets WHERE category_id IN (?, ?)',
    ['c1', 'c2']
  );
  for (const row of rows) {
    assert.strictEqual(Number(row.budgeted_amount), 0);
  }

  await db.close();
  console.log('  ok global summary heals phantom budgeted rows and restores RTA');
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

(async () => {
  try {
    await testBulkAssignPersistsAssignedAndAvailable();
    await testRepairImplicitAssignments();
    await testConsolidateAvailableIntoAssignments();
    await testReducingAssignedReturnsFundsToRtaPool();
    await testGlobalSummaryHealsPhantomAssignments();
    await testBulkAssignInsideOpenTransaction();
    await testFundUnderfundedNotClearedByGlobalSummary();
    await testConcurrentBulkAssignNoSavepointError();
  } catch (e) {
    console.error('  FAIL integration:', e.message);
    process.exitCode = 1;
  }
  console.log(process.exitCode ? '\nFailed' : '\nAll passed');
})();
