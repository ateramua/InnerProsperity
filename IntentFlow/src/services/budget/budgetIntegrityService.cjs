/**
 * Budget integrity — IntentFlow accounting identity.
 *
 * Global identity (month-independent):
 *   ON_BUDGET_CASH = RTA + categoryAvailable(anchorMonth) + futureAssignedAfter(anchorMonth)
 *
 * Legacy month-scoped identity retained for diagnostics only.
 */

const { roundMoney } = require('../../shared/readyToAssignEngine.cjs');
const { isOnBudgetCashAccount, isAccountActive } = require('../../utils/cashAccountUtils.cjs');
const readyToAssignPoolService = require('./readyToAssignPoolService.cjs');
const rtaLedgerService = require('./rtaLedgerService.cjs');

function monthlyBudgetService() {
  return require('./monthlyBudgetService.cjs');
}

function accountWorkingBalance(account) {
  if (!account) return 0;
  const wb = account.working_balance;
  if (wb != null && Number.isFinite(Number(wb))) return Number(wb);
  return Number(account.balance) || 0;
}

async function readReadyToAssign(db, userId) {
  return rtaLedgerService.getAuthoritativeRta(db, userId);
}

/**
 * Sum on-budget checking + savings working balances (active accounts only).
 */
async function computeOnBudgetCash(db, userId) {
  const accounts = await db.all(
    `SELECT id, type, account_type_category, is_active,
            balance, working_balance
     FROM accounts
     WHERE user_id = ?
       AND IFNULL(is_active, 1) = 1
       AND IFNULL(account_status, 'active') IN ('active')`,
    [userId]
  );
  return roundMoney(
    accounts.reduce((sum, acc) => {
      if (!isOnBudgetCashAccount(acc) || !isAccountActive(acc)) return sum;
      return sum + accountWorkingBalance(acc);
    }, 0)
  );
}

async function computeCategoryAvailableTotal(db, userId, monthKey) {
  const mbs = monthlyBudgetService();
  const normalizedMonth = mbs.toLocalMonthKey(monthKey || new Date());
  const snapshot = await mbs.getBudgetMonthSnapshot(db, userId, normalizedMonth);
  const categories = snapshot?.categories || [];
  return roundMoney(
    categories.reduce((sum, cat) => sum + (Number(cat.available) || 0), 0)
  );
}

async function computeMultiMonthCategoryAvailableTotal(db, userId, centerMonthKey) {
  const mbs = monthlyBudgetService();
  const center = mbs.toLocalMonthKey(centerMonthKey);
  const monthKeys = [
    mbs.addCalendarMonths(center, -1),
    center,
    mbs.addCalendarMonths(center, 1),
  ];
  let total = 0;
  for (const mk of monthKeys) {
    total += await computeCategoryAvailableTotal(db, userId, mk);
  }
  return roundMoney(total);
}

/**
 * Global budget identity — anchor is always the current calendar month (not UI month picker).
 */
async function evaluateGlobalBudgetIdentity(db, userId, opts = {}) {
  const mbs = monthlyBudgetService();
  const anchorMonth = mbs.toLocalMonthKey(opts.anchorMonth || new Date());
  const onBudgetCash = await computeOnBudgetCash(db, userId);
  const readyToAssign = await readReadyToAssign(db, userId);
  const categoryTotal = await computeCategoryAvailableTotal(db, userId, anchorMonth);

  const { rows } = await mbs.getGlobalAssignmentTotals(db, userId);
  const importedCashReconciliationService = require('./importedCashReconciliationService.cjs');
  const futureAssignedAfterAnchor = importedCashReconciliationService.computeFutureAssignedAfterMonth(
    rows,
    anchorMonth
  );
  const reservedBudget = roundMoney(categoryTotal + futureAssignedAfterAnchor);
  const budgetInvariantDelta = roundMoney(onBudgetCash - (readyToAssign + reservedBudget));

  return {
    onBudgetCash,
    readyToAssign,
    categoryTotal,
    futureAssignedAfterAnchor,
    reservedBudget,
    totalCash: onBudgetCash,
    invariantValid: Math.abs(budgetInvariantDelta) < 0.02,
    budgetInvariantDelta,
    anchorMonth,
    identityMode: 'global',
  };
}

async function evaluateMultiMonthBudgetIdentity(db, userId, centerMonthKey) {
  const onBudgetCash = await computeOnBudgetCash(db, userId);
  const readyToAssign = await readReadyToAssign(db, userId);
  const categoryTotal = await computeMultiMonthCategoryAvailableTotal(db, userId, centerMonthKey);
  const budgetInvariantDelta = roundMoney(
    onBudgetCash - (readyToAssign + categoryTotal)
  );
  return {
    onBudgetCash,
    readyToAssign,
    categoryTotal,
    totalCash: onBudgetCash,
    invariantValid: Math.abs(budgetInvariantDelta) < 0.02,
    budgetInvariantDelta,
    monthKey: monthlyBudgetService().toLocalMonthKey(centerMonthKey),
  };
}

/**
 * Legacy month-scoped identity (selected month only — may vary with month picker).
 */
async function evaluateBudgetIdentity(db, userId, opts = {}) {
  const monthKey = monthlyBudgetService().toLocalMonthKey(opts.monthKey || new Date());
  const onBudgetCash = await computeOnBudgetCash(db, userId);
  const readyToAssign = await readReadyToAssign(db, userId);
  const categoryTotal = await computeCategoryAvailableTotal(db, userId, monthKey);
  const budgetInvariantDelta = roundMoney(
    onBudgetCash - (readyToAssign + categoryTotal)
  );
  return {
    onBudgetCash,
    readyToAssign,
    categoryTotal,
    totalCash: onBudgetCash,
    invariantValid: Math.abs(budgetInvariantDelta) < 0.02,
    budgetInvariantDelta,
    monthKey,
    identityMode: 'month_scoped',
  };
}

/**
 * Sync RTA pool from ledger-derived balance (no cash − category administrative repair).
 */
async function reconcileBudgetIdentity(db, userId, opts = {}) {
  const state = await evaluateGlobalBudgetIdentity(db, userId, opts);
  if (state.invariantValid) {
    return { ...state, reconciled: false };
  }

  const sync = await rtaLedgerService.syncPoolFromLedger(db, userId, {
    source: 'ledger_sync',
  });
  const after = await evaluateGlobalBudgetIdentity(db, userId, opts);
  return {
    ...after,
    reconciled: true,
    previousDelta: state.budgetInvariantDelta,
    readyToAssign: sync.readyToAssign,
  };
}

async function assertBudgetIdentity(db, userId, opts = {}) {
  const state = await evaluateGlobalBudgetIdentity(db, userId, opts);
  if (state.invariantValid) return state;

  if (opts.autoReconcile !== false) {
    return reconcileBudgetIdentity(db, userId, opts);
  }

  const err = new Error(
    `Budget identity violation: on-budget cash ${state.onBudgetCash} != RTA ${state.readyToAssign} + ` +
      `reserved budget ${state.reservedBudget} (delta ${state.budgetInvariantDelta})`
  );
  err.code = 'BUDGET_INTEGRITY_VIOLATION';
  err.breakdown = state;
  throw err;
}

function rankScopedAccount(account, nameInKeepSet) {
  let score = 0;
  if (nameInKeepSet) score += 20;
  if (account.paired_category_id) score += 10;
  if (String(account.account_status || 'active').toLowerCase() === 'active') score += 5;
  if (account.is_active === 1 || account.is_active === true) score += 1;
  return score;
}

async function scopeActiveAccountsExcept(db, userId, keepAccountNames = []) {
  const keep = new Set((keepAccountNames || []).map((n) => String(n).trim()).filter(Boolean));
  const accounts = await db.all(`SELECT * FROM accounts WHERE user_id = ?`, [userId]);

  const byName = new Map();
  for (const acc of accounts) {
    const name = String(acc.name || '').trim();
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(acc);
  }

  let deactivated = 0;
  let activated = 0;

  for (const [name, rows] of byName.entries()) {
    const shouldKeepName = keep.has(name);
    if (!shouldKeepName) {
      for (const acc of rows) {
        if (acc.is_active === 1 || acc.is_active === true) {
          await db.run(
            `UPDATE accounts
             SET is_active = 0,
                 paired_category_id = NULL,
                 updated_at = datetime('now')
             WHERE id = ? AND user_id = ?`,
            [acc.id, userId]
          );
          deactivated += 1;
        }
      }
      continue;
    }

    const sorted = [...rows].sort(
      (a, b) =>
        rankScopedAccount(b, true) - rankScopedAccount(a, true) ||
        String(a.id).localeCompare(String(b.id))
    );
    const winner = sorted[0];

    for (const acc of rows) {
      const shouldBeActive = acc.id === winner.id;
      const nextActive = shouldBeActive ? 1 : 0;
      const currentlyActive = acc.is_active === 1 || acc.is_active === true;
      if (currentlyActive === shouldBeActive && (!shouldBeActive || acc.paired_category_id === winner.paired_category_id)) {
        continue;
      }
      await db.run(
        `UPDATE accounts
         SET is_active = ?,
             account_status = CASE WHEN ? = 1 THEN 'active' ELSE account_status END,
             merged_into_account_id = CASE WHEN ? = 1 THEN NULL ELSE merged_into_account_id END,
             paired_category_id = CASE WHEN ? = 1 THEN paired_category_id ELSE NULL END,
             updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
        [nextActive, nextActive, nextActive, nextActive, acc.id, userId]
      );
      if (shouldBeActive) activated += 1;
      else deactivated += 1;
    }
  }

  return { deactivated, activated, kept: [...keep] };
}

module.exports = {
  computeOnBudgetCash,
  computeCategoryAvailableTotal,
  computeMultiMonthCategoryAvailableTotal,
  evaluateBudgetIdentity,
  evaluateGlobalBudgetIdentity,
  evaluateMultiMonthBudgetIdentity,
  reconcileBudgetIdentity,
  assertBudgetIdentity,
  scopeActiveAccountsExcept,
};
