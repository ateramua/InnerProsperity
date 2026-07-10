#!/usr/bin/env node
'use strict';

/**
 * Repair over-assigned budget gap:
 * 1. Trim Wells 8133 CC payment assigned to card debt
 * 2. Release Cap One 4271 CC payment reserve (card in credit)
 * 3. Reconcile RTA pool to cash − category available
 */

const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { applySqlitePragmas } = require('../src/db/sqlitePragmas.cjs');
const monthlyBudgetService = require('../src/services/budget/monthlyBudgetService.cjs');
const budgetIntegrityService = require('../src/services/budget/budgetIntegrityService.cjs');
const {
  computeOverAssignedGap,
} = require('../src/services/budget/importedCashReconciliationService.cjs');
const {
  applyCreditCardPaymentReserveDelta,
} = require('../src/services/transactions/creditCardReserveUtils.cjs');

function defaultDbPath() {
  return path.join(os.homedir(), 'Library/Application Support/intentflow/money-manager.db');
}

function roundMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

async function findAccount(db, userId, pattern) {
  return db.get(
    `SELECT * FROM accounts
     WHERE user_id = ? AND name LIKE ?
       AND IFNULL(account_status, 'active') != 'archived'
     ORDER BY is_active DESC
     LIMIT 1`,
    [userId, pattern]
  );
}

async function getPaymentCategory(db, accountId) {
  return db.get(
    `SELECT c.* FROM categories c
     WHERE c.linked_account_id = ?
       AND c.is_credit_card_payment_category = 1`,
    [accountId]
  );
}

async function printStatus(db, userId, label) {
  const identity = await budgetIntegrityService.evaluateBudgetIdentity(db, userId, {
    monthKey: '2026-06-01',
  });
  const gap = computeOverAssignedGap(identity.budgetInvariantDelta);
  console.log(`\n=== ${label} ===`);
  console.log(`  Cash:       $${identity.onBudgetCash.toFixed(2)}`);
  console.log(`  RTA:        $${identity.readyToAssign.toFixed(2)}`);
  console.log(`  Categories: $${identity.categoryTotal.toFixed(2)}`);
  console.log(`  Delta:      $${identity.budgetInvariantDelta.toFixed(2)}`);
  console.log(`  Over-assigned gap: $${gap.toFixed(2)}`);
  return identity;
}

async function main() {
  const userId = Number(process.argv.find((a, i) => process.argv[i - 1] === '--user-id') || 1);
  const dbPath = process.argv.includes('--db')
    ? process.argv[process.argv.indexOf('--db') + 1]
    : defaultDbPath();

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await applySqlitePragmas(db);

  await printStatus(db, userId, 'BEFORE REPAIR');

  const monthKey = '2026-06-01';

  // --- 1. Wells Fargo 8133: trim payment bucket to card debt ---
  const wells8133 = await findAccount(db, userId, '%8133%');
  if (wells8133) {
    const debt = roundMoney(Math.max(0, -(Number(wells8133.working_balance) || Number(wells8133.balance) || 0)));
    const payCat = await getPaymentCategory(db, wells8133.id);
    if (payCat) {
      const mb = await db.get(
        `SELECT budgeted_amount FROM monthly_budgets WHERE category_id = ? AND month = ?`,
        [payCat.id, monthKey]
      );
      const current = roundMoney(Number(mb?.budgeted_amount) || 0);
      if (current > debt + 0.005) {
        console.log(`\nTrimming Wells 8133 CC payment: $${current.toFixed(2)} → $${debt.toFixed(2)}`);
        await monthlyBudgetService.applyMonthBudgetedAmount(db, userId, payCat.id, monthKey, debt, {
          auditSource: 'cc_payment_reserve',
          skipPoolAdjustment: true,
        });
      } else {
        console.log(`\nWells 8133 CC payment already at debt ($${current.toFixed(2)}).`);
      }
    }
  }

  // --- 2. Cap One 4271: release CC payment reserve (card in credit) ---
  const cap4271 = await findAccount(db, userId, '%4271%');
  if (cap4271) {
    const balance = Number(cap4271.working_balance) || Number(cap4271.balance) || 0;
    const payCat = await getPaymentCategory(db, cap4271.id);
    const reservedTxs = await db.all(
      `SELECT id, date, cc_payment_reserved FROM transactions
       WHERE account_id = ? AND user_id = ?
         AND IFNULL(is_deleted, 0) = 0
         AND IFNULL(cc_payment_reserved, 0) > 0`,
      [cap4271.id, userId]
    );

    if (reservedTxs.length) {
      console.log(`\nClearing Cap 4271 cc_payment_reserved on ${reservedTxs.length} transaction(s)...`);
      for (const tx of reservedTxs) {
        const reserved = Number(tx.cc_payment_reserved) || 0;
        await db.run(
          `UPDATE transactions SET cc_payment_reserved = 0, updated_at = datetime('now') WHERE id = ?`,
          [tx.id]
        );
        await applyCreditCardPaymentReserveDelta(db, {
          userId,
          accountId: cap4271.id,
          date: tx.date,
          delta: -reserved,
          userIntentAssignment: true,
        });
      }
    }

    if (payCat && balance >= -0.005) {
      const mb = await db.get(
        `SELECT budgeted_amount FROM monthly_budgets WHERE category_id = ? AND month = ?`,
        [payCat.id, monthKey]
      );
      const current = roundMoney(Number(mb?.budgeted_amount) || 0);
      if (current > 0.005) {
        console.log(`Zeroing Cap 4271 CC payment bucket (card balance $${balance.toFixed(2)}): was $${current.toFixed(2)}`);
        await monthlyBudgetService.applyMonthBudgetedAmount(db, userId, payCat.id, monthKey, 0, {
          auditSource: 'cc_payment_reserve',
          skipPoolAdjustment: true,
        });
      }
    }
  }

  // --- 3. Refresh envelopes then reconcile RTA pool ---
  console.log('\nRefreshing budget envelopes...');
  await monthlyBudgetService.refreshBudgetMonthsForward(db, userId, monthKey, 3);

  console.log('Reconciling RTA pool to cash − category available...');
  const reconciled = await budgetIntegrityService.reconcileBudgetIdentity(db, userId, {
    monthKey,
  });
  if (reconciled.reconciled) {
    console.log(`  RTA adjusted (was off by $${roundMoney(reconciled.previousDelta).toFixed(2)}).`);
  }

  await printStatus(db, userId, 'AFTER REPAIR');
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
