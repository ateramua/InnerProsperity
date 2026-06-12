#!/usr/bin/env node
'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const importedCashReconciliationService = require('../src/services/budget/importedCashReconciliationService.cjs');
const readyToAssignPoolService = require('../src/services/budget/readyToAssignPoolService.cjs');
const budgetIntegrityService = require('../src/services/budget/budgetIntegrityService.cjs');

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
      target_type TEXT, target_amount REAL DEFAULT 0, archived INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monthly_budgets (
      category_id TEXT, month TEXT, budgeted_amount REAL DEFAULT 0,
      available_amount REAL DEFAULT 0, activity_amount REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (category_id, month)
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, user_id TEXT, name TEXT, type TEXT,
      account_type_category TEXT DEFAULT 'budget', on_budget INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1, account_status TEXT DEFAULT 'active',
      balance REAL DEFAULT 0, working_balance REAL DEFAULT 0,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      onboarding_snapshot_id TEXT,
      imported_opening_balance_transaction_id INTEGER,
      budget_inclusion_status TEXT NOT NULL DEFAULT 'on_budget',
      source TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT, user_id TEXT, date TEXT, description TEXT,
      amount REAL, direction TEXT, payee TEXT, memo TEXT,
      category_id TEXT, is_cleared INTEGER DEFAULT 0, is_system INTEGER DEFAULT 0,
      is_reconciled INTEGER DEFAULT 0, is_adjustment INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0, is_transfer INTEGER DEFAULT 0,
      transaction_type TEXT, affects_rta INTEGER DEFAULT 0,
      synthetic INTEGER DEFAULT 0, reconciliation_generated INTEGER DEFAULT 0,
      onboarding_event INTEGER DEFAULT 0, imported_cash_event INTEGER DEFAULT 0,
      onboarding_snapshot_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE budget_identity_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      recorded_at DATETIME NOT NULL DEFAULT (datetime('now')),
      on_budget_cash REAL NOT NULL DEFAULT 0,
      rta REAL NOT NULL DEFAULT 0,
      assigned_total REAL NOT NULL DEFAULT 0,
      category_available_total REAL NOT NULL DEFAULT 0,
      identity_delta REAL NOT NULL DEFAULT 0,
      unallocated_imported_cash REAL NOT NULL DEFAULT 0,
      health_status TEXT NOT NULL DEFAULT 'healthy',
      source TEXT
    );
    CREATE TABLE budget_onboarding_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      item_id TEXT,
      recorded_at DATETIME NOT NULL DEFAULT (datetime('now')),
      net_new_cash REAL NOT NULL DEFAULT 0,
      opening_balance_total REAL NOT NULL DEFAULT 0,
      notes TEXT
    );
    CREATE TABLE budget_integrity_suppressions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      account_id TEXT,
      reason TEXT,
      suppressed_until DATETIME,
      created_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE budget_reconciliation_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT,
      recorded_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE transaction_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER,
      user_id TEXT,
      category_id TEXT,
      amount REAL DEFAULT 0,
      memo TEXT
    );
    INSERT INTO users (id) VALUES ('u1');
    INSERT INTO accounts (id, user_id, name, type, working_balance, source)
      VALUES ('chk', 'u1', 'Chase Checking', 'checking', 70000, 'plaid');
    INSERT INTO categories (id, user_id, name, assigned, available)
      VALUES ('gro', 'u1', 'Groceries', 0, 0);
  `);
  return db;
}

async function main() {
  const db = await openDb();
  const userId = 'u1';
  await readyToAssignPoolService.setPoolBalance(db, userId, 0);

  const broken = await budgetIntegrityService.evaluateBudgetIdentity(db, userId, {
    monthKey: '2026-06-01',
  });
  const unallocated = importedCashReconciliationService.computeUnallocatedImportedCash(
    broken.budgetInvariantDelta
  );
  assert.strictEqual(broken.onBudgetCash, 70000);
  assert.strictEqual(broken.readyToAssign, 0);
  assert.ok(unallocated > 1000, 'orphaned cash detected');

  assert.strictEqual(
    importedCashReconciliationService.computeNetNewCashForAccount(50000, 48000),
    2000
  );

  const onboard = await importedCashReconciliationService.processImportedCashOnboarding(
    db,
    userId,
    [{ accountId: 'chk', priorBalance: 0, importedBalance: 70000 }],
    { itemId: 'item-1' }
  );
  assert.strictEqual(onboard.processed, 1);
  assert.strictEqual(onboard.openings[0].amount, 70000);

  const fixed = await budgetIntegrityService.evaluateBudgetIdentity(db, userId, {
    monthKey: '2026-06-01',
  });
  assert.strictEqual(fixed.invariantValid, true, '70000 = RTA after opening balance');
  assert.strictEqual(fixed.readyToAssign, 70000);

  const legacyBroken = importedCashReconciliationService.computeUnallocatedImportedCash(
    70000 - (-13351.91 + 300)
  );
  assert.ok(legacyBroken > 60000, 'legacy over-assignment delta detected');

  assert.strictEqual(importedCashReconciliationService.computeOverAssignedGap(-500), 500);
  assert.strictEqual(importedCashReconciliationService.computeOverAssignedGap(500), 0);

  const tx = await db.get(
    `SELECT transaction_type, affects_rta, synthetic, imported_cash_event
     FROM transactions WHERE account_id = 'chk' LIMIT 1`
  );
  assert.strictEqual(tx.transaction_type, 'OPENING_BALANCE');
  assert.strictEqual(tx.affects_rta, 1);
  assert.strictEqual(tx.synthetic, 1);
  assert.strictEqual(tx.imported_cash_event, 1);

  const acct = await db.get('SELECT onboarding_complete FROM accounts WHERE id = ?', ['chk']);
  assert.strictEqual(acct.onboarding_complete, 1);

  console.log('✅ test-imported-cash-reconciliation passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
