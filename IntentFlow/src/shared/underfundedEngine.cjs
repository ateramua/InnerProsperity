/**
 * Deterministic underfunded calculations (category + budget level).
 * CommonJS mirror of underfundedEngine.mjs for Electron main + Node tests.
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

function getCurrentValue(category, goalType) {
  const assigned = toMoney(category.assigned);
  const available = toMoney(category.available);

  return goalType === 'monthly_funding' ? assigned : available;
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
  const goalType = normalizeGoalType(category.target_type);

  const targetAmount = toMoney(category.target_amount);
  if (!targetAmount || targetAmount <= 0) {
    return {
      underfunded: 0,
      needed: 0,
      goalType,
      progress: null,
      status: 'no-target',
      targetAmount: 0,
      currentAmount: 0,
    };
  }

  if (SPENDING_TARGET_TYPES.has(rawType) || goalType === 'spending_target') {
    const available = toMoney(category.available);
    const forecastedNeed = toMoney(
      category.forecasted_need ??
        category.forecastedNeed ??
        category.target_amount ??
        category.average_spending ??
        0
    );
    const underfunded = Math.max(0, forecastedNeed - available);
    return {
      underfunded,
      needed: underfunded,
      goalType: 'spending_target',
      progress: forecastedNeed ? (available / forecastedNeed) * 100 : null,
      status: underfunded > 0 ? 'unfunded' : 'funded',
      targetAmount: forecastedNeed,
      currentAmount: available,
    };
  }

  const currentValue = getCurrentValue(category, goalType);
  const underfunded = Math.max(0, targetAmount - currentValue);

  return {
    underfunded,
    needed: underfunded,
    goalType,
    progress: targetAmount ? (currentValue / targetAmount) * 100 : 0,
    status:
      currentValue >= targetAmount
        ? 'funded'
        : currentValue > 0
          ? 'partial'
          : 'unfunded',
    targetAmount,
    currentAmount: currentValue,
  };
}

function computeBudgetUnderfunded(categories, opts = {}) {
  const isArchived = opts.isArchived || (() => false);

  let underfundedTotal = 0;
  const breakdown = [];

  for (const cat of categories || []) {
    if (!cat || (!opts.includeArchived && isArchived(cat))) continue;

    const res = computeCategoryUnderfunded(cat);

    if (res.underfunded > 0) {
      underfundedTotal += res.underfunded;
      breakdown.push({
        categoryId: cat.id,
        underfunded: res.underfunded,
        goalType: res.goalType,
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

function computeFundUnderfundedPlan(categories, opts = {}) {
  const isArchived = opts.isArchived || (() => false);

  const pool = Number(opts.pool);
  const hasCap = Number.isFinite(pool) && pool >= 0;
  let remaining = hasCap ? pool : Infinity;

  const queue = [];
  let goalUnderfundedTotal = 0;
  let overspentTotal = 0;

  for (const cat of categories || []) {
    if (!cat || isArchived(cat)) continue;

    const available = toMoney(cat.available);

    if (available < -0.005) {
      const needed = toMoney(Math.abs(available));
      overspentTotal += needed;

      queue.push({
        categoryId: cat.id,
        categoryName: cat.name,
        needed,
        urgency: 1,
        kind: 'overspent',
      });
      continue;
    }

    const meta = computeCategoryUnderfunded(cat);
    const needed = toMoney(meta.underfunded ?? meta.needed ?? 0);
    if (needed <= 0) continue;

    let urgency = 5;
    if (meta.goalType === 'monthly_funding') urgency = 2;
    else if (meta.goalType === 'target_balance') urgency = 3;
    else if (meta.goalType === 'deadline') urgency = 4;

    goalUnderfundedTotal += needed;

    queue.push({
      categoryId: cat.id,
      categoryName: cat.name,
      needed,
      urgency,
      kind: 'goal',
      goalType: meta.goalType,
    });
  }

  queue.sort((a, b) => a.urgency - b.urgency);

  const allocations = [];

  for (const item of queue) {
    if (remaining <= 0) break;

    const amount = toMoney(Math.min(item.needed, remaining));
    if (amount <= 0) continue;

    let reason;
    if (item.kind === 'overspent') {
      reason = `Cover overspending: ${item.categoryName}`;
    } else if (item.goalType === 'monthly_funding') {
      reason = `Monthly goal: ${item.categoryName}`;
    } else if (item.goalType === 'target_balance') {
      reason = `Target balance: ${item.categoryName}`;
    } else {
      reason = `Deadline goal: ${item.categoryName}`;
    }

    allocations.push({
      categoryId: item.categoryId,
      amount,
      reason,
      kind: item.kind,
    });

    remaining = hasCap ? toMoney(remaining - amount) : remaining;
  }

  return {
    allocations,
    goalUnderfundedTotal: toMoney(goalUnderfundedTotal),
    overspentTotal: toMoney(overspentTotal),
    totalFundingNeed: toMoney(overspentTotal + goalUnderfundedTotal),
    totalToAssign: toMoney(allocations.reduce((sum, row) => sum + row.amount, 0)),
    remainingAfter: hasCap ? toMoney(Math.max(0, remaining)) : 0,
  };
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
  computeFundUnderfundedPlan,
};
