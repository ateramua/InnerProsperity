'use strict';

/**
 * DB transaction broker — serialized SQLite writes for Electron main process.
 * All budget/import/seed IPC writes must pass through enqueueWrite() so only one
 * writer holds the shared connection at a time (prevents SQLITE_BUSY under CDP).
 */

const { runTransaction, isDbInTransaction, isNoActiveTransactionError } = require('./transactionRunner.cjs');

const BROKER_VERSION = 'v2-transaction-broker';
const WRITE_QUEUE = [];
let draining = false;
let activeWrites = 0;
let exclusiveWindow = false;
let exclusiveOwner = null;
let dbProvider = null;

function setDatabaseProvider(fn) {
  dbProvider = typeof fn === 'function' ? fn : null;
}

function isTransientSqliteError(err) {
  const msg = String(err?.message || err || '');
  return /SQLITE_BUSY|database is locked|cannot start a transaction within a transaction/i.test(
    msg
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWriteState() {
  return {
    brokerVersion: BROKER_VERSION,
    queueDepth: WRITE_QUEUE.length,
    activeWrites,
    exclusiveWindow,
    exclusiveOwner,
    isIdle: WRITE_QUEUE.length === 0 && activeWrites === 0 && !exclusiveWindow,
  };
}

async function retryWithBackoff(fn, { maxAttempts = 6, baseMs = 40, label = 'db-write' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (!isTransientSqliteError(err) || attempt === maxAttempts) {
        throw err;
      }
      await sleep(baseMs * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

async function drainQueue() {
  if (draining) return;
  draining = true;
  try {
    while (WRITE_QUEUE.length > 0) {
      while (exclusiveWindow) {
        await sleep(25);
      }
      const job = WRITE_QUEUE.shift();
      if (!job) break;
      activeWrites += 1;
      try {
        let db = null;
        if (dbProvider) {
          db = await dbProvider();
          await clearStaleTransaction(db);
        }
        const result = await retryWithBackoff(() => job.fn(), { label: job.label });
        job.resolve(result);
      } catch (err) {
        job.reject(err);
      } finally {
        if (dbProvider) {
          try {
            const db = await dbProvider();
            await clearStaleTransaction(db);
          } catch (_) {
            /* best-effort */
          }
        }
        activeWrites -= 1;
      }
    }
  } finally {
    draining = false;
    if (WRITE_QUEUE.length > 0) {
      drainQueue().catch(() => {});
    }
  }
}

function enqueue(fn, label = 'db-write') {
  if (process.env.INTENTFLOW_DB_BROKER_LOG === '1') {
    console.log(`[IntentFlow DB broker] enqueue label=${label} depth=${WRITE_QUEUE.length}`);
  }
  return new Promise((resolve, reject) => {
    WRITE_QUEUE.push({ fn, label, resolve, reject });
    drainQueue().catch(reject);
  });
}

const enqueueWrite = enqueue;

/**
 * Run inside an active write job without re-queueing (avoids deadlock).
 */
async function runInWriteContext(fn, label = 'in-write-context') {
  if (activeWrites > 0) {
    if (dbProvider) {
      const db = await dbProvider();
      await clearStaleTransaction(db);
    }
    return fn();
  }
  return enqueue(fn, label);
}

/**
 * Savepoint-aware transaction on the shared connection (caller must be inside enqueueWrite).
 */
async function transaction(db, fn) {
  return retryWithBackoff(() => runTransaction(db, fn), { label: 'broker-transaction' });
}

async function clearStaleTransaction(db) {
  if (!db) return;
  try {
    await db.exec('ROLLBACK');
  } catch (rollbackErr) {
    if (!isNoActiveTransactionError(rollbackErr)) {
      try {
        if (await isDbInTransaction(db)) {
          await db.exec('ROLLBACK');
        }
      } catch (retryErr) {
        if (!isNoActiveTransactionError(retryErr)) {
          throw retryErr;
        }
      }
    }
  }
}

async function runImmediateTransaction(db, fn) {
  return retryWithBackoff(async () => {
    await clearStaleTransaction(db);
    try {
      await db.exec('BEGIN IMMEDIATE');
    } catch (err) {
      if (/within a transaction/i.test(String(err?.message || err))) {
        return fn(db);
      }
      throw err;
    }
    try {
      const result = await fn(db);
      if (await isDbInTransaction(db)) {
        try {
          await db.exec('COMMIT');
        } catch (commitErr) {
          if (!isNoActiveTransactionError(commitErr)) {
            throw commitErr;
          }
        }
      }
      return result;
    } catch (err) {
      if (await isDbInTransaction(db)) {
        try {
          await db.exec('ROLLBACK');
        } catch (rollbackErr) {
          if (!isNoActiveTransactionError(rollbackErr)) {
            throw rollbackErr;
          }
        }
      }
      throw err;
    }
  }, { label: 'immediate-tx' });
}

function beginExclusiveWriteWindow(owner = 'exclusive') {
  exclusiveWindow = true;
  exclusiveOwner = owner;
}

function endExclusiveWriteWindow(owner) {
  if (!exclusiveOwner || exclusiveOwner === owner) {
    exclusiveWindow = false;
    exclusiveOwner = null;
  }
}

async function waitForDbIdle({ timeoutMs = 15000, stableWindowMs = 800 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let stableSince = null;
  while (Date.now() < deadline) {
    const state = getWriteState();
    if (state.isIdle) {
      if (stableSince == null) stableSince = Date.now();
      if (Date.now() - stableSince >= stableWindowMs) return state;
    } else {
      stableSince = null;
    }
    await sleep(40);
  }
  throw new Error(
    `Database write queue did not become idle within ${timeoutMs}ms (${JSON.stringify(getWriteState())})`
  );
}

module.exports = {
  BROKER_VERSION,
  enqueue,
  enqueueWrite,
  runInWriteContext,
  transaction,
  runImmediateTransaction,
  retryWithBackoff,
  isTransientSqliteError,
  clearStaleTransaction,
  getWriteState,
  beginExclusiveWriteWindow,
  endExclusiveWriteWindow,
  waitForDbIdle,
  setDatabaseProvider,
};
