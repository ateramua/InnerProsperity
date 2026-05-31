#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  computeCategoryUnderfunded,
  computeBudgetUnderfunded,
  enrichBudgetSnapshot,
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

console.log('✅ test-underfunded-engine passed');
