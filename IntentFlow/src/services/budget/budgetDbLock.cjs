'use strict';

/**
 * Serialize budget DB writes on the app's single sqlite connection.
 * Read paths (month snapshot, global summary) must not hold this lock.
 */
let lockDepth = 0;
let lockTail = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withBudgetDbLock(fn) {
  if (lockDepth > 0) {
    lockDepth += 1;
    try {
      return await fn();
    } finally {
      lockDepth -= 1;
    }
  }

  let releaseGate;
  const gate = new Promise((resolve) => {
    releaseGate = resolve;
  });
  const previous = lockTail;
  lockTail = previous.then(
    () => gate,
    () => gate
  );

  await previous;

  lockDepth += 1;
  try {
    return await fn();
  } finally {
    lockDepth -= 1;
    if (lockDepth === 0) {
      releaseGate();
    }
  }
}

module.exports = {
  withBudgetDbLock,
};
