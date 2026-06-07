#!/usr/bin/env node
'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const budgetIntegrityService = require('../src/services/budget/budgetIntegrityService.cjs');
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
    CREATE TABLE category_groups (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, sort_order INTEGER DEFAULT 0);
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, user_id TEXT, name TEXT, group_id TEXT,
      assigned REAL DEFAULT 0, available REAL DEFAULT 0, activity REAL DEFAULT 0,
      target_type TEXT, target_amount REAL DEFAULT 0, archived INTEGER DEFAULT 0
    );
    CREATE TABLE monthly_budgets (
      category_id TEXT, month TEXT, budgeted_amount REAL DEFAULT 0,
      available_amount REAL DEFAULT 0, activity_amount REAL DEFAULT 0,
      PRIMARY KEY (category_id, month)
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, user_id TEXT, name TEXT, type TEXT,
      account_type_category TEXT DEFAULT 'budget', on_budget INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1, account_status TEXT DEFAULT 'active',
      balance REAL DEFAULT 0, working_balance REAL DEFAULT 0
    );
    INSERT INTO users (id) VALUES ('u1');
    INSERT INTO accounts (id, user_id, name, type, working_balance)
      VALUES ('chk', 'u1', 'Checking', 'checking', 1000);
    INSERT INTO categories (id, user_id, name, assigned, available)
      VALUES ('gro', 'u1', 'Groceries', 300, 300);
    INSERT INTO monthly_budgets (category_id, month, budgeted_amount, available_amount, activity_amount)
      VALUES ('gro', '2026-06-01', 300, 300, 0);
  `);
  return db;
}

async function main() {
  const db = await openDb();
  const userId = 'u1';
  await readyToAssignPoolService.setPoolBalance(db, userId, 700);

  const before = await budgetIntegrityService.evaluateBudgetIdentity(db, userId, {
    monthKey: '2026-06-01',
  });
  assert.strictEqual(before.invariantValid, true, '1000 = 700 + 300');
  assert.strictEqual(before.onBudgetCash, 1000);

  await readyToAssignPoolService.setPoolBalance(db, userId, 500);
  const drifted = await budgetIntegrityService.evaluateBudgetIdentity(db, userId, {
    monthKey: '2026-06-01',
  });
  assert.strictEqual(drifted.invariantValid, false);

  const fixed = await budgetIntegrityService.reconcileBudgetIdentity(db, userId, {
    monthKey: '2026-06-01',
  });
  assert.strictEqual(fixed.invariantValid, true);
  assert.strictEqual(fixed.readyToAssign, 700);
  console.log('✅ test-budget-integrity passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
