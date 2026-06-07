#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  computeCreditCardReserveState,
} = require('../src/services/transactions/creditCardReserveUtils.cjs');

function testFundedPurchase() {
  const result = computeCreditCardReserveState({
    accountType: 'credit',
    amount: -50,
    categoryId: 'groceries',
    envelopeAvailable: 500,
    previousReserved: 0,
  });
  assert.strictEqual(result.nextReserved, 50);
  assert.strictEqual(result.creditReserveDelta, 50);
  assert.strictEqual(result.unfundedAmount, 0);
}

function testOverspendingPartialReserve() {
  const result = computeCreditCardReserveState({
    accountType: 'credit',
    amount: -50,
    categoryId: 'groceries',
    envelopeAvailable: 20,
    previousReserved: 0,
  });
  assert.strictEqual(result.nextReserved, 20);
  assert.strictEqual(result.creditReserveDelta, 20);
  assert.strictEqual(result.unfundedAmount, 30);
}

function testRefundReleasesReserve() {
  const result = computeCreditCardReserveState({
    accountType: 'credit',
    amount: 100,
    categoryId: 'groceries',
    envelopeAvailable: 0,
    previousReserved: 100,
  });
  assert.strictEqual(result.nextReserved, 0);
  assert.strictEqual(result.creditReserveDelta, -100);
  assert.strictEqual(result.unfundedAmount, 0);
}

function testUncategorizeReleasesReserve() {
  const result = computeCreditCardReserveState({
    accountType: 'credit',
    amount: -50,
    categoryId: null,
    envelopeAvailable: 0,
    previousReserved: 50,
  });
  assert.strictEqual(result.nextReserved, 0);
  assert.strictEqual(result.creditReserveDelta, -50);
}

function testNonCreditNoOp() {
  const result = computeCreditCardReserveState({
    accountType: 'checking',
    amount: -50,
    categoryId: 'groceries',
    envelopeAvailable: 500,
    previousReserved: 0,
  });
  assert.strictEqual(result.creditReserveDelta, 0);
}

async function main() {
  testFundedPurchase();
  testOverspendingPartialReserve();
  testRefundReleasesReserve();
  testUncategorizeReleasesReserve();
  testNonCreditNoOp();
  console.log('✅ test-credit-card-reserve passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
