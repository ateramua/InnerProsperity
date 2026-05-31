#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  scoreAccountMatch,
  THRESHOLD_AUTO,
  THRESHOLD_CONFIRM,
} = require('../src/services/accounts/accountIdentityMatch.cjs');
const {
  classifyTransactionPair,
  analyzeMergeDuplicates,
} = require('../src/services/accounts/transactionDedup.cjs');

function test(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}:`, e.message);
    process.exitCode = 1;
  }
}

console.log('account merge framework');

test('high confidence: mask + institution + type', () => {
  const r = scoreAccountMatch(
    {
      name: 'PNC Checking',
      type: 'checking',
      external_mask: '1234',
      institution: 'PNC Bank',
      balance: 1000,
    },
    {
      mask: '1234',
      institutionName: 'PNC Bank',
      internalType: 'checking',
      displayName: 'PNC CHECKING',
      balance: 1010,
    }
  );
  assert.ok(r.confidence >= THRESHOLD_AUTO, `expected >= ${THRESHOLD_AUTO}, got ${r.confidence}`);
  assert.strictEqual(r.tier, 'high');
});

test('medium confidence: mask only partial', () => {
  const r = scoreAccountMatch(
    { name: 'My Checking', type: 'checking', balance: 500 },
    {
      mask: '9999',
      institutionName: 'Other Bank',
      internalType: 'checking',
      displayName: 'Checking',
      balance: 5000,
    }
  );
  assert.ok(r.confidence < THRESHOLD_AUTO);
});

test('exact transaction duplicate', () => {
  assert.strictEqual(
    classifyTransactionPair(
      { date: '2025-01-15', amount: -50, payee: 'Starbucks' },
      { date: '2025-01-15', amount: -50, description: 'Starbucks' }
    ),
    'exact'
  );
});

test('analyze merge duplicates', () => {
  const a = analyzeMergeDuplicates(
    [{ id: 1, date: '2025-01-01', amount: -10, payee: 'Store' }],
    [{ id: 2, date: '2025-01-01', amount: -10, payee: 'Store' }]
  );
  assert.strictEqual(a.exactDuplicateCount, 1);
  assert.strictEqual(a.uniqueIncomingCount, 0);
});

console.log(process.exitCode ? '\nFailed' : '\nAll passed');
