#!/usr/bin/env node
/**
 * Verifies soft-delete for checking/savings (manual + Plaid-linked cash).
 * Usage: node scripts/test-cash-account-delete.cjs
 */
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const AccountService = require('../src/services/accounts/accountService.cjs');

const dbPath = path.join(__dirname, '../src/db/data/app.db');

async function main() {
  const svc = new AccountService(async () =>
    open({ filename: dbPath, driver: sqlite3.Database })
  );
  const db = await open({ filename: dbPath, driver: sqlite3.Database });

  const manual = await db.get(
    `SELECT id, name, type, source FROM accounts
     WHERE user_id = 2 AND type IN ('checking','savings') AND IFNULL(is_active,1)=1 AND source = 'manual' LIMIT 1`
  );
  const plaidCash = await db.get(
    `SELECT a.id, a.name, a.type, a.source FROM accounts a
     INNER JOIN plaid_accounts pa ON pa.account_id = a.id
     WHERE a.user_id = 3 AND a.type = 'savings' AND IFNULL(a.is_active,1)=1 AND a.source = 'plaid'
     LIMIT 1`
  );

  let failed = 0;

  if (manual) {
    const ok = await svc.deleteAccount(manual.id, 2);
    const row = await db.get('SELECT is_active, source FROM accounts WHERE id = ?', [manual.id]);
    const inSummary = (await svc.getAccountsSummary(2)).some((a) => a.id === manual.id);
    if (!ok || row.is_active !== 0 || inSummary) {
      console.error('FAIL manual cash delete', { ok, row, inSummary });
      failed++;
    } else {
      console.log('OK manual cash delete', manual.name);
      await db.run(
        `UPDATE accounts SET is_active = 1, source = 'manual', sync_enabled = 1 WHERE id = ?`,
        [manual.id]
      );
    }
  } else {
    console.log('SKIP no manual cash account for user 2');
  }

  if (plaidCash) {
    const bridgeBefore = await db.get(
      'SELECT plaid_account_id FROM plaid_accounts WHERE account_id = ?',
      [plaidCash.id]
    );
    const ok = await svc.deleteAccount(plaidCash.id, 3);
    const row = await db.get('SELECT is_active, source FROM accounts WHERE id = ?', [plaidCash.id]);
    const bridgeAfter = await db.get(
      'SELECT plaid_account_id FROM plaid_accounts WHERE account_id = ?',
      [plaidCash.id]
    );
    const inSummary = (await svc.getAccountsSummary(3)).some((a) => a.id === plaidCash.id);
    const bridgeKept = !bridgeBefore || !!bridgeAfter;
    if (!ok || row.is_active !== 0 || row.source !== 'manual' || !bridgeKept || inSummary) {
      console.error('FAIL plaid cash delete', {
        ok,
        row,
        bridgeBefore: !!bridgeBefore,
        bridgeAfter: !!bridgeAfter,
        inSummary,
      });
      failed++;
    } else {
      console.log(
        'OK plaid savings delete',
        plaidCash.name,
        bridgeBefore ? '(plaid bridge kept)' : '(no prior bridge)'
      );
      await db.run(
        `UPDATE accounts SET is_active = 1, source = 'plaid', sync_enabled = 1 WHERE id = ?`,
        [plaidCash.id]
      );
    }
  } else {
    console.log('SKIP no plaid cash account for user 3');
  }

  await db.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
