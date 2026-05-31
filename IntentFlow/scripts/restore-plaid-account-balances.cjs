#!/usr/bin/env node
/**
 * Restore accounts.balance from bank_reported_balance after ledger-balance experiment.
 * Run: node scripts/restore-plaid-account-balances.cjs [userId]
 */
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const os = require('os');

async function main() {
  const userId = Number(process.argv[2]) || 3;
  const dbPath =
    process.env.INTENTFLOW_DB_PATH ||
    path.join(os.homedir(), 'Library/Application Support/intentflow/money-manager.db');

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  const cols = await db.all('PRAGMA table_info(accounts)');
  const hasBank = cols.some((c) => c.name === 'bank_reported_balance');

  if (!hasBank) {
    console.log('No bank_reported_balance column — nothing to restore from. Re-sync Plaid in the app.');
    await db.close();
    return;
  }

  const result = await db.run(
    `UPDATE accounts
     SET balance = bank_reported_balance,
         cleared_balance = bank_reported_balance,
         working_balance = bank_reported_balance,
         updated_at = datetime('now')
     WHERE user_id = ?
       AND LOWER(IFNULL(source, '')) = 'plaid'
       AND bank_reported_balance IS NOT NULL
       AND IFNULL(balance_locked, 0) = 0`,
    [userId]
  );

  console.log(`Restored ${result.changes} Plaid account balance(s) for user ${userId} from bank_reported_balance.`);
  console.log('Restart IntentFlow, then open Prosperity Map or run: npm run reconcile:budget --', userId);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
