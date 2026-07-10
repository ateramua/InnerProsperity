#!/usr/bin/env node
'use strict';

/**
 * Permanently remove the inactive manual duplicate Cap One 4271 (ghost account).
 *
 * Usage: node scripts/remove-ghost-cap4271-account.cjs [--user-id 1] [--dry-run]
 */

const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const accountDeleteService = require('../src/services/accounts/accountDeleteService.cjs');
const { refreshBudgetMonthsForward } = require('../src/services/budget/monthlyBudgetService.cjs');

const KEEP_ID = 'b6cd468f-9070-42d3-8cf8-f2768a751434';
const GHOST_ID = '00da35c1-4d53-48a4-bedb-8a17bf9a05a0';

function defaultDbPath() {
  return path.join(os.homedir(), 'Library/Application Support/intentflow/money-manager.db');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const userId = Number(process.argv.find((a, i) => process.argv[i - 1] === '--user-id') || 1);

  const db = await open({ filename: defaultDbPath(), driver: sqlite3.Database });

  const keep = await db.get('SELECT id, name, source, is_active FROM accounts WHERE id = ? AND user_id = ?', [
    KEEP_ID,
    userId,
  ]);
  const ghost = await db.get('SELECT id, name, source, is_active FROM accounts WHERE id = ? AND user_id = ?', [
    GHOST_ID,
    userId,
  ]);

  console.log('Keep (Plaid):', keep);
  console.log('Remove (ghost):', ghost);

  if (!keep) {
    console.error('Plaid Cap One 4271 not found — aborting.');
    process.exit(1);
  }
  if (!ghost) {
    console.log('Ghost account already removed.');
    await db.close();
    return;
  }

  const ghostTxCount = await db.get(
    'SELECT COUNT(*) AS c FROM transactions WHERE account_id = ? AND IFNULL(is_deleted, 0) = 0',
    [GHOST_ID]
  );
  console.log(`Ghost account has ${ghostTxCount?.c || 0} active transactions (will be deleted).`);

  if (dryRun) {
    console.log('Dry run — no changes made.');
    await db.close();
    return;
  }

  const result = await accountDeleteService.permanentlyDeleteCreditAccount(db, GHOST_ID, userId);
  if (!result.success) {
    console.error('Delete failed:', result.error);
    process.exit(1);
  }

  console.log('Ghost account permanently deleted:', result.deletedAccountId);

  await refreshBudgetMonthsForward(db, userId, '2026-06-01', 3);
  console.log('Budget envelopes refreshed.');

  const remaining = await db.all(
    "SELECT id, name, source, is_active FROM accounts WHERE user_id = ? AND name LIKE '%4271%'",
    [userId]
  );
  console.log('Remaining 4271 accounts:', remaining);

  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
