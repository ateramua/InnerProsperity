#!/usr/bin/env node
'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const assignmentLedgerService = require('../src/services/budget/assignmentLedgerService.cjs');
const rtaLedgerService = require('../src/services/budget/rtaLedgerService.cjs');

async function openDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE user_budget_pool (
      user_id TEXT PRIMARY KEY,
      ready_to_assign_balance REAL NOT NULL DEFAULT 0,
      pool_backfilled INTEGER NOT NULL DEFAULT 0,
      rta_ledger_authority INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, user_id TEXT, name TEXT, assigned REAL DEFAULT 0,
      available REAL DEFAULT 0, activity REAL DEFAULT 0, archived INTEGER DEFAULT 0
    );
    CREATE TABLE monthly_budgets (
      id TEXT PRIMARY KEY, category_id TEXT, month TEXT,
      budgeted_amount REAL DEFAULT 0, available_amount REAL DEFAULT 0, activity_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, month)
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, user_id TEXT, name TEXT, type TEXT,
      account_type_category TEXT DEFAULT 'budget', on_budget INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1, account_status TEXT DEFAULT 'active',
      balance REAL DEFAULT 0, working_balance REAL DEFAULT 0,
      onboarding_complete INTEGER NOT NULL DEFAULT 1,
      budget_inclusion_status TEXT NOT NULL DEFAULT 'on_budget'
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT, user_id TEXT, date TEXT,
      amount REAL, direction TEXT, category_id TEXT,
      affects_rta INTEGER DEFAULT 0, transaction_type TEXT,
      is_deleted INTEGER DEFAULT 0, is_transfer INTEGER DEFAULT 0,
      is_cleared INTEGER DEFAULT 0, is_system INTEGER DEFAULT 0,
      is_reconciled INTEGER DEFAULT 0, is_adjustment INTEGER DEFAULT 0,
      payee TEXT, description TEXT
    );
    CREATE TABLE budget_assignment_audit (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category_id TEXT NOT NULL, month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0, new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0, source TEXT, metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      operation_type TEXT, created_by_user_id TEXT, created_by_operation TEXT,
      created_by_migration TEXT, created_by_system INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE budget_reconciliation_events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_type TEXT NOT NULL,
      payload_json TEXT, recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE transaction_splits (
      id TEXT PRIMARY KEY, transaction_id TEXT, user_id TEXT, category_id TEXT, amount REAL
    );
    INSERT INTO users (id) VALUES ('u1');
    INSERT INTO accounts (id, user_id, name, type, working_balance)
      VALUES ('chk', 'u1', 'Checking', 'checking', 1000);
    INSERT INTO categories (id, user_id, name, assigned, available)
      VALUES ('gro', 'u1', 'Groceries', 300, 300);
    INSERT INTO categories (id, user_id, name, assigned, available)
      VALUES ('vac', 'u1', 'Vacation Fund', 200, 180);
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, available_amount, activity_amount)
      VALUES ('mb1', 'gro', '2026-06-01', 300, 300, 0);
    INSERT INTO monthly_budgets (id, category_id, month, budgeted_amount, available_amount, activity_amount)
      VALUES ('mb2', 'vac', '2026-06-01', 200, 180, -20);
    INSERT INTO budget_assignment_audit (
      id, user_id, category_id, month, previous_assigned, new_assigned, amount_changed, source
    ) VALUES ('a1', 'u1', 'gro', '2026-06-01', 0, 300, 300, 'assign');
    INSERT INTO transactions (account_id, user_id, date, amount, direction, affects_rta, transaction_type)
      VALUES ('chk', 'u1', '2026-06-01', 1000, 'inflow', 1, 'OPENING_BALANCE');
  `);
  return db;
}

async function main() {
  const db = await openDb();
  const userId = 'u1';
  await rtaLedgerService.syncPoolFromLedger(db, userId);

  const rtaBefore = await rtaLedgerService.computeDerivedRta(db, userId);
  assert.strictEqual(rtaBefore, 700);

  const gaps = await assignmentLedgerService.findAssignmentProjectionGaps(db, userId);
  assert.strictEqual(gaps.length, 1);
  assert.strictEqual(gaps[0].categoryName, 'Vacation Fund');
  assert.strictEqual(gaps[0].unauditedGap, 200);

  const result = await assignmentLedgerService.reconstructMissingLedgerEvents(db, userId, {
    migrationId: 'test_migration',
  });
  assert.strictEqual(result.applied.length, 1);

  const rtaAfter = await rtaLedgerService.computeDerivedRta(db, userId);
  assert.strictEqual(rtaAfter, 500);

  const second = await assignmentLedgerService.reconstructMissingLedgerEvents(db, userId);
  assert.strictEqual(second.applied.length, 0);

  console.log('✅ test-assignment-ledger-reconstruction passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
