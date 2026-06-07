#!/usr/bin/env node
'use strict';

/**
 * Find and remove duplicate linked-transfer pairs caused by the legacy
 * createCreditCardTransferTransaction double-addTransaction bug.
 *
 * Symptom: two transfer_group_id values for the same date/amount between the same
 * cash and credit accounts — one correct (cash outflow, credit inflow) and one
 * inverted duplicate (cash inflow, credit outflow).
 *
 * Usage:
 *   node scripts/repair-duplicate-transfer-pairs.cjs --report [--user-id 3]
 *   node scripts/repair-duplicate-transfer-pairs.cjs --apply [--user-id 3]
 *     [--from 2026-05-01] [--to 2026-07-01] [--refresh-budget]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const TransactionService = require('../src/services/transactions/transactionService.cjs');
const {
  toLocalMonthKey,
  refreshBudgetMonthsForward,
  auditBudgetMonthIntegrity,
} = require('../src/services/budget/monthlyBudgetService.cjs');

function defaultDbPath() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'intentflow', 'money-manager.db');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || home, 'intentflow', 'money-manager.db');
  }
  return path.join(home, '.config', 'intentflow', 'money-manager.db');
}

function parseArgs(argv) {
  const opts = {
    report: false,
    apply: false,
    userId: null,
    fromMonth: '2026-05-01',
    toMonth: '2026-07-01',
    dbPath: null,
    refreshBudget: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--report') opts.report = true;
    else if (arg === '--apply') opts.apply = true;
    else if (arg === '--user-id') opts.userId = parseInt(argv[++i], 10);
    else if (arg === '--from') opts.fromMonth = toLocalMonthKey(argv[++i]);
    else if (arg === '--to') opts.toMonth = toLocalMonthKey(argv[++i]);
    else if (arg === '--db') opts.dbPath = argv[++i];
    else if (arg === '--no-refresh-budget') opts.refreshBudget = false;
  }
  if (!opts.report && !opts.apply) opts.report = true;
  return opts;
}

async function resolveUserId(db, userId) {
  if (userId) return userId;
  const row = await db.get('SELECT id FROM users ORDER BY id DESC LIMIT 1');
  return row?.id ?? null;
}

/**
 * Summarize each transfer group for duplicate detection.
 */
async function loadTransferGroupSummaries(db, userId, fromDate, toDate) {
  return db.all(
    `SELECT
       t.user_id,
       t.transfer_group_id,
       MIN(t.date) AS date,
       MAX(ABS(t.amount)) AS abs_amt,
       SUM(CASE WHEN a.type IN ('checking', 'savings') AND t.amount > 0 THEN 1 ELSE 0 END) AS cash_positive,
       SUM(CASE WHEN a.type IN ('checking', 'savings') AND t.amount < 0 THEN 1 ELSE 0 END) AS cash_negative,
       SUM(CASE WHEN a.type = 'credit' AND t.amount > 0 THEN 1 ELSE 0 END) AS credit_positive,
       SUM(CASE WHEN a.type = 'credit' AND t.amount < 0 THEN 1 ELSE 0 END) AS credit_negative,
       COUNT(*) AS leg_count
     FROM transactions t
     INNER JOIN accounts a ON a.id = t.account_id
     WHERE t.user_id = ?
       AND IFNULL(t.is_deleted, 0) = 0
       AND IFNULL(t.is_transfer, 0) = 1
       AND t.transfer_group_id IS NOT NULL
       AND t.date >= ? AND t.date < ?
     GROUP BY t.user_id, t.transfer_group_id
     HAVING leg_count = 2`,
    [userId, fromDate, toDate]
  );
}

function findDuplicatePairs(groups) {
  const pairs = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const g1 = groups[i];
      const g2 = groups[j];
      if (g1.date !== g2.date) continue;
      if (Math.abs(Number(g1.abs_amt) - Number(g2.abs_amt)) > 0.005) continue;

      const g1Correct =
        Number(g1.cash_negative) === 1 &&
        Number(g1.cash_positive) === 0 &&
        Number(g1.credit_positive) === 1 &&
        Number(g1.credit_negative) === 0;
      const g2Inverted =
        Number(g2.cash_positive) === 1 &&
        Number(g2.cash_negative) === 0 &&
        Number(g2.credit_negative) === 1 &&
        Number(g2.credit_positive) === 0;

      if (g1Correct && g2Inverted) {
        pairs.push({ keepGroupId: g1.transfer_group_id, removeGroupId: g2.transfer_group_id, ...g1 });
        continue;
      }

      const g2Correct =
        Number(g2.cash_negative) === 1 &&
        Number(g2.cash_positive) === 0 &&
        Number(g2.credit_positive) === 1 &&
        Number(g2.credit_negative) === 0;
      const g1Inverted =
        Number(g1.cash_positive) === 1 &&
        Number(g1.cash_negative) === 0 &&
        Number(g1.credit_negative) === 1 &&
        Number(g1.credit_positive) === 0;

      if (g2Correct && g1Inverted) {
        pairs.push({ keepGroupId: g2.transfer_group_id, removeGroupId: g1.transfer_group_id, ...g2 });
      }
    }
  }
  return pairs;
}

async function loadGroupTransactionIds(db, userId, groupId) {
  const rows = await db.all(
    `SELECT id, account_id, date, amount, payee, linked_transaction_id
     FROM transactions
     WHERE user_id = ? AND transfer_group_id = ? AND IFNULL(is_deleted, 0) = 0`,
    [userId, groupId]
  );
  return rows;
}

async function findSameAccountNetZeroPairs(db, userId, fromDate, toDate) {
  return db.all(
    `SELECT t1.id AS id_neg, t2.id AS id_pos, t1.account_id, t1.date, ABS(t1.amount) AS abs_amt,
            t1.transfer_group_id AS group_neg, t2.transfer_group_id AS group_pos, a.name AS account_name
     FROM transactions t1
     INNER JOIN transactions t2
       ON t1.account_id = t2.account_id AND t1.date = t2.date
       AND ABS(t1.amount) = ABS(t2.amount) AND t1.amount < 0 AND t2.amount > 0
       AND t1.id < t2.id AND t1.transfer_group_id != t2.transfer_group_id
     INNER JOIN accounts a ON a.id = t1.account_id
     WHERE t1.user_id = ? AND t2.user_id = ?
       AND IFNULL(t1.is_deleted, 0) = 0 AND IFNULL(t2.is_deleted, 0) = 0
       AND IFNULL(t1.is_transfer, 0) = 1 AND IFNULL(t2.is_transfer, 0) = 1
       AND t1.date >= ? AND t1.date < ?`,
    [userId, userId, fromDate, toDate]
  );
}

async function getCashTotal(db, userId) {
  const row = await db.get(
    `SELECT ROUND(COALESCE(SUM(balance), 0), 2) AS total
     FROM accounts WHERE user_id = ?
       AND type IN ('checking', 'savings')
       AND IFNULL(is_active, 1) = 1`,
    [userId]
  );
  return Number(row?.total) || 0;
}

async function main() {
  const opts = parseArgs(process.argv);
  const dbPath = opts.dbPath || defaultDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error('Database not found:', dbPath);
    process.exit(1);
  }

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  const userId = await resolveUserId(db, opts.userId);
  if (!userId) {
    console.error('No user found');
    process.exit(1);
  }

  const fromDate = toLocalMonthKey(opts.fromMonth);
  const toDate = toLocalMonthKey(opts.toMonth);

  console.log('\n=== Duplicate transfer pair scan ===');
  console.log(`DB:       ${dbPath}`);
  console.log(`User:     ${userId}`);
  console.log(`Dates:    ${fromDate} .. ${toDate} (exclusive end month key)`);

  const groups = await loadTransferGroupSummaries(db, userId, fromDate, toDate);
  const duplicatePairs = findDuplicatePairs(groups);
  const netZeroOnSameAccount = await findSameAccountNetZeroPairs(db, userId, fromDate, toDate);

  console.log(`\nTransfer groups in range: ${groups.length}`);
  console.log(`Inverted duplicate pairs (cash→credit payment bug): ${duplicatePairs.length}`);

  if (duplicatePairs.length === 0) {
    console.log('\nNo inverted duplicate transfer pairs found in this range.');
  } else {
    for (const pair of duplicatePairs) {
      console.log('\n--- Duplicate pair ---');
      console.log(`  Date:        ${pair.date}`);
      console.log(`  Amount:      $${Number(pair.abs_amt).toFixed(2)}`);
      console.log(`  Keep group:  ${pair.keepGroupId}`);
      console.log(`  Remove group: ${pair.removeGroupId}`);
      const keepTx = await loadGroupTransactionIds(db, userId, pair.keepGroupId);
      const removeTx = await loadGroupTransactionIds(db, userId, pair.removeGroupId);
      for (const tx of keepTx) {
        console.log(`    KEEP  id=${tx.id} acct=${tx.account_id} amt=${tx.amount} payee=${tx.payee}`);
      }
      for (const tx of removeTx) {
        console.log(`    DEL   id=${tx.id} acct=${tx.account_id} amt=${tx.amount} payee=${tx.payee}`);
      }
    }
  }

  if (netZeroOnSameAccount.length) {
    console.log(`\nSame-account opposing transfer legs (symptom rows): ${netZeroOnSameAccount.length}`);
    for (const row of netZeroOnSameAccount) {
      console.log(
        `  ${row.date} ${row.account_name}: -${Number(row.abs_amt).toFixed(2)} (group ${row.group_neg}) ` +
          `+${Number(row.abs_amt).toFixed(2)} (group ${row.group_pos})`
      );
    }
  }

  console.log('\n--- Budget integrity (May–Jun 2026) ---');
  for (const monthKey of ['2026-05-01', '2026-06-01']) {
    if (monthKey < fromDate || monthKey >= toDate) continue;
    const audit = await auditBudgetMonthIntegrity(db, userId, monthKey);
    const issues = audit?.categories?.filter((c) => c.issues?.length) || [];
    console.log(`  ${monthKey}: ${issues.length} categories with envelope issues (of ${audit?.categories?.length || 0})`);
    if (issues.length > 0 && issues.length <= 5) {
      for (const cat of issues) {
        console.log(`    • ${cat.name}: ${cat.issues.join('; ')}`);
      }
    }
  }

  if (!opts.apply) {
    console.log('\nDry run only. Re-run with --apply to delete duplicate groups and refresh balances.');
    await db.close();
    return;
  }

  if (!duplicatePairs.length) {
    console.log('\nNothing to apply.');
    await db.close();
    return;
  }

  const txSvc = new TransactionService(dbPath);
  const accountIdsToRefresh = new Set();
  const datesForBudget = new Set();

  for (const pair of duplicatePairs) {
    const removeTx = await loadGroupTransactionIds(db, userId, pair.removeGroupId);
    const ids = removeTx.map((t) => t.id);
    if (!ids.length) continue;

    console.log(`\nDeleting duplicate group ${pair.removeGroupId} (${ids.length} legs)...`);
    const result = await txSvc.bulkDeleteTransactions(ids, userId);
    console.log(`  Deleted: ${result.deleted}`);
    for (const aid of result.accountIds || []) accountIdsToRefresh.add(aid);
    for (const d of result.dates || []) datesForBudget.add(d);
  }

  console.log('\n--- Balances after repair ---');
  for (const accountId of accountIdsToRefresh) {
    const acct = await db.get('SELECT name, type, balance, working_balance FROM accounts WHERE id = ?', [
      accountId,
    ]);
    if (acct) {
      console.log(
        `  ${acct.name} (${acct.type}): balance=${Number(acct.balance).toFixed(2)} working=${Number(acct.working_balance).toFixed(2)}`
      );
    }
  }

  if (opts.refreshBudget) {
    const cash = await getCashTotal(db, userId);
    console.log('\nRefreshing budget envelopes from 2026-05-01 forward...');
    await refreshBudgetMonthsForward(db, userId, '2026-05-01', 36);
    const global = await require('../src/services/budget/monthlyBudgetService.cjs').getGlobalBudgetSummary(
      db,
      userId,
      cash
    );
    console.log(`  Global RTA after refresh: $${global.readyToAssign.toFixed(2)}`);
  }

  console.log('\nRepair complete.');
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
