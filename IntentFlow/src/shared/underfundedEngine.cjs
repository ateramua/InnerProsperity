/**
 * Deterministic underfunded calculations (category + budget level).
 * Monthly funding goals use assigned this month only (ignore available rollover).
 */

const MONTHLY_FUNDING_TYPES = new Set([
  'monthly',
  'monthly_debt_payment',
  'monthly_savings',
]);

const TARGET_BALANCE_TYPES = new Set(['balance', 'target_balance']);

const DATE_GOAL_TYPES = new Set(['by_date', 'target_balance_by_date']);

const SPENDING_TARGET_TYPES = new Set(['spending_target', 'needed_for_spending']);

function toMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function normalizeGoalType(targetType) {
  const t = String(targetType || '').toLowerCase();
  if (!t) return 'none';
  if (SPENDING_TARGET_TYPES.has(t)) return 'spending_target';
  if (MONTHLY_FUNDING_TYPES.has(t)) return 'monthly_funding';
  if (TARGET_BALANCE_TYPES.has(t)) return 'target_balance';
  if (DATE_GOAL_TYPES.has(t)) return 'deadline';
  return 'none';
}

function computeCategoryUnderfunded(category) {
  if (!category) {
    return {
      underfunded: 0,
      needed: 0,
      goalType: 'none',
      progress: null,
      status: 'no-target',
      targetAmount: 0,
      currentAmount: 0,
    };
  }

  const rawType = String(category.target_type || '').toLowerCase();

  if (SPENDING_TARGET_TYPES.has(rawType)) {
    const available = toMoney(category.available);
    const forecastedNeed = toMoney(
      category.forecasted_need ??
        category.forecastedNeed ??
        (Number(category.target_amount) > 0 ? category.target_amount : null) ??
        category.average_spending
    );
    const underfunded = Math.max(0, forecastedNeed - available);
    const progress =
      forecastedNeed > 0 ? Math.min(100, (available / forecastedNeed) * 100) : null;
    return {
      underfunded,
      needed: underfunded,
      goalType: 'spending_target',
      progress,
      status: underfunded > 0 ? 'unfunded' : 'funded',
      targetAmount: forecastedNeed,
      currentAmount: available,
    };
  }

  const targetAmount = toMoney(category.target_amount);
  if (!targetAmount || targetAmount <= 0) {
    return {
      underfunded: 0,
      needed: 0,
      goalType: 'none',
      progress: null,
      status: 'no-target',
      targetAmount: 0,
      currentAmount: 0,
    };
  }

  const assigned = toMoney(category.assigned);
  const available = toMoney(category.available);
  const goalType = normalizeGoalType(category.target_type);

  if (MONTHLY_FUNDING_TYPES.has(rawType) || goalType === 'monthly_funding') {
    const underfunded = Math.max(0, targetAmount - assigned);
    const progress = targetAmount > 0 ? (assigned / targetAmount) * 100 : 0;
    return {
      underfunded,
      needed: underfunded,
      goalType: 'monthly_funding',
      progress,
      status: assigned >= targetAmount ? 'funded' : assigned > 0 ? 'partial' : 'unfunded',
      targetAmount,
      currentAmount: assigned,
    };
  }

  if (TARGET_BALANCE_TYPES.has(rawType) || goalType === 'target_balance') {
    const underfunded = Math.max(0, targetAmount - available);
    const progress = targetAmount > 0 ? (available / targetAmount) * 100 : 0;
    return {
      underfunded,
      needed: underfunded,
      goalType: 'target_balance',
      progress,
      status: available >= targetAmount ? 'funded' : available > 0 ? 'partial' : 'unfunded',
      targetAmount,
      currentAmount: available,
    };
  }

  if (DATE_GOAL_TYPES.has(rawType) || goalType === 'deadline') {
    if (!category.target_date) {
      return {
        underfunded: 0,
        needed: 0,
        goalType: 'deadline',
        progress: null,
        status: 'no-date',
        targetAmount,
        currentAmount: available,
      };
    }
    const today = new Date();
    const targetDate = new Date(category.target_date);
    const monthsRemaining = Math.max(
      0,
      (targetDate.getFullYear() - today.getFullYear()) * 12 +
        (targetDate.getMonth() - today.getMonth())
    );
    const totalNeeded = Math.max(0, targetAmount - available);
    const monthlyNeeded =
      monthsRemaining > 0 ? toMoney(totalNeeded / monthsRemaining) : totalNeeded;
    const progress = targetAmount > 0 ? (available / targetAmount) * 100 : 0;
    return {
      underfunded: totalNeeded,
      needed: totalNeeded,
      goalType: 'deadline',
      progress,
      status: progress >= 100 ? 'funded' : progress > 0 ? 'partial' : 'unfunded',
      targetAmount,
      currentAmount: available,
      monthlyNeeded,
      monthsRemaining,
    };
  }

  return {
    underfunded: 0,
    needed: 0,
    goalType: 'none',
    progress: null,
    status: 'no-target',
    targetAmount,
    currentAmount: 0,
  };
}

function computeBudgetUnderfunded(categories, opts = {}) {
  const isArchived = opts.isArchived || (() => false);
  const breakdown = [];
  let underfundedTotal = 0;

  for (const cat of categories || []) {
    if (!cat) continue;
    if (!opts.includeArchived && isArchived(cat)) continue;

    const result = computeCategoryUnderfunded(cat);
    if (result.underfunded > 0) {
      underfundedTotal += result.underfunded;
      breakdown.push({
        categoryId: cat.id,
        underfunded: result.underfunded,
        goalType: result.goalType,
      });
    }
  }

  return {
    underfundedTotal: toMoney(underfundedTotal),
    categoryBreakdown: breakdown,
  };
}

function attachUnderfundedFields(category) {
  const meta = computeCategoryUnderfunded(category);
  return {
    ...category,
    underfunded: meta.underfunded,
    needed: meta.needed,
    goalType: meta.goalType,
    goalStatus: meta.status,
    goalProgress: meta.progress,
    goalTargetAmount: meta.targetAmount,
    goalCurrentAmount: meta.currentAmount,
  };
}

function enrichBudgetSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.categories)) {
    return {
      ...snapshot,
      categories: [],
      underfundedTotal: 0,
      underfundedBreakdown: [],
    };
  }

  const categories = snapshot.categories.map((cat) => attachUnderfundedFields(cat));
  const budget = computeBudgetUnderfunded(categories);

  return {
    ...snapshot,
    categories,
    underfundedTotal: budget.underfundedTotal,
    underfundedBreakdown: budget.categoryBreakdown,
  };
}

function calculateTargetProgress(category) {
  return computeCategoryUnderfunded(category);
}

module.exports = {
  MONTHLY_FUNDING_TYPES,
  TARGET_BALANCE_TYPES,
  DATE_GOAL_TYPES,
  SPENDING_TARGET_TYPES,
  toMoney,
  normalizeGoalType,
  computeCategoryUnderfunded,
  computeBudgetUnderfunded,
  attachUnderfundedFields,
  enrichBudgetSnapshot,
  calculateTargetProgress,
};
