#!/usr/bin/env node
'use strict';

/**
 * Sum per-month Assigned totals from the current calendar month through an end month
 * (default: May 2028).
 *
 * Usage:
 *   node scripts/sum-assigned-forward-to-month.cjs
 *   node scripts/sum-assigned-forward-to-month.cjs --end-month 2028-05-01 --user-id 3
 *   node scripts/sum-assigned-forward-to-month.cjs --snapshot
 *   node scripts/sum-assigned-forward-to-month.cjs --json
 *
 * Default DB (macOS): ~/Library/Application Support/intentflow/money-manager.db
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { sqlCategoryNotArchived } = require('../src/shared/categoryArchiveFlags.cjs');
const {
  toLocalMonthKey,
  addCalendarMonths,
  getBudgetMonthSnapshot,
} = require('../src/services/budget/monthlyBudgetService.cjs');

const DEFAULT_END_MONTH = '2028-05-01';

function roundMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function formatMonthLabel(monthKey) {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})/);
  if (!match) return monthKey;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
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
  const opts = {
    endMonth: DEFAULT_END_MONTH,
    userId: null,
    dbPath: null,
    useSnapshot: false,
    json: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--end-month') opts.endMonth = argv[++i];
    else if (arg === '--user-id') opts.userId = parseInt(argv[++i], 10);
    else if (arg === '--db') opts.dbPath = argv[++i];
    else if (arg === '--snapshot') opts.useSnapshot = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

function enumerateMonthKeysInclusive(minMonthKey, maxMonthKey) {
  const min = toLocalMonthKey(minMonthKey);
  const max = toLocalMonthKey(maxMonthKey);
  if (min > max) return [];

  const keys = [];
  let key = min;
  while (key <= max) {
    keys.push(key);
    key = addCalendarMonths(key, 1);
  }
  return keys;
}

async function resolveUserId(db, userId) {
  if (userId) return userId;
  const row = await db.get(`SELECT id FROM users ORDER BY id DESC LIMIT 1`);
  return row?.id ?? null;
}

async function readMonthAssignedFromBudgetRows(db, userId, monthKey) {
  const row = await db.get(
    `SELECT ROUND(COALESCE(SUM(mb.budgeted_amount), 0), 2) AS total_assigned
     FROM monthly_budgets mb
     INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
     WHERE c.user_id = ?
       AND ${sqlCategoryNotArchived('c')}
       AND mb.month = ?`,
    [userId, toLocalMonthKey(monthKey)]
  );
  return roundMoney(row?.total_assigned ?? 0);
}

async function readMonthAssignedFromSnapshot(db, userId, monthKey) {
  const snap = await getBudgetMonthSnapshot(db, userId, monthKey);
  const categories = snap?.categories || [];
  let sum = 0;
  for (const cat of categories) {
    if (cat?.archived === 1 || cat?.archived === true) continue;
    sum += Number(cat.assigned) || 0;
  }
  return roundMoney(sum);
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log(`Usage: node scripts/sum-assigned-forward-to-month.cjs [options]

Options:
  --end-month YYYY-MM-DD   Last month to include (default: ${DEFAULT_END_MONTH})
  --user-id N              Budget user id (default: latest user in DB)
  --db PATH                SQLite database path
  --snapshot               Use full month snapshot per month (matches Prosperity Map UI; slower)
  --json                   Print JSON only
  --help                   Show this help
`);
    process.exit(0);
  }

  const dbPath = opts.dbPath || defaultDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    const userId = await resolveUserId(db, opts.userId);
    if (!userId) {
      console.error('No user found. Pass --user-id.');
      process.exit(1);
    }

    const startMonth = toLocalMonthKey(new Date());
    const endMonth = toLocalMonthKey(opts.endMonth);
    const monthKeys = enumerateMonthKeysInclusive(startMonth, endMonth);

    if (!monthKeys.length) {
      console.error(`Invalid range: ${startMonth} → ${endMonth}`);
      process.exit(1);
    }

    const readMonth = opts.useSnapshot
      ? (mk) => readMonthAssignedFromSnapshot(db, userId, mk)
      : (mk) => readMonthAssignedFromBudgetRows(db, userId, mk);

    const breakdown = [];
    let cumulative = 0;

    for (const monthKey of monthKeys) {
      const assigned = await readMonth(monthKey);
      cumulative = roundMoney(cumulative + assigned);
      breakdown.push({
        monthKey,
        monthLabel: formatMonthLabel(monthKey),
        assigned,
        cumulative,
      });
    }

    const totalAssigned = cumulative;
    const result = {
      userId,
      startMonth,
      endMonth,
      startMonthLabel: formatMonthLabel(startMonth),
      endMonthLabel: formatMonthLabel(endMonth),
      monthCount: monthKeys.length,
      totalAssigned,
      mode: opts.useSnapshot ? 'snapshot' : 'monthly_budgets',
      breakdown,
    };

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log('');
    console.log('Assigned totals by budget month');
    console.log(`User: ${userId}  |  Mode: ${result.mode}`);
    console.log(`Range: ${result.startMonthLabel} → ${result.endMonthLabel} (${monthKeys.length} months)`);
    console.log('');
    console.log('Month\t\t\tAssigned\t\tCumulative');
    console.log('----\t\t\t--------\t\t----------');
    for (const row of breakdown) {
      const label = row.monthLabel.padEnd(18);
      console.log(
        `${label}\t$${row.assigned.toFixed(2).padStart(12)}\t$${row.cumulative.toFixed(2).padStart(12)}`,
      );
    }
    console.log('');
    console.log('============================================================');
    console.log(
      `TOTAL ASSIGNED (${result.startMonthLabel} through ${result.endMonthLabel}): $${totalAssigned.toFixed(2)}`,
    );
    console.log('============================================================');
    console.log('');
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
