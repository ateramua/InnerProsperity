#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  getCreditCardBalanceState,
  computeAvailableCredit,
  computeCreditCardDebtAmount,
  formatCreditCardBalanceDisplay,
} = require('../src/shared/creditCardBalanceUtils.cjs');

assert.strictEqual(getCreditCardBalanceState(-200), 'debt');
assert.strictEqual(getCreditCardBalanceState(0), 'zero');
assert.strictEqual(getCreditCardBalanceState(30), 'credit');

assert.strictEqual(computeAvailableCredit(5000, -200), 4800);
assert.strictEqual(computeAvailableCredit(5000, 30), 5030);

assert.strictEqual(computeCreditCardDebtAmount(-200), 200);
assert.strictEqual(computeCreditCardDebtAmount(30), 0);

const credit = formatCreditCardBalanceDisplay(30, (n) => `$${n.toFixed(2)}`);
assert.ok(credit.text.includes('+'));
assert.strictEqual(credit.suffix, ' (Credit)');

const debt = formatCreditCardBalanceDisplay(-200, (n) => `$${Math.abs(n).toFixed(2)}`);
assert.strictEqual(debt.suffix, ' (you owe)');

console.log('✅ test-credit-card-balance-utils passed');
