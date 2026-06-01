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

/** @returns {'none' | 'monthly_funding' | 'target_balance' | 'spending_target' | 'deadline'} */
export function normalizeGoalType(targetType) {
  const t = String(targetType || '').toLowerCase();
  if (!t) return 'none';
  if (MONTHLY_FUNDING_TYPES.has(t)) return 'monthly_funding';
  if (TARGET_BALANCE_TYPES.has(t)) return 'target_balance';
  if (DATE_GOAL_TYPES.has(t)) return 'deadline';
  if (SPENDING_TARGET_TYPES.has(t)) return 'spending_target';
  return 'none';
}

/**
 * Category-level underfunded + progress metadata.
 * @param {object} category
 * @returns {{
 *   underfunded: number,
 *   needed: number,
 *   goalType: string,
 *   progress: number | null,
 *   status: string,
 *   targetAmount: number,
 *   currentAmount: number,
 * }}
 */
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

/**
 * Budget-level aggregation.
 * @param {object[]} categories
 * @param {{ includeArchived?: boolean, isArchived?: (cat: object) => boolean }} [opts]
 */
export function computeBudgetUnderfunded(categories, opts = {}) {
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

/** @deprecated Alias for UI code that reads `.needed` */
export function calculateTargetProgress(category) {
  return computeCategoryUnderfunded(category);
}

/**
 * Plan Fund Underfunded allocations: overspent first, then monthly → balance → by-date goals.
 * @param {object[]} categories
 * @param {{ pool?: number, isArchived?: (cat: object) => boolean }} [opts]
 */
export function computeFundUnderfundedPlan(categories, opts = {}) {
  const isArchived = opts.isArchived || (() => false);
  const pool = Number(opts.pool);
  const hasPoolCap = Number.isFinite(pool) && pool >= 0;
  let remaining = hasPoolCap ? pool : Number.POSITIVE_INFINITY;

  let goalUnderfundedTotal = 0;
  let overspentTotal = 0;
  const queue = [];

  for (const cat of categories || []) {
    if (!cat || isArchived(cat)) continue;

    const available = Number(cat.available) || 0;
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

    const goalType = String(cat.target_type || '').toLowerCase();
    let urgency = null;
    if (MONTHLY_FUNDING_TYPES.has(goalType)) urgency = 2;
    else if (TARGET_BALANCE_TYPES.has(goalType)) urgency = 3;
    else if (DATE_GOAL_TYPES.has(goalType)) urgency = 4;
    else continue;

    goalUnderfundedTotal += needed;
    queue.push({
      categoryId: cat.id,
      categoryName: cat.name,
      needed,
      urgency,
      kind: 'goal',
      goalType,
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
    } else if (item.goalType && MONTHLY_FUNDING_TYPES.has(item.goalType)) {
      reason = `Monthly goal: ${item.categoryName}`;
    } else if (item.goalType && TARGET_BALANCE_TYPES.has(item.goalType)) {
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
    remaining = hasPoolCap ? toMoney(remaining - amount) : remaining;
  }

  const totalToAssign = allocations.reduce((sum, row) => sum + row.amount, 0);

  return {
    allocations,
    goalUnderfundedTotal: toMoney(goalUnderfundedTotal),
    overspentTotal: toMoney(overspentTotal),
    totalFundingNeed: toMoney(overspentTotal + goalUnderfundedTotal),
    totalToAssign: toMoney(totalToAssign),
    remainingAfter: hasPoolCap ? toMoney(Math.max(0, remaining)) : 0,
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

export function enrichBudgetSnapshot(snapshot) {
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
