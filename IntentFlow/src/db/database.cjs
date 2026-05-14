/**
 * Bridge so services under src/services can use the same sqlite connection
 * as the Electron main process (opened in main/index.cjs).
 */
let getDatabaseFromMain = null;

function setGetDatabaseProvider(fn) {
  getDatabaseFromMain = typeof fn === 'function' ? fn : null;
}

async function getDatabase() {
  if (!getDatabaseFromMain) {
    throw new Error('Database provider not initialized (call setGetDatabaseProvider from main)');
  }
  return getDatabaseFromMain();
}

module.exports = { getDatabase, setGetDatabaseProvider };
