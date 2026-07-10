#!/usr/bin/env node
'use strict';

/**
 * Production validation: monthly budget "Total Available" (footer row) vs Cash Accounts balance.
 *
 * Usage:
 *   node scripts/validate-budget-available-vs-cash.cjs [--user-id 1] [--db path]
 *
 * Default DB: ~/Library/Application Support/intentflow/money-manager.db
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { getBudgetMonthSnapshot, toLocalMonthKey } = require('../src/services/budget/monthlyBudgetService.cjs');
const { computeOnBudgetCash } = require('../src/services/budget/budgetIntegrityService.cjs');

function isAccountHidden(account) {
  if (!account) return false;
  return account.is_hidden === 1 || account.is_hidden === true || account.is_hidden === '1';
}

function normalizeAccountType(type) {
  return String(type ?? '').trim().toLowerCase().replace(/_/g, ' ');
}

function isCashAccountRow(account) {
  if (!account) return false;
  const t = normalizeAccountType(account.type);
  if (t === 'checking' || t === 'savings') return true;
  return ['money market', 'money_market', 'cd'].includes(t);
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function formatMoney(n) {
  return roundMoney(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

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
  const opts = { userId: null, dbPath: null, startMonth: '2026-06-01', endMonth: '2029-07-01' };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--user-id') opts.userId = Number(argv[++i]);
    else if (arg === '--db') opts.dbPath = argv[++i];
    else if (arg === '--start') opts.startMonth = toLocalMonthKey(argv[++i]);
    else if (arg === '--end') opts.endMonth = toLocalMonthKey(argv[++i]);
  }
  opts.dbPath = opts.dbPath || defaultDbPath();
  return opts;
}

function addCalendarMonths(monthKey, delta) {
  const [y, m] = toLocalMonthKey(monthKey).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthRangeInclusive(startKey, endKey) {
  const months = [];
  let key = toLocalMonthKey(startKey);
  const end = toLocalMonthKey(endKey);
  while (key <= end) {
    months.push(key);
    key = addCalendarMonths(key, 1);
  }
  return months;
}

/** Matches PropertyMapView budget table footer: sum of category Available for the month. */
function sumSnapshotTotalAvailable(snapshot) {
  const categories = snapshot?.categories || [];
  return roundMoney(
    categories.reduce((sum, cat) => sum + (Number(cat.available) || 0), 0)
  );
}

/** Cash Accounts View: listed checking + savings (not hidden), sum of account.balance. */
function partitionListedCashAccounts(accounts) {
  const listed = (accounts || []).filter(
    (a) =>
      a &&
      isCashAccountRow(a) &&
      !isAccountHidden(a) &&
      String(a.account_status || 'active').toLowerCase() !== 'archived'
  );
  const checking = listed.filter((a) => normalizeAccountType(a.type) === 'checking');
  const savings = listed.filter((a) => normalizeAccountType(a.type) !== 'checking');
  return { checking, savings, all: listed };
}

async function loadAccounts(db, userId) {
  return db.all(
    `SELECT a.*,
            (SELECT COALESCE(SUM(t.amount), 0)
             FROM transactions t
             WHERE CAST(t.account_id AS TEXT) = CAST(a.id AS TEXT)
               AND IFNULL(t.is_deleted, 0) = 0) AS register_balance
     FROM accounts a
     WHERE a.user_id = ?
     ORDER BY a.type, a.name`,
    [userId]
  );
}

async function resolveUserId(db, userId) {
  if (userId) return userId;
  const row = await db.get('SELECT id FROM users ORDER BY id ASC LIMIT 1');
  return row?.id ?? null;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!fs.existsSync(opts.dbPath)) {
    console.error(`Database not found: ${opts.dbPath}`);
    process.exit(1);
  }

  const db = await open({ filename: opts.dbPath, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  const userId = await resolveUserId(db, opts.userId);
  if (!userId) {
    console.error('No user found in database.');
    process.exit(1);
  }

  const months = monthRangeInclusive(opts.startMonth, opts.endMonth);
  const monthlyRows = [];
  let cumulativeTotalAvailable = 0;

  console.log('\n=== Monthly Budget — Total Available (table footer) ===');
  console.log(`Production DB: ${opts.dbPath}`);
  console.log(`User ID: ${userId}`);
  console.log(`Range: ${opts.startMonth.slice(0, 7)} → ${opts.endMonth.slice(0, 7)} (${months.length} months)\n`);

  for (const monthKey of months) {
    const snapshot = await getBudgetMonthSnapshot(db, userId, monthKey);
    const totalAvailable = sumSnapshotTotalAvailable(snapshot);
    cumulativeTotalAvailable = roundMoney(cumulativeTotalAvailable + totalAvailable);
    monthlyRows.push({ monthKey, totalAvailable, categoryCount: snapshot.categories?.length || 0 });
    console.log(
      `${monthKey.slice(0, 7)}  Total Available: ${formatMoney(totalAvailable)}  (${snapshot.categories?.length || 0} categories)`
    );
  }

  console.log('\n--- Cumulative ---');
  console.log(`Sum of Total Available (all months): ${formatMoney(cumulativeTotalAvailable)}`);

  console.log('\n=== Cash Accounts View (Checking + Savings) ===');
  const accounts = await loadAccounts(db, userId);
  const { checking, savings, all: cashAccounts } = partitionListedCashAccounts(accounts);

  const printAccount = (account) => {
    const balance = roundMoney(Number(account.balance) || 0);
    const type = normalizeAccountType(account.type);
    console.log(`  ${type.padEnd(8)} ${account.name}  ${formatMoney(balance)}`);
    return balance;
  };

  console.log('\nChecking accounts:');
  let checkingTotal = 0;
  for (const account of checking) {
    checkingTotal = roundMoney(checkingTotal + printAccount(account));
  }
  if (!checking.length) console.log('  (none)');

  console.log('\nSavings accounts:');
  let savingsTotal = 0;
  for (const account of savings) {
    savingsTotal = roundMoney(savingsTotal + printAccount(account));
  }
  if (!savings.length) console.log('  (none)');

  const combinedCashBalance = roundMoney(checkingTotal + savingsTotal);
  console.log('\n--- Cash Accounts combined balance (Checking + Savings) ---');
  console.log(`Checking subtotal: ${formatMoney(checkingTotal)}`);
  console.log(`Savings subtotal:  ${formatMoney(savingsTotal)}`);
  console.log(`Combined total:    ${formatMoney(combinedCashBalance)}`);

  const onBudgetCash = await computeOnBudgetCash(db, userId);
  console.log(`\nOn-budget cash (budget engine): ${formatMoney(onBudgetCash)}`);

  console.log('\n=== Validation ===');
  const discrepancy = roundMoney(combinedCashBalance - cumulativeTotalAvailable);
  const tolerance = 0.02;
  const passed = Math.abs(discrepancy) <= tolerance;

  console.log(`Cumulative Total Available:  ${formatMoney(cumulativeTotalAvailable)}`);
  console.log(`Combined cash balance:       ${formatMoney(combinedCashBalance)}`);
  console.log(`Difference (cash − cumulative available): ${formatMoney(discrepancy)}`);
  console.log(`Status: ${passed ? 'PASS — values match within $0.02' : 'FAIL — values do not match'}`);

  if (!passed) {
    console.log('\nNote: Summing Total Available across every budget month counts the same');
    console.log('category envelopes repeatedly (once per month). That total is not expected to');
    console.log('equal on-budget cash unless each month represents non-overlapping slices.');
    const juneRow = monthlyRows.find((r) => r.monthKey === opts.startMonth);
    if (juneRow) {
      const juneOnlyDelta = roundMoney(combinedCashBalance - juneRow.totalAvailable);
      console.log(`\nReference — ${opts.startMonth.slice(0, 7)} only:`);
      console.log(`  Total Available (current month): ${formatMoney(juneRow.totalAvailable)}`);
      console.log(`  Cash − June Total Available:   ${formatMoney(juneOnlyDelta)}`);
    }
  }

  await db.close();

  const result = {
    userId,
    dbPath: opts.dbPath,
    monthCount: months.length,
    cumulativeTotalAvailable,
    combinedCashBalance,
    onBudgetCash,
    discrepancy,
    validationPassed: passed,
    monthlyRows,
  };

  console.log('\n--- JSON summary ---');
  console.log(JSON.stringify(result, null, 2));

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
