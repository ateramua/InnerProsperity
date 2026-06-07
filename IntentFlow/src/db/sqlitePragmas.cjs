'use strict';

/**
 * Apply SQLite pragmas that reduce SQLITE_BUSY under concurrent readers/writers
 * (e.g. Plaid sync + manual transactions + IPC seed).
 */
async function applySqlitePragmas(db) {
  await db.exec('PRAGMA foreign_keys = ON');
  await db.exec('PRAGMA journal_mode = WAL');
  await db.exec('PRAGMA busy_timeout = 30000');
}

module.exports = { applySqlitePragmas };
