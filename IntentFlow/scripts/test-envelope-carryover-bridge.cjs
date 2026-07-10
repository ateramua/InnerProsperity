#!/usr/bin/env node
'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const envelopeCarryoverBridge = require('../src/services/budget/envelopeCarryoverBridge.cjs');
const { refreshCategoryEnvelopesForward } = require('../src/services/budget/monthlyBudgetService.cjs');

async function openDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE user_budget_pool (
      user_id INTEGER PRIMARY KEY,
      ready_to_assign_balance REAL NOT NULL DEFAULT 0,
      pool_backfilled INTEGER NOT NULL DEFAULT 0,
      rta_ledger_authority INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO user_budget_pool (user_id, ready_to_assign_balance) VALUES (1, 5000);
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      carryover_mode TEXT DEFAULT 'carry',
      archived INTEGER DEFAULT 0,
      assigned REAL DEFAULT 0,
      available REAL DEFAULT 0,
      activity REAL DEFAULT 0
    );
    INSERT INTO categories (id, user_id, name) VALUES ('ef', 1, 'Emergency Fund');
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
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('m1', 'ef', '2029-05-01', 0, 0, 10000);
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
      VALUES ('m3', 'ef', '2029-07-01', 1070.59, 0, 1070.59);
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      user_id INTEGER,
      category_id TEXT,
      amount REAL,
      date TEXT,
      direction TEXT,
      is_transfer INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      is_cleared INTEGER DEFAULT 0,
      is_system INTEGER DEFAULT 0,
      is_reconciled INTEGER DEFAULT 0,
      is_adjustment INTEGER DEFAULT 0
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      type TEXT,
      is_active INTEGER DEFAULT 1,
      account_status TEXT DEFAULT 'active'
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
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT,
      amount REAL,
      sort_order INTEGER DEFAULT 0
    );
  `);
  return db;
}

async function testResolvePreviousAvailableSkipsGap() {
  const db = await openDb();
  const cat = await db.get('SELECT * FROM categories WHERE id = ?', ['ef']);
  const prev = await envelopeCarryoverBridge.resolvePreviousAvailable(db, cat, 'ef', '2029-07-01');
  assert.strictEqual(prev, 10000, 'must carry forward from May 2029 across missing June');
  await db.close();
  console.log('  ok resolvePreviousAvailable skips month gap');
}

async function testBridgeMonthCreation() {
  const db = await openDb();
  const cat = await db.get('SELECT * FROM categories WHERE id = ?', ['ef']);
  const result = await envelopeCarryoverBridge.ensureBridgeMonthsForCategory(db, 1, cat, '2029-07-01');
  assert.strictEqual(result.created, 1);
  const june = await envelopeCarryoverBridge.fetchMonthlyBudgetRow(db, 'ef', '2029-06-01');
  assert.strictEqual(Number(june.available_amount), 10000);
  await db.close();
  console.log('  ok ensureBridgeMonthsForCategory creates June bridge');
}

async function testRefreshPreservesCarryover() {
  const db = await openDb();
  const cat = await db.get('SELECT * FROM categories WHERE id = ?', ['ef']);
  await envelopeCarryoverBridge.ensureBridgeMonthsForCategory(db, 1, cat, '2029-07-01');
  await refreshCategoryEnvelopesForward(db, 1, '2029-07-01', ['ef'], 1);
  const july = await envelopeCarryoverBridge.fetchMonthlyBudgetRow(db, 'ef', '2029-07-01');
  assert.ok(
    Number(july.available_amount) >= 11070 - 0.05,
    `July EF available should include carryover, got ${july.available_amount}`
  );
  await db.close();
  console.log('  ok refresh preserves carryover across gap');
}

async function testRefreshCorrectsStaleInflatedAvailable() {
  const db = await openDb();
  await db.run(`DELETE FROM monthly_budgets WHERE category_id = 'ef'`);
  await db.run(
    `INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
     VALUES ('m5', 'ef', '2029-05-01', 0, 0, 1470)`
  );
  await db.run(
    `INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
     VALUES ('m3', 'ef', '2029-07-01', 0, 0, 4360)`
  );
  const cat = await db.get('SELECT * FROM categories WHERE id = ?', ['ef']);
  await envelopeCarryoverBridge.ensureBridgeMonthsForCategory(db, 1, cat, '2029-07-01');
  await refreshCategoryEnvelopesForward(db, 1, '2029-07-01', ['ef'], 1);
  const july = await envelopeCarryoverBridge.fetchMonthlyBudgetRow(db, 'ef', '2029-07-01');
  assert.ok(
    Number(july.available_amount) < 4360 - 0.05,
    `stale inflated July available should be corrected, got ${july.available_amount}`
  );
  assert.ok(
    Math.abs(Number(july.available_amount) - 1470) < 0.05,
    `July should match carryover from May via bridge, got ${july.available_amount}`
  );
  await db.close();
  console.log('  ok refresh corrects stale inflated available without conservation throw');
}

async function main() {
  console.log('envelopeCarryoverBridge');
  await testResolvePreviousAvailableSkipsGap();
  await testBridgeMonthCreation();
  await testRefreshPreservesCarryover();
  await testRefreshCorrectsStaleInflatedAvailable();
  console.log('\nAll passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
