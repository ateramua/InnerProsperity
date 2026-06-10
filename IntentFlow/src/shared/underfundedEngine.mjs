/**
 * Deterministic underfunded calculations (category + budget level).
 * FIX: unified goal resolution + corrected funding logic.
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

/**
 * FIX: correct funding source per goal type
 * - monthly → assigned
 * - others → available
 */
function getCurrentValue(category, goalType) {
  const assigned = toMoney(category.assigned);
  const available = toMoney(category.available);

  return goalType === 'monthly_funding' ? assigned : available;
}

export function computeCategoryUnderfunded(category) {
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

  // Spending target override
  if (goalType === 'spending_target') {
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
      goalType,
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

export function computeBudgetUnderfunded(categories, opts = {}) {
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

export function computeFundUnderfundedPlan(categories, opts = {}) {
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

    if (available < 0) {
      const needed = Math.abs(available);
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
    const needed = meta.underfunded;

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

    const amount = Math.min(item.needed, remaining);

    allocations.push({
      categoryId: item.categoryId,
      amount: toMoney(amount),
      reason:
        item.kind === 'overspent'
          ? `Cover overspending: ${item.categoryName}`
          : `${item.goalType}: ${item.categoryName}`,
      kind: item.kind,
    });

    remaining = hasCap ? remaining - amount : remaining;
  }

  return {
    allocations,
    goalUnderfundedTotal: toMoney(goalUnderfundedTotal),
    overspentTotal: toMoney(overspentTotal),
    totalFundingNeed: toMoney(overspentTotal + goalUnderfundedTotal),
    totalToAssign: toMoney(allocations.reduce((s, a) => s + a.amount, 0)),
    remainingAfter: hasCap ? toMoney(Math.max(0, remaining)) : 0,
  };
}

export function attachUnderfundedFields(category) {
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

export function calculateTargetProgress(category) {
  return computeCategoryUnderfunded(category);
}

export function enrichBudgetSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.categories)) {
    return {
      ...snapshot,
      categories: [],
      underfundedTotal: 0,
      underfundedBreakdown: [],
    };
  }

  const categories = snapshot.categories.map(attachUnderfundedFields);
  const budget = computeBudgetUnderfunded(categories);

  return {
    ...snapshot,
    categories,
    underfundedTotal: budget.underfundedTotal,
    underfundedBreakdown: budget.categoryBreakdown,
  };
}