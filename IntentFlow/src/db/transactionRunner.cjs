'use strict';

/**
 * Savepoint-aware SQLite transaction runner shared by budget and write broker.
 */

const crypto = require('crypto');

function isNestedTransactionError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('transaction') && (msg.includes('within') || msg.includes('nested'));
}

function isNoSuchSavepointError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('no such savepoint');
}

function isNoActiveTransactionError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('no transaction is active');
}

/** @param {import('sqlite').Database} db */
async function isDbInTransaction(db) {
  try {
    const row = await db.get('PRAGMA transaction_state');
    if (row && row.transaction_state != null) {
      return Number(row.transaction_state) === 1;
    }
  } catch (_) {
    /* PRAGMA unavailable on older SQLite builds */
  }
  return false;
}

/**
 * @param {import('sqlite').Database} db
 * @param {() => Promise<T>} fn
 * @template T
 */
async function withSavepoint(db, fn) {
  const sp = `if_sp_${crypto.randomUUID().replace(/-/g, '_')}`;
  await db.exec(`SAVEPOINT ${sp}`);
  try {
    const result = await fn();
    try {
      await db.exec(`RELEASE SAVEPOINT ${sp}`);
    } catch (releaseErr) {
      if (!isNoSuchSavepointError(releaseErr)) {
        throw releaseErr;
      }
    }
    return result;
  } catch (e) {
    try {
      await db.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
    } catch (rollbackErr) {
      if (!isNoSuchSavepointError(rollbackErr)) {
        throw rollbackErr;
      }
    }
    throw e;
  }
}

/**
 * BEGIN/COMMIT or SAVEPOINT when already inside a transaction.
 * @param {import('sqlite').Database} db
 * @param {() => Promise<T>} fn
 * @template T
 */
async function runTransaction(db, fn) {
  if (await isDbInTransaction(db)) {
    return withSavepoint(db, fn);
  }

  let beganOuter = false;
  try {
    await db.exec('BEGIN');
    beganOuter = true;
  } catch (e) {
    if (isNestedTransactionError(e)) {
      return withSavepoint(db, fn);
    }
    throw e;
  }

  try {
    const result = await fn();
    if (beganOuter) {
      try {
        await db.exec('COMMIT');
      } catch (commitErr) {
        if (!isNoActiveTransactionError(commitErr)) {
          throw commitErr;
        }
      }
      beganOuter = false;
    }
    return result;
  } catch (e) {
    if (beganOuter) {
      try {
        await db.exec('ROLLBACK');
      } catch (rollbackErr) {
        if (!isNoActiveTransactionError(rollbackErr)) {
          throw rollbackErr;
        }
      }
    }
    throw e;
  }
}

module.exports = {
  isDbInTransaction,
  isNestedTransactionError,
  isNoSuchSavepointError,
  isNoActiveTransactionError,
  withSavepoint,
  runTransaction,
  runBudgetTransaction: runTransaction,
  withBudgetTransaction: runTransaction,
};
