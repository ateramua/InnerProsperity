#!/usr/bin/env node
const assert = require('assert');
const {
  computeCategoryAvailable,
  classifyOverspending,
  roundMoney,
} = require('../src/shared/categoryAvailableEngine.cjs');

const standard = computeCategoryAvailable({
  previousAvailable: 200,
  assigned: 300,
  totals: { spending: 120, inflows: 20, adjustments: 0 },
  isCreditCardPaymentCategory: false,
});

assert.strictEqual(standard.available, 400);
assert.strictEqual(standard.activity, 100);

const cc = computeCategoryAvailable({
  previousAvailable: 50,
  assigned: 200,
  totals: { spending: 0, inflows: 0, cardPayments: 75, adjustments: 0 },
  isCreditCardPaymentCategory: true,
});

assert.strictEqual(cc.available, 175);
assert.strictEqual(cc.activity, 75);

const overspent = classifyOverspending(-10, { hadCreditOverspending: true });
assert.strictEqual(overspent.overspending_type, 'credit');

console.log('categoryAvailableEngine: all assertions passed');
