/**
 * Bridge so services under src/services can use the same sqlite connection
 * as the Electron main process (owned by intentflow-sqlite-owner.cjs).
 */
const sqliteOwner = require('./intentflow-sqlite-owner.cjs');

let getDatabaseFromMain = null;

function setGetDatabaseProvider(fn) {
  getDatabaseFromMain = typeof fn === 'function' ? fn : null;
}

async function getDatabase() {
  if (getDatabaseFromMain) {
    return getDatabaseFromMain();
  }
  return sqliteOwner.getConnection();
}

async function getConnection() {
  return getDatabase();
}

module.exports = {
  getDatabase,
  getConnection,
  setGetDatabaseProvider,
  sqliteOwner,
};
