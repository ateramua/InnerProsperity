#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  computeCategoryUnderfunded,
  computeBudgetUnderfunded,
  enrichBudgetSnapshot,
  computeFundUnderfundedPlan,
} = require('../src/shared/underfundedEngine.cjs');

const monthlyRollover = {
  id: 'cat-1',
  target_type: 'monthly',
  target_amount: 500,
  assigned: 0,
  available: 500,
};

const result = computeCategoryUnderfunded(monthlyRollover);
assert.strictEqual(result.underfunded, 500, 'monthly goal with $0 assigned must be $500 underfunded despite rollover');
assert.strictEqual(result.goalType, 'monthly_funding');

const fundedMonthly = { ...monthlyRollover, assigned: 500 };
assert.strictEqual(computeCategoryUnderfunded(fundedMonthly).underfunded, 0);

const balanceGoal = {
  id: 'cat-2',
  target_type: 'balance',
  target_amount: 1000,
  assigned: 0,
  available: 400,
};
assert.strictEqual(computeCategoryUnderfunded(balanceGoal).underfunded, 600);

const budget = computeBudgetUnderfunded([monthlyRollover, fundedMonthly, balanceGoal]);
assert.strictEqual(budget.underfundedTotal, 1100);
assert.strictEqual(budget.categoryBreakdown.length, 2);

const spending = {
  id: 'cat-3',
  target_type: 'spending_target',
  target_amount: 400,
  assigned: 0,
  available: 100,
  forecasted_need: 400,
};
assert.strictEqual(computeCategoryUnderfunded(spending).underfunded, 300);

const snap = enrichBudgetSnapshot({
  monthKey: '2026-05-01',
  categories: [monthlyRollover, fundedMonthly, spending],
});
assert.strictEqual(snap.underfundedTotal, 800);
assert.strictEqual(snap.categories[0].underfunded, 500);

const overspentCat = { id: 'os-1', name: 'Dining', available: -200, target_type: 'monthly', target_amount: 100, assigned: 0 };
const monthlyGap = { id: 'mg-1', name: 'Rent', available: 50, target_type: 'monthly', target_amount: 500, assigned: 0 };
const plan = computeFundUnderfundedPlan([overspentCat, monthlyGap], { pool: 1000 });
assert.strictEqual(plan.totalFundingNeed, 700);
assert.strictEqual(plan.overspentTotal, 200);
assert.strictEqual(plan.goalUnderfundedTotal, 500);
assert.strictEqual(plan.allocations.length, 2);
assert.strictEqual(plan.allocations[0].kind, 'overspent');
assert.strictEqual(plan.allocations[0].amount, 200);
assert.strictEqual(plan.allocations[1].amount, 500);
assert.strictEqual(
  computeFundUnderfundedPlan([monthlyGap], { pool: 100 }).totalToAssign,
  100,
);

console.log('✅ test-underfunded-engine passed');
