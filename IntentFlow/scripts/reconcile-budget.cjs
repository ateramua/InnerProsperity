#!/usr/bin/env node
'use strict';

/**
 * Budget reconciliation CLI — trace Ready to Assign vs category envelopes.
 *
 * Usage:
 *   node scripts/reconcile-budget.cjs --report [--user-id 3]
 *   node scripts/reconcile-budget.cjs --refresh-snapshot [--user-id 3]
 *   node scripts/reconcile-budget.cjs --consolidate-assignments --month 2026-05-01 [--user-id 3] [--apply]
 *   node scripts/reconcile-budget.cjs --rollback-envelopes --month 2026-05-01 [--user-id 3] [--apply]
 *
 * Default DB: ~/Library/Application Support/intentflow/money-manager.db (macOS production)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const {
  toLocalMonthKey,
  getBudgetMonthSnapshot,
  getGlobalBudgetSummary,
  refreshBudgetMonthsForward,
  repairAndRefreshBudgetMonths,
  consolidateAvailableIntoMonthAssignments,
  resetEnvelopesFromMonth,
  auditBudgetMonthIntegrity,
} = require('../src/services/budget/monthlyBudgetService.cjs');

function roundMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function parseArgs(argv) {
  const opts = {
    report: false,
    refreshSnapshot: false,
    releaseCarryover: false,
    repairAssignments: false,
    consolidateAssignments: false,
    rollbackEnvelopes: false,
    apply: false,
    userId: null,
    monthKey: toLocalMonthKey(new Date()),
    dbPath: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--report') opts.report = true;
    else if (arg === '--refresh-snapshot') opts.refreshSnapshot = true;
    else if (arg === '--release-carryover') opts.releaseCarryover = true;
    else if (arg === '--repair-assignments') opts.repairAssignments = true;
    else if (arg === '--consolidate-assignments') opts.consolidateAssignments = true;
    else if (arg === '--rollback-envelopes') opts.rollbackEnvelopes = true;
    else if (arg === '--apply') opts.apply = true;
    else if (arg === '--user-id') opts.userId = parseInt(argv[++i], 10);
    else if (arg === '--month') opts.monthKey = toLocalMonthKey(argv[++i]);
    else if (arg === '--db') opts.dbPath = argv[++i];
  }
  if (!opts.report && !opts.refreshSnapshot && !opts.releaseCarryover && !opts.repairAssignments && !opts.consolidateAssignments && !opts.rollbackEnvelopes) {
    opts.report = true;
  }
  return opts;
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

async function resolveUserId(db, userId) {
  if (userId) return userId;
  const row = await db.get(
    `SELECT id FROM users ORDER BY id DESC LIMIT 1`
  );
  return row?.id ?? null;
}

async function getCashTotal(db, userId) {
  const row = await db.get(
    `SELECT ROUND(COALESCE(SUM(balance), 0), 2) AS total
     FROM accounts
     WHERE user_id = ?
       AND type IN ('checking', 'savings')
       AND IFNULL(is_active, 1) = 1
       AND IFNULL(account_status, 'active') = 'active'`,
    [userId]
  );
  return Number(row?.total) || 0;
}

async function getMonthEnvelopeTotals(db, userId, monthKey) {
  const row = await db.get(
    `SELECT
       COUNT(*) AS row_count,
       ROUND(COALESCE(SUM(mb.budgeted_amount), 0), 2) AS sum_budgeted,
       ROUND(COALESCE(SUM(mb.available_amount), 0), 2) AS sum_available,
       ROUND(COALESCE(SUM(mb.activity_amount), 0), 2) AS sum_activity
     FROM monthly_budgets mb
     INNER JOIN categories c ON c.id = mb.category_id
     WHERE c.user_id = ?
       AND IFNULL(c.archived, 0) = 0
       AND mb.month = ?`,
    [userId, monthKey]
  );
  return row || {};
}

async function getCategoryRollup(db, userId) {
  const row = await db.get(
    `SELECT
       COUNT(*) AS row_count,
       ROUND(COALESCE(SUM(assigned), 0), 2) AS sum_assigned,
       ROUND(COALESCE(SUM(available), 0), 2) AS sum_available
     FROM categories
     WHERE user_id = ?
       AND IFNULL(archived, 0) = 0`,
    [userId]
  );
  return row || {};
}

async function printReport(db, userId, monthKey) {
  const cash = await getCashTotal(db, userId);
  const global = await getGlobalBudgetSummary(db, userId, cash);
  const monthTotals = await getMonthEnvelopeTotals(db, userId, monthKey);
  const categoryRollup = await getCategoryRollup(db, userId);
  const sumAvailable = Number(monthTotals.sum_available) || 0;
  const legacyRta = roundMoney(cash - sumAvailable);

  console.log('\n=== Budget Reconciliation Report ===');
  console.log(`User ID:              ${userId}`);
  console.log(`Month key (view):     ${monthKey}`);
  console.log(`Cash (checking+savings): $${cash.toFixed(2)}`);
  console.log(`Σ Assigned (all months): $${global.totalAssigned.toFixed(2)}`);
  console.log(`Ready to Assign (global): $${global.readyToAssign.toFixed(2)}  (= cash − Σ assigned)`);
  console.log(`Reserved in future:     $${global.futureAssigned.toFixed(2)}`);
  console.log(`Σ Category Available (${monthKey}): $${sumAvailable.toFixed(2)}  (this month only)`);
  console.log(`Legacy RTA (cash − Σ avail this month): $${legacyRta.toFixed(2)}  [deprecated view]`);
  console.log('');
  console.log('--- monthly_budgets (this month) ---');
  console.log(`  Rows:                 ${monthTotals.row_count}`);
  console.log(`  Σ budgeted (Assigned): $${Number(monthTotals.sum_budgeted || 0).toFixed(2)}`);
  console.log(`  Σ available:          $${sumAvailable.toFixed(2)}`);
  console.log(`  Σ activity:             $${Number(monthTotals.sum_activity || 0).toFixed(2)}`);
  console.log('');
  console.log('--- categories table rollup (may be stale before refresh) ---');
  console.log(`  Σ assigned:           $${Number(categoryRollup.sum_assigned || 0).toFixed(2)}`);
  console.log(`  Σ available:          $${Number(categoryRollup.sum_available || 0).toFixed(2)}`);

  const orphanRows = await db.all(
    `SELECT c.name,
            mb.budgeted_amount,
            mb.available_amount,
            mb.updated_at
     FROM monthly_budgets mb
     INNER JOIN categories c ON c.id = mb.category_id
     WHERE c.user_id = ?
       AND IFNULL(c.archived, 0) = 0
       AND mb.month = ?
       AND IFNULL(mb.budgeted_amount, 0) = 0
       AND IFNULL(mb.available_amount, 0) > 0
     ORDER BY mb.available_amount DESC`,
    [userId, monthKey]
  );

  const orphanSum = roundMoney(
    orphanRows.reduce((s, r) => s + (Number(r.available_amount) || 0), 0)
  );

  console.log('');
  console.log('--- carryover without current-month assignment ---');
  console.log(
    `  Categories with available>0 but budgeted=0: ${orphanRows.length}  (total $${orphanSum.toFixed(2)})`
  );
  console.log('  These are prior-month envelope balances carried forward, not Smart Assign rows.');
  if (orphanRows.length > 0 && orphanRows.length <= 30) {
    for (const row of orphanRows) {
      console.log(
        `    • ${row.name}: available $${Number(row.available_amount).toFixed(2)} (updated ${row.updated_at})`
      );
    }
  }

  const smartAssignCandidates = await db.all(
    `SELECT mb.month, c.name, mb.budgeted_amount, mb.available_amount, mb.updated_at
     FROM monthly_budgets mb
     INNER JOIN categories c ON c.id = mb.category_id
     WHERE c.user_id = ?
       AND mb.updated_at >= datetime('now', '-7 days')
       AND IFNULL(mb.budgeted_amount, 0) > 0
     ORDER BY mb.updated_at DESC
     LIMIT 20`,
    [userId]
  );

  console.log('');
  console.log('--- recent assignment records (budgeted > 0, last 7 days) ---');
  if (!smartAssignCandidates.length) {
    console.log('  None found — Smart Assign did not persist any budgeted amounts.');
  } else {
    for (const row of smartAssignCandidates) {
      console.log(
        `    • ${row.month} ${row.name}: budgeted $${Number(row.budgeted_amount).toFixed(2)} (${row.updated_at})`
      );
    }
  }

  const monthHistory = await db.all(
    `SELECT mb.month,
            ROUND(SUM(mb.budgeted_amount), 2) AS sum_budgeted,
            ROUND(SUM(mb.available_amount), 2) AS sum_available
     FROM monthly_budgets mb
     INNER JOIN categories c ON c.id = mb.category_id
     WHERE c.user_id = ?
       AND IFNULL(c.archived, 0) = 0
     GROUP BY mb.month
     ORDER BY mb.month DESC
     LIMIT 6`,
    [userId]
  );

  console.log('');
  console.log('--- monthly envelope history (active categories) ---');
  for (const row of monthHistory) {
    console.log(
      `  ${row.month}: budgeted $${Number(row.sum_budgeted).toFixed(2)}, available $${Number(row.sum_available).toFixed(2)}`
    );
  }

  console.log('');
  console.log('=== Fund trace summary ===');
  console.log(`Every dollar in cash is accounted for:`);
  console.log(`  $${readyToAssign.toFixed(2)} Ready to Assign`);
  console.log(`+ $${sumAvailable.toFixed(2)} in category Available envelopes`);
  console.log(`= $${cash.toFixed(2)} total cash`);
  console.log('');

  return { cash, sumAvailable, readyToAssign, orphanSum, orphanRows };
}

async function backupDatabase(dbPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.backup-${stamp}`;
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Database backup: ${backupPath}`);
  return backupPath;
}

/**
 * Release carryover envelopes for a month where budgeted=0 back to Ready to Assign.
 * Zeros available for those rows and rebuilds forward months.
 */
async function releaseCarryover(db, userId, monthKey, apply) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const rows = await db.all(
    `SELECT mb.category_id, c.name, mb.budgeted_amount, mb.available_amount, mb.activity_amount
     FROM monthly_budgets mb
     INNER JOIN categories c ON c.id = mb.category_id
     WHERE c.user_id = ?
       AND IFNULL(c.archived, 0) = 0
       AND mb.month = ?
       AND IFNULL(mb.budgeted_amount, 0) = 0
       AND IFNULL(mb.available_amount, 0) <> 0`,
    [userId, normalizedMonth]
  );

  const releaseTotal = roundMoney(
    rows.reduce((s, r) => s + (Number(r.available_amount) || 0), 0)
  );

  console.log(`\nRelease carryover for ${normalizedMonth}:`);
  console.log(`  ${rows.length} categories, $${releaseTotal.toFixed(2)} → Ready to Assign`);

  if (!rows.length) {
    console.log('  Nothing to release.');
    return;
  }

  if (!apply) {
    console.log('\n  Dry run — pass --apply to execute (creates DB backup first).');
    for (const row of rows.slice(0, 15)) {
      console.log(`    • ${row.name}: release $${Number(row.available_amount).toFixed(2)}`);
    }
    if (rows.length > 15) console.log(`    … and ${rows.length - 15} more`);
    return;
  }

  await db.exec('BEGIN');
  try {
    for (const row of rows) {
      const activity = Number(row.activity_amount) || 0;
      const nextAvailable = roundMoney(0 - activity);
      await db.run(
        `UPDATE monthly_budgets
         SET available_amount = ?, updated_at = datetime('now')
         WHERE category_id = ? AND month = ?`,
        [nextAvailable, row.category_id, normalizedMonth]
      );
    }
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  await refreshBudgetMonthsForward(db, userId, normalizedMonth, 3);
  await getBudgetMonthSnapshot(db, userId, normalizedMonth);

  const after = await printReport(db, userId, normalizedMonth);
  console.log(`Released $${releaseTotal.toFixed(2)} to Ready to Assign.`);
  console.log(`New Ready to Assign: $${after.readyToAssign.toFixed(2)}`);
}

async function printDetailedAudit(db, userId, monthKey) {
  const audit = await auditBudgetMonthIntegrity(db, userId, monthKey);
  const cash = await getCashTotal(db, userId);
  const readyToAssign = roundMoney(cash - audit.totals.available);

  console.log('\n=== Detailed Budget Audit ===');
  console.log(`Month: ${audit.monthKey}`);
  console.log(`Cash: $${cash.toFixed(2)}`);
  console.log(`Σ Assigned: $${audit.totals.assigned.toFixed(2)}`);
  console.log(`Σ Available: $${audit.totals.available.toFixed(2)}`);
  console.log(`Ready to Assign: $${readyToAssign.toFixed(2)}`);
  console.log(`Untraceable Available (Assigned=0, Activity=0): $${audit.totals.untraceableAvailable.toFixed(2)}`);
  console.log('\nCategories with untraceable Available:');
  for (const row of audit.categories.filter((r) => r.untraceable)) {
    console.log(`  • ${row.name}: Available $${row.available.toFixed(2)} (prev carryover $${row.prevAvailable.toFixed(2)}, Assigned $${row.assigned.toFixed(2)})`);
  }
  return { audit, cash, readyToAssign };
}

async function main() {
  const opts = parseArgs(process.argv);
  const dbPath = opts.dbPath || defaultDbPath();

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  const userId = await resolveUserId(db, opts.userId);
  if (!userId) {
    console.error('No user id found.');
    process.exit(1);
  }

  const monthKey = opts.monthKey;

  if (opts.report) {
    await printReport(db, userId, monthKey);
    await printDetailedAudit(db, userId, monthKey);
  }

  if (opts.consolidateAssignments) {
    if (opts.apply) {
      await backupDatabase(dbPath);
    }
    await printDetailedAudit(db, userId, monthKey);
    if (!opts.apply) {
      console.log('\nConsolidate (dry run): converts Available → Assigned with zero carryover.');
      console.log('Pass --apply to execute (creates DB backup first).');
    } else {
      const result = await consolidateAvailableIntoMonthAssignments(db, userId, monthKey);
      console.log(`\nConsolidated ${result.conversions.length} categories into assignment records.`);
      for (const row of result.conversions.slice(0, 25)) {
        console.log(`  • ${row.name}: Assigned $${Number(row.assigned).toFixed(2)}, Available $${Number(row.available).toFixed(2)}`);
      }
      if (result.conversions.length > 25) {
        console.log(`  … and ${result.conversions.length - 25} more`);
      }
      await printReport(db, userId, monthKey);
      await printDetailedAudit(db, userId, monthKey);
    }
  }

  if (opts.rollbackEnvelopes) {
    if (opts.apply) {
      await backupDatabase(dbPath);
    }
    await printDetailedAudit(db, userId, monthKey);
    if (!opts.apply) {
      console.log('\nRollback (dry run): zeros envelopes from this month forward → funds return to Ready to Assign.');
      console.log('Pass --apply to execute (creates DB backup first).');
    } else {
      const result = await resetEnvelopesFromMonth(db, userId, monthKey);
      console.log(`\nReset ${result.categoriesReset} categories from ${result.monthKey} forward.`);
      await printReport(db, userId, monthKey);
      await printDetailedAudit(db, userId, monthKey);
    }
  }

  if (opts.refreshSnapshot) {
    if (opts.apply) {
      await backupDatabase(dbPath);
    }
    console.log(`\nRefreshing budget snapshot for ${monthKey}…`);
    await getBudgetMonthSnapshot(db, userId, monthKey);
    await refreshBudgetMonthsForward(db, userId, monthKey, 2);
    console.log('Snapshot refresh complete.');
    await printReport(db, userId, monthKey);
  }

  if (opts.repairAssignments) {
    if (opts.apply) {
      await backupDatabase(dbPath);
    }
    if (!opts.apply) {
      console.log('\nRepair assignments (dry run): scans for Available written without matching Assigned.');
      console.log('Pass --apply to execute (creates DB backup first).');
    } else {
      const result = await repairAndRefreshBudgetMonths(db, userId, monthKey, 6);
      console.log(`\nRepaired ${result.repairs.length} category/month rows.`);
      for (const repair of result.repairs.slice(0, 20)) {
        console.log(
          `  • ${repair.name}: budgeted ${repair.previousBudgeted} → ${repair.correctedBudgeted}`
        );
      }
      if (result.repairs.length > 20) {
        console.log(`  … and ${result.repairs.length - 20} more`);
      }
      await printReport(db, userId, monthKey);
    }
  }

  if (opts.releaseCarryover) {
    if (opts.apply) {
      await backupDatabase(dbPath);
    }
    await releaseCarryover(db, userId, monthKey, opts.apply);
  }

  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
