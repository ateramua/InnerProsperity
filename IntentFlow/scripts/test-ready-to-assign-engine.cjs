#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  computeGlobalBudgetSummary,
  computeReadyToAssign,
} = require('../src/shared/readyToAssignEngine.cjs');

const current = '2026-06-01';
const rows = [
  { month: '2026-06-01', category_id: 'a', category_name: 'Groceries', budgeted_amount: 300 },
  { month: '2026-07-01', category_id: 'b', category_name: 'Rent', budgeted_amount: 1200 },
  { month: '2026-08-01', category_id: 'c', category_name: 'Vacation', budgeted_amount: 500 },
];

const summary = computeGlobalBudgetSummary(rows, current, 5000);
assert.strictEqual(summary.totalAssigned, 2000);
assert.strictEqual(summary.futureAssigned, 1700);
assert.strictEqual(summary.readyToAssign, 3000);
assert.strictEqual(summary.futureBreakdown.length, 2);
assert.strictEqual(computeReadyToAssign(5000, 2000), 3000);

console.log('✅ test-ready-to-assign-engine passed');
