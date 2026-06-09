#!/usr/bin/env node
'use strict';

/**
 * Lightweight broker regression — serialized writes, idle detection, exclusive window.
 */

const assert = require('assert');
const dbWriteQueue = require('../src/db/dbWriteQueue.cjs');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let order = [];
  const job = (label, ms = 30) => async () => {
    order.push(`start:${label}`);
    await sleep(ms);
    order.push(`end:${label}`);
    return label;
  };

  const p1 = dbWriteQueue.enqueueWrite(job('a', 40), 'a');
  const p2 = dbWriteQueue.enqueueWrite(job('b', 10), 'b');
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.strictEqual(r1, 'a');
  assert.strictEqual(r2, 'b');
  assert.deepStrictEqual(order, ['start:a', 'end:a', 'start:b', 'end:b']);

  const idle = await dbWriteQueue.waitForDbIdle({ timeoutMs: 2000, stableWindowMs: 100 });
  assert.strictEqual(idle.isIdle, true);

  dbWriteQueue.beginExclusiveWriteWindow('test');
  let blocked = false;
  const blockedPromise = dbWriteQueue
    .enqueueWrite(async () => {
      blocked = true;
    }, 'blocked')
    .catch(() => {});
  await sleep(80);
  assert.strictEqual(blocked, false);
  dbWriteQueue.endExclusiveWriteWindow('test');
  await blockedPromise;
  assert.strictEqual(blocked, true);

  const state = dbWriteQueue.getWriteState();
  assert.strictEqual(state.brokerVersion, 'v2-transaction-broker');

  console.log('DB broker regression passed.');
}

main().catch((err) => {
  console.error('DB broker regression failed:', err);
  process.exit(1);
});
