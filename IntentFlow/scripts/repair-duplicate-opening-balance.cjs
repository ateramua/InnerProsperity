#!/usr/bin/env node
/**
 * Reverse mistaken reconciliation OPENING_BALANCE inflows (system-protected, not UI-deletable).
 *
 * Usage:
 *   node scripts/repair-duplicate-opening-balance.cjs [--db=/path/to/money-manager.db] [--user=1] [--dry-run]
 */
'use strict';

const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const importedCashReconciliationService = require('../src/services/budget/importedCashReconciliationService.cjs');
const budgetIntegrityService = require('../src/services/budget/budgetIntegrityService.cjs');
const readyToAssignPoolService = require('../src/services/budget/readyToAssignPoolService.cjs');

const defaultDb = path.join(
  process.env.HOME || '',
  'Library/Application Support/intentflow/money-manager.db'
);

function parseArgs(argv) {
  const opts = { db: defaultDb, userId: '1', dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--db=')) opts.db = arg.slice('--db='.length);
    else if (arg.startsWith('--user=')) opts.userId = arg.slice('--user='.length);
  }
  return opts;
}

async function sumOnBudgetCash(db, userId) {
  return budgetIntegrityService.computeOnBudgetCash(db, userId);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = await open({ filename: opts.db, driver: sqlite3.Database });

  const duplicates = await db.all(
    `SELECT t.id, t.account_id, a.name, round(t.amount, 2) AS amount, t.memo, t.reconciliation_generated
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.user_id = ?
       AND IFNULL(t.is_deleted, 0) = 0
       AND t.transaction_type = 'OPENING_BALANCE'
       AND IFNULL(t.reconciliation_generated, 0) = 1
     ORDER BY t.created_at`,
    [opts.userId]
  );

  if (!duplicates.length) {
    console.log('No reconciliation-generated OPENING_BALANCE rows found.');
    await db.close();
    return;
  }

  const beforeCash = await sumOnBudgetCash(db, opts.userId);
  const beforeRta = await readyToAssignPoolService.getPoolBalance(db, opts.userId);
  const beforeIdentity = await budgetIntegrityService.evaluateBudgetIdentity(db, opts.userId);

  console.log('Before repair:');
  console.log('  on-budget cash:', beforeCash);
  console.log('  RTA:', beforeRta);
  console.log('  identity delta:', beforeIdentity.budgetInvariantDelta);
  console.log('Rows to reverse:');
  for (const row of duplicates) {
    console.log(`  #${row.id} ${row.name} $${row.amount} — ${row.memo}`);
  }

  if (opts.dryRun) {
    console.log('\nDry run — no changes written.');
    await db.close();
    return;
  }

  for (const row of duplicates) {
    await importedCashReconciliationService.reverseOpeningBalanceTransaction(
      db,
      opts.userId,
      row.id
    );
    console.log(`Reversed transaction #${row.id}`);
  }

  const afterCash = await sumOnBudgetCash(db, opts.userId);
  const afterRta = await readyToAssignPoolService.getPoolBalance(db, opts.userId);
  const afterIdentity = await budgetIntegrityService.evaluateBudgetIdentity(db, opts.userId);

  console.log('\nAfter repair:');
  console.log('  on-budget cash:', afterCash);
  console.log('  RTA:', afterRta);
  console.log('  identity delta:', afterIdentity.budgetInvariantDelta);
  console.log('  invariant valid:', afterIdentity.invariantValid);

  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
