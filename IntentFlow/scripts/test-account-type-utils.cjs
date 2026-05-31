#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  resolveDisplayAccountType,
  formatAccountTypeLabel,
  coerceStoredAccountType,
  mapAccountTypeToCategory,
  getAccountTypeSelectOptions,
  ACCOUNT_TYPE_VALUES,
} = require('../src/utils/accountTypeUtils.cjs');

function test(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}:`, err.message);
    process.exitCode = 1;
  }
}

console.log('accountTypeUtils');

test('empty type + credit category → credit', () => {
  assert.strictEqual(
    resolveDisplayAccountType({ type: null, account_type_category: 'credit' }),
    'credit'
  );
});

test('Plaid credit wins over loan category when type empty', () => {
  assert.strictEqual(
    resolveDisplayAccountType({
      type: null,
      account_type_category: 'loan',
      plaid_account_type: 'credit',
      plaid_account_subtype: 'credit card',
    }),
    'credit'
  );
});

test('Plaid credit metadata when type is other', () => {
  assert.strictEqual(
    resolveDisplayAccountType({
      type: 'other',
      plaid_account_type: 'credit',
      plaid_account_subtype: 'credit card',
    }),
    'credit'
  );
});

test('Plaid depository checking', () => {
  assert.strictEqual(
    resolveDisplayAccountType({
      type: '',
      plaid_account_type: 'depository',
      plaid_account_subtype: 'checking',
    }),
    'checking'
  );
});

test('stored credit card alias → credit', () => {
  assert.strictEqual(
    resolveDisplayAccountType({ type: 'credit card' }),
    'credit'
  );
});

test('formatAccountTypeLabel', () => {
  assert.strictEqual(formatAccountTypeLabel('credit'), 'Credit Card');
  assert.strictEqual(formatAccountTypeLabel('checking'), 'Checking');
});

test('canonical account type values', () => {
  assert.deepStrictEqual(ACCOUNT_TYPE_VALUES, [
    'checking',
    'savings',
    'credit',
    'loan',
    'investment',
    'other',
  ]);
});

test('mapAccountTypeToCategory', () => {
  assert.strictEqual(mapAccountTypeToCategory('credit'), 'credit');
  assert.strictEqual(mapAccountTypeToCategory('loan'), 'loan');
  assert.strictEqual(mapAccountTypeToCategory('checking'), 'budget');
});

test('getAccountTypeSelectOptions cashOnly', () => {
  const cash = getAccountTypeSelectOptions({ cashOnly: true });
  assert.strictEqual(cash.length, 2);
  assert.strictEqual(cash[0].value, 'checking');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('All account type utils tests passed.');
