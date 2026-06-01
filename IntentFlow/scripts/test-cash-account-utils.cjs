#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  normalizeAccountsListFromSummary,
  sumTotalBudgetCashFromSummary,
} = require('../src/utils/cashAccountUtils.cjs');

const accounts = [
  { type: 'checking', balance: 1000, is_active: true },
  { type: 'savings', balance: 500, is_active: true },
  { type: 'credit', balance: -200, is_active: true },
];

assert.deepStrictEqual(normalizeAccountsListFromSummary(accounts), accounts);
assert.deepStrictEqual(
  normalizeAccountsListFromSummary({ success: true, data: accounts }),
  accounts,
);
assert.strictEqual(sumTotalBudgetCashFromSummary(accounts), 1500);
assert.strictEqual(sumTotalBudgetCashFromSummary({ success: true, data: accounts }), 1500);

console.log('✅ test-cash-account-utils passed');
