/**
 * Budget integrity — IntentFlow accounting identity:
 *   ON_BUDGET_CASH = RTA + SUM(CATEGORY_AVAILABLE)
 */

const { roundMoney } = require('../../shared/readyToAssignEngine.cjs');
const { isOnBudgetCashAccount, isAccountActive } = require('../../utils/cashAccountUtils.cjs');
const readyToAssignPoolService = require('./readyToAssignPoolService.cjs');

function monthlyBudgetService() {
  return require('./monthlyBudgetService.cjs');
}

function accountWorkingBalance(account) {
  if (!account) return 0;
  const wb = account.working_balance;
  if (wb != null && Number.isFinite(Number(wb))) return Number(wb);
  return Number(account.balance) || 0;
}

/**
 * Sum on-budget checking + savings working balances (active accounts only).
 * @param {import('sqlite').Database} db
 * @param {string} userId
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

/**
 * Sum current-month category available (includes CC payment categories).
 * @param {import('sqlite').Database} db
 * @param {string} userId
 * @param {string} [monthKey]
 */
async function computeCategoryAvailableTotal(db, userId, monthKey) {
  const mbs = monthlyBudgetService();
  const normalizedMonth = mbs.toLocalMonthKey(monthKey || new Date());
  const snapshot = await mbs.getBudgetMonthSnapshot(db, userId, normalizedMonth);
  const categories = snapshot?.categories || [];
  return roundMoney(
    categories.reduce((sum, cat) => sum + (Number(cat.available) || 0), 0)
  );
}

/**
 * @returns {Promise<{
 *   onBudgetCash: number,
 *   readyToAssign: number,
 *   categoryTotal: number,
 *   totalCash: number,
 *   invariantValid: boolean,
 *   budgetInvariantDelta: number,
 *   monthKey: string,
 * }>}
 */
async function evaluateBudgetIdentity(db, userId, opts = {}) {
  const monthKey = monthlyBudgetService().toLocalMonthKey(opts.monthKey || new Date());
  const onBudgetCash = await computeOnBudgetCash(db, userId);
  const readyToAssign = await readyToAssignPoolService.getPoolBalance(db, userId);
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
  };
}

/**
 * Align RTA pool so cash = RTA + category available.
 */
async function reconcileBudgetIdentity(db, userId, opts = {}) {
  const state = await evaluateBudgetIdentity(db, userId, opts);
  if (state.invariantValid) return { ...state, reconciled: false };

  const targetRta = roundMoney(state.onBudgetCash - state.categoryTotal);
  await readyToAssignPoolService.setPoolBalance(db, userId, targetRta);
  await db.run(
    `UPDATE user_budget_pool
     SET pool_backfilled = 1, updated_at = datetime('now')
     WHERE user_id = ?`,
    [userId]
  );

  const after = await evaluateBudgetIdentity(db, userId, opts);
  return { ...after, reconciled: true, previousDelta: state.budgetInvariantDelta };
}

/**
 * Enforce identity; auto-reconcile by default unless opts.hardFail is true.
 */
async function assertBudgetIdentity(db, userId, opts = {}) {
  const state = await evaluateBudgetIdentity(db, userId, opts);
  if (state.invariantValid) return state;

  if (opts.autoReconcile !== false) {
    return reconcileBudgetIdentity(db, userId, opts);
  }

  const err = new Error(
    `Budget identity violation: on-budget cash ${state.onBudgetCash} != RTA ${state.readyToAssign} + category available ${state.categoryTotal} (delta ${state.budgetInvariantDelta})`
  );
  err.code = 'BUDGET_INTEGRITY_VIOLATION';
  err.breakdown = state;
  throw err;
}

/**
 * Restrict active on-budget accounts to a scenario scope (test isolation).
 * @param {string[]} keepAccountNames
 */
async function scopeActiveAccountsExcept(db, userId, keepAccountNames = []) {
  const keep = new Set((keepAccountNames || []).map((n) => String(n).trim()));
  const accounts = await db.all(
    `SELECT id, name FROM accounts WHERE user_id = ?`,
    [userId]
  );
  let deactivated = 0;
  let activated = 0;
  for (const acc of accounts) {
    const shouldKeep = keep.has(String(acc.name || '').trim());
    const result = await db.run(
      `UPDATE accounts
       SET is_active = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [shouldKeep ? 1 : 0, acc.id, userId]
    );
    if ((result?.changes ?? 0) > 0) {
      if (shouldKeep) activated += 1;
      else deactivated += 1;
    }
  }
  return { deactivated, activated, kept: [...keep] };
}

module.exports = {
  computeOnBudgetCash,
  computeCategoryAvailableTotal,
  evaluateBudgetIdentity,
  reconcileBudgetIdentity,
  assertBudgetIdentity,
  scopeActiveAccountsExcept,
};
