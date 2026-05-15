/**
 * Plaid sync audit log + soft-delete for removed Plaid transactions.
 */
async function migrate(db) {
  console.log('📁 Running migration: 015_plaid_phase3');

  const tableInfo = await db.all('PRAGMA table_info(transactions)');
  const txCols = new Set(tableInfo.map((c) => c.name));
  if (!txCols.has('is_deleted')) {
    await db.exec(`ALTER TABLE transactions ADD COLUMN is_deleted INTEGER DEFAULT 0`);
    console.log('➕ Added transactions.is_deleted');
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS plaid_sync_runs (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      item_id TEXT,
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL,
      transactions_added INTEGER DEFAULT 0,
      transactions_modified INTEGER DEFAULT 0,
      transactions_removed INTEGER DEFAULT 0,
      error_message TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (item_id) REFERENCES plaid_items(id)
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_plaid_sync_runs_user ON plaid_sync_runs(user_id, started_at DESC)`
  );

  console.log('✅ Migration 015_plaid_phase3 completed');
}

module.exports = migrate;
