/**
 * Budget flow orchestration harness aligned with IntentFlow PropertyMapView + underfundedEngine.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const intentflowRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../IntentFlow',
);
const {
  computeCategoryUnderfunded,
  computeFundUnderfundedPlan,
} = require(path.join(intentflowRoot, 'src/shared/underfundedEngine.cjs'));

export const EPSILON = 0.005;

export function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function createBudgetState(seed = {}) {
  const state = {
    selectedMonth: seed.selectedMonth || '2026-06-01',
    readyToAssign: money(seed.readyToAssign ?? 0),
    accounts: {},
    categories: {},
    monthLedgers: seed.monthLedgers ? structuredClone(seed.monthLedgers) : {},
    transactions: Array.isArray(seed.transactions) ? [...seed.transactions] : [],
    lastOperation: null,
    lastAllocations: [],
    uiProjection: null,
    backendProjection: null,
  };

  for (const account of seed.accounts || []) {
    state.accounts[account.name] = {
      name: account.name,
      type: account.type || 'checking',
      budgetRole: account.budgetRole || 'budget',
      balance: money(account.balance ?? 0),
    };
  }

  for (const category of seed.categories || []) {
    state.categories[category.name] = normalizeCategory(category);
  }

  if (seed.readyToAssign == null && Object.keys(state.accounts).length > 0) {
    initializeReadyToAssignFromCash(state);
  }

  return state;
}

function normalizeCategory(category) {
  return {
    id: category.id || `cat-${category.name}`,
    name: category.name,
    assigned: money(category.assigned ?? 0),
    available: money(category.available ?? category.assigned ?? 0),
    activity: money(category.activity ?? 0),
    target_type: category.target_type || 'monthly',
    target_amount: money(category.target_amount ?? 0),
    target_date: category.target_date || null,
    previous_available: money(category.previous_available ?? 0),
    archived: Boolean(category.archived),
  };
}

export function activeCategories(state) {
  return Object.values(state.categories).filter((cat) => !cat.archived);
}

export function budgetCash(state) {
  return money(
    Object.values(state.accounts)
      .filter((a) => a.budgetRole === 'budget' && a.type !== 'credit')
      .reduce((sum, a) => sum + a.balance, 0),
  );
}

export function categoryBalancesTotal(state) {
  return money(activeCategories(state).reduce((sum, cat) => sum + cat.available, 0));
}

export function initializeReadyToAssignFromCash(state) {
  const cash = budgetCash(state);
  const assigned = categoryBalancesTotal(state);
  state.readyToAssign = money(cash - assigned);
  return state;
}

export function applyAssignDelta(state, categoryName, delta) {
  const category = state.categories[categoryName];
  if (!category) throw new Error(`Missing category "${categoryName}"`);
  const value = money(delta);
  category.assigned = money(category.assigned + value);
  category.available = money(category.available + value);
  state.readyToAssign = money(state.readyToAssign - value);
}

export function runSmartAssign(state, options = {}) {
  const startingRta = state.readyToAssign;
  if (startingRta <= 0) {
    state.lastOperation = { type: 'smart', exited: true, reason: 'no-funds-available', allocations: [] };
    return state.lastOperation;
  }

  let remaining = startingRta;
  const candidates = activeCategories(state)
    .map((cat) => {
      const targetInfo = computeCategoryUnderfunded(cat);
      let neededAmount = 0;
      if ((cat.available || 0) < 0) neededAmount = Math.abs(cat.available);
      else if (targetInfo.needed > 0) neededAmount = targetInfo.needed;
      return {
        ...cat,
        neededAmount: money(neededAmount),
        budgetTarget: Number(cat.target_amount) || 0,
      };
    })
    .filter((c) => c.neededAmount > 0)
    .sort((a, b) => {
      if (a.budgetTarget !== b.budgetTarget) return a.budgetTarget - b.budgetTarget;
      return String(a.name).localeCompare(String(b.name));
    });

  const allocations = [];
  for (const cat of candidates) {
    if (remaining <= 0) break;
    const amount = money(Math.min(cat.neededAmount, remaining));
    if (amount <= 0) continue;
    allocations.push({
      categoryName: cat.name,
      amount,
      needed: cat.neededAmount,
      reason: 'smart-assign',
    });
    applyAssignDelta(state, cat.name, amount);
    remaining = money(remaining - amount);
  }

  recordMonthLedger(state, allocations);
  state.lastAllocations = allocations;
  state.lastOperation = {
    type: 'smart',
    startingRta,
    endingRta: state.readyToAssign,
    allocations,
    exited: allocations.length === 0,
    reason: allocations.length === 0 ? 'no-categories-need-funding' : null,
  };
  syncProjections(state);
  return state.lastOperation;
}

export function runFundUnderfunded(state) {
  const startingRta = state.readyToAssign;
  if (startingRta <= 0) {
    state.lastOperation = { type: 'underfunded', exited: true, reason: 'no-funds-available', allocations: [] };
    return state.lastOperation;
  }

  const categories = activeCategories(state);
  const plan = computeFundUnderfundedPlan(categories, { pool: startingRta });
  const allocations = [];

  for (const row of plan.allocations) {
    const category = categories.find((c) => String(c.id) === String(row.categoryId));
    if (!category) continue;
    const neededAtPlan =
      row.kind === 'overspent'
        ? money(Math.abs(category.available || 0))
        : money(computeCategoryUnderfunded(category).underfunded ?? 0);
    allocations.push({
      categoryName: category.name,
      amount: row.amount,
      needed: neededAtPlan,
      reason: row.reason,
      kind: row.kind,
      urgency: row.kind === 'overspent' ? 1 : row.kind === 'goal' ? 2 : 3,
    });
    applyAssignDelta(state, category.name, row.amount);
  }

  recordMonthLedger(state, allocations);
  state.lastAllocations = allocations;
  state.lastOperation = {
    type: 'underfunded',
    startingRta,
    endingRta: state.readyToAssign,
    allocations,
    plan,
    exited: allocations.length === 0,
  };
  syncProjections(state);
  return state.lastOperation;
}

export function runUnassignMonth(state, monthKey = state.selectedMonth) {
  const activityBefore = snapshotActivity(state);
  const txnBefore = state.transactions.length;
  let totalReleased = 0;
  const breakdown = [];

  for (const category of activeCategories(state)) {
    const previousAssigned = money(category.assigned);
    if (previousAssigned <= EPSILON) continue;
    totalReleased = money(totalReleased + previousAssigned);
    category.assigned = 0;
    category.available = money(category.previous_available - category.activity);
    breakdown.push({ categoryName: category.name, released: previousAssigned });
  }

  state.readyToAssign = money(state.readyToAssign + totalReleased);
  if (state.monthLedgers[monthKey]) {
    for (const name of Object.keys(state.monthLedgers[monthKey])) {
      state.monthLedgers[monthKey][name] = 0;
    }
  }

  state.lastOperation = {
    type: 'unassign',
    monthKey,
    totalReleased,
    breakdown,
    activityUnchanged: JSON.stringify(activityBefore) === JSON.stringify(snapshotActivity(state)),
    transactionsUnchanged: state.transactions.length === txnBefore,
  };
  syncProjections(state);
  return state.lastOperation;
}

export function assignedBudgetTotal(state) {
  return money(activeCategories(state).reduce((sum, cat) => sum + cat.assigned, 0));
}

export function assertBudgetInvariant(state) {
  const cash = budgetCash(state);
  const assigned = assignedBudgetTotal(state);
  const rta = money(state.readyToAssign);
  const lhs = money(cash);
  const rhs = money(assigned + rta);
  if (Math.abs(lhs - rhs) > EPSILON) {
    throw new Error(
      `Budget invariant violated: cash ${lhs} != assigned ${assigned} + RTA ${rta}`,
    );
  }
  if (rta < -EPSILON) {
    throw new Error(`Negative RTA not allowed: ${rta}`);
  }
  return { cash: lhs, rta, assigned, valid: true };
}

export function syncProjections(state) {
  state.backendProjection = projectBackendState(state);
  state.uiProjection = structuredClone(state.backendProjection);
  return state;
}

export function projectBackendState(state) {
  return {
    readyToAssign: state.readyToAssign,
    categories: Object.fromEntries(
      activeCategories(state).map((cat) => [
        cat.name,
        {
          assigned: money(cat.assigned),
          available: money(cat.available),
          activity: money(cat.activity),
        },
      ]),
    ),
    budgetCash: budgetCash(state),
  };
}

export function seedMultipleTargetCategories(state) {
  addCategory(state, {
    name: 'Small Target',
    target_type: 'monthly',
    target_amount: 100,
    assigned: 0,
    available: 0,
  });
  addCategory(state, {
    name: 'Medium Target',
    target_type: 'monthly',
    target_amount: 300,
    assigned: 0,
    available: 0,
  });
  addCategory(state, {
    name: 'Large Target',
    target_type: 'monthly',
    target_amount: 500,
    assigned: 0,
    available: 0,
  });
}

export function addCategory(state, category) {
  state.categories[category.name] = normalizeCategory(category);
}

export function addOverspentCategory(state, name, overspendAmount, opts = {}) {
  addCategory(state, {
    name,
    assigned: money(opts.assigned ?? 0),
    available: money(-Math.abs(overspendAmount)),
    activity: money(opts.activity ?? overspendAmount),
    target_type: opts.target_type || 'monthly',
    target_amount: money(opts.target_amount ?? 200),
  });
}

export function seedUrgencyMix(state) {
  addOverspentCategory(state, 'Overspent Dining', 150, { target_amount: 200 });
  addCategory(state, {
    name: 'Monthly Rent',
    target_type: 'monthly',
    target_amount: 400,
    assigned: 0,
    available: 0,
  });
  addCategory(state, {
    name: 'Emergency Fund',
    target_type: 'balance',
    target_amount: 1000,
    assigned: 0,
    available: 100,
  });
}

export function seedAssignedMonth(state, totalAssigned = 600) {
  const first = money(Math.round(totalAssigned * 0.6 * 100) / 100);
  const second = money(totalAssigned - first);
  addCategory(state, {
    name: 'Rent',
    target_type: 'monthly',
    target_amount: 800,
    assigned: first,
    available: first,
  });
  addCategory(state, {
    name: 'Groceries',
    target_type: 'monthly',
    target_amount: 300,
    assigned: second,
    available: second,
  });
  const actual = activeCategories(state).reduce((s, c) => s + c.assigned, 0);
  if (Math.abs(actual - totalAssigned) > EPSILON) {
    throw new Error(`Expected ${totalAssigned} assigned, got ${actual}`);
  }
  state.readyToAssign = money(budgetCash(state) - categoryBalancesTotal(state));
}

export function seedActivityMonth(state) {
  addCategory(state, {
    name: 'Utilities',
    target_type: 'monthly',
    target_amount: 200,
    assigned: 150,
    available: 50,
    activity: -100,
    previous_available: 150,
  });
  state.transactions.push({
    id: 'txn-1',
    category: 'Utilities',
    amount: -100,
    type: 'expense',
  });
}

export function seedCrossMonthLedgers(state) {
  state.monthLedgers = {
    '2026-06-01': { 'June Cat': 0 },
    '2026-07-01': { 'July Rent': 250 },
  };
  addCategory(state, {
    name: 'June Cat',
    target_type: 'monthly',
    target_amount: 200,
    assigned: 0,
    available: 0,
  });
  addCategory(state, {
    name: 'July Rent',
    target_type: 'monthly',
    target_amount: 800,
    assigned: 250,
    available: 250,
  });
  state.selectedMonth = '2026-06-01';
}

function recordMonthLedger(state, allocations) {
  const monthKey = state.selectedMonth;
  if (!state.monthLedgers[monthKey]) state.monthLedgers[monthKey] = {};
  for (const row of allocations) {
    state.monthLedgers[monthKey][row.categoryName] = money(
      (state.monthLedgers[monthKey][row.categoryName] || 0) + row.amount,
    );
  }
}

function snapshotActivity(state) {
  return Object.fromEntries(
    activeCategories(state).map((cat) => [cat.name, money(cat.activity)]),
  );
}

export function totalAssignedAmount(state) {
  return money(activeCategories(state).reduce((sum, cat) => sum + cat.assigned, 0));
}

export function neededTotalForSmartAssign(state) {
  return money(
    activeCategories(state).reduce((sum, cat) => {
      const targetInfo = computeCategoryUnderfunded(cat);
      let needed = 0;
      if ((cat.available || 0) < 0) needed = Math.abs(cat.available);
      else if (targetInfo.needed > 0) needed = targetInfo.needed;
      return sum + needed;
    }, 0),
  );
}
