'use strict';

/**
 * Single SQLite connection owner for the Electron main process.
 * All main-process DB access should flow through getConnection().
 */

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { applySqlitePragmas } = require('./sqlitePragmas.cjs');

const DB_ARCHITECTURE_VERSION = 'v2-transaction-broker';

let connection = null;
let dbPath = null;
let initialized = false;

function isElectronMain() {
  return Boolean(process.versions?.electron);
}

function logArchitectureBanner() {
  console.log(
    `[IntentFlow DB] architecture=${DB_ARCHITECTURE_VERSION} connection=single pid=${process.pid} electron=${isElectronMain()}`
  );
}

function assertSingleConnectionInMain() {
  if (isElectronMain() && connection) {
    throw new Error(
      'intentflow-sqlite-owner: refused second SQLite connection in Electron main process'
    );
  }
}

async function openConnection(path) {
  assertSingleConnectionInMain();
  const db = await open({ filename: path, driver: sqlite3.Database });
  await applySqlitePragmas(db);
  db.__intentflowPragmasApplied = true;
  await db.get('SELECT 1');
  return db;
}

/**
 * Initialize the singleton connection. Call once from main startup.
 * @param {string} path - Absolute path to app.db
 * @param {{ adoptConnection?: import('sqlite').Database }} [options]
 */
async function initialize(path, options = {}) {
  if (initialized && connection) {
    return connection;
  }

  dbPath = path;

  if (options.adoptConnection) {
    connection = options.adoptConnection;
    if (!connection.__intentflowPragmasApplied) {
      await applySqlitePragmas(connection);
      connection.__intentflowPragmasApplied = true;
    }
    initialized = true;
    logArchitectureBanner();
    return connection;
  }

  connection = await openConnection(path);
  initialized = true;
  logArchitectureBanner();
  return connection;
}

async function getConnection() {
  if (connection) {
    try {
      await connection.get('SELECT 1');
      if (!connection.__intentflowPragmasApplied) {
        await applySqlitePragmas(connection);
        connection.__intentflowPragmasApplied = true;
      }
      return connection;
    } catch (err) {
      console.warn('intentflow-sqlite-owner: stale connection, reconnecting:', err?.message || err);
      connection = null;
      initialized = false;
    }
  }

  if (!dbPath) {
    throw new Error('intentflow-sqlite-owner: not initialized (call initialize from main first)');
  }

  connection = await openConnection(dbPath);
  initialized = true;
  logArchitectureBanner();
  return connection;
}

async function recoverSession() {
  if (!connection) return;
  try {
    const row = await connection.get('PRAGMA transaction_state');
    const inTxn = row && Number(row.transaction_state) === 1;
    if (inTxn) {
      await connection.exec('ROLLBACK');
    }
  } catch (err) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (!msg.includes('no transaction is active')) {
      throw err;
    }
  }
}

async function close() {
  if (connection) {
    await connection.close();
    connection = null;
    initialized = false;
  }
}

function getState() {
  return {
    architecture: DB_ARCHITECTURE_VERSION,
    initialized,
    hasConnection: Boolean(connection),
    dbPath,
    pid: process.pid,
    electron: isElectronMain(),
  };
}

/**
 * CLI / migration scripts only — blocked in Electron main unless explicitly allowed.
 */
async function openStandalone(path) {
  if (isElectronMain() && process.env.INTENTFLOW_ALLOW_STANDALONE_DB !== '1') {
    throw new Error(
      'openStandalone() is disabled in Electron main; use getConnection() via intentflow-sqlite-owner'
    );
  }
  return openConnection(path);
}

module.exports = {
  DB_ARCHITECTURE_VERSION,
  initialize,
  getConnection,
  recoverSession,
  close,
  getState,
  openStandalone,
};
