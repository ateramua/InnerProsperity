#!/usr/bin/env node
'use strict';

/**
 * Backfill "Credit Card Payments" categories for all active credit accounts.
 *
 *   node scripts/ensure-cc-payment-categories.cjs [--user-id 3] [--dry-run]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const {
  syncCreditCardPaymentCategoriesForUser,
  isEligibleBudgetCreditCardAccount,
} = require('../src/services/accounts/creditCardPaymentCategoryService.cjs');

function defaultDbPath() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library/Application Support/intentflow/money-manager.db');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'intentflow', 'money-manager.db');
  }
  return path.join(os.homedir(), '.config', 'intentflow', 'money-manager.db');
}

function parseArgs(argv) {
  const opts = { userId: null, dryRun: false, dbPath: process.env.INTENTFLOW_DB || defaultDbPath() };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user-id' && argv[i + 1]) opts.userId = Number(argv[++i]);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--db' && argv[i + 1]) opts.dbPath = argv[++i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!fs.existsSync(opts.dbPath)) {
    console.error('Database not found:', opts.dbPath);
    process.exit(1);
  }

  const db = await open({ filename: opts.dbPath, driver: sqlite3.Database });

  let userIds = [];
  if (opts.userId) {
    userIds = [opts.userId];
  } else {
    const rows = await db.all(
      `SELECT DISTINCT user_id AS user_id
       FROM accounts
       WHERE lower(type) = 'credit'`
    );
    userIds = rows.map((r) => r.user_id).filter(Boolean);
  }

  if (opts.dryRun) {
    for (const userId of userIds) {
      const accounts = await db.all(
        `SELECT id, name, type, paired_category_id, is_active, account_status
         FROM accounts
         WHERE user_id = ? AND lower(type) = 'credit'`,
        [userId]
      );
      const existing = await db.all(
        `SELECT id, name, linked_account_id
         FROM categories
         WHERE user_id = ? AND is_credit_card_payment_category = 1`,
        [userId]
      );
      console.log(`\nUser ${userId}: ${accounts.length} credit account(s), ${existing.length} payment categor(ies)`);
      for (const acc of accounts) {
        const linked = existing.find(
          (c) => String(c.linked_account_id) === String(acc.id)
        );
        const eligible = isEligibleBudgetCreditCardAccount(acc);
        const status = !eligible
          ? 'SKIP (ineligible)'
          : linked
            ? `OK (${linked.name})`
            : 'MISSING';
        console.log(`  - [${status}] ${acc.name} (${acc.id}) paired=${acc.paired_category_id || 'null'}`);
      }
    }
    await db.close();
    return;
  }

  for (const userId of userIds) {
    const result = await syncCreditCardPaymentCategoriesForUser(db, userId, {
      reason: 'cli',
    });
    console.log(JSON.stringify(result, null, 2));
  }

  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
