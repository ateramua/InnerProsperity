const { v4: uuidv4 } = require('uuid');

async function logPlaidSyncRun(db, row) {
  try {
    const table = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='plaid_sync_runs'`
    );
    if (!table) return null;

    const id = uuidv4();
    await db.run(
      `INSERT INTO plaid_sync_runs (
        id, user_id, item_id, sync_type, status,
        transactions_added, transactions_modified, transactions_removed,
        error_message, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        id,
        row.userId,
        row.itemId || null,
        row.syncType || 'unknown',
        row.status || 'ok',
        row.transactionsAdded || 0,
        row.transactionsModified || 0,
        row.transactionsRemoved || 0,
        row.errorMessage || null,
      ]
    );
    return id;
  } catch (err) {
    console.warn('plaid_sync_runs log skipped:', err.message);
    return null;
  }
}

module.exports = { logPlaidSyncRun };
