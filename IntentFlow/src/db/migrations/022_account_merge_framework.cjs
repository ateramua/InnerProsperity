/**
 * Account identity merge framework — lifecycle fields + audit sessions.
 */
async function columnExists(db, table, col) {
  const cols = await db.all(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === col);
}

module.exports = async function migrate022(db) {
  if (!(await columnExists(db, 'accounts', 'account_status'))) {
    await db.exec(
      `ALTER TABLE accounts ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'`
    );
  }
  if (!(await columnExists(db, 'accounts', 'merged_into_account_id'))) {
    await db.exec(`ALTER TABLE accounts ADD COLUMN merged_into_account_id TEXT`);
  }
  if (!(await columnExists(db, 'accounts', 'merged_at'))) {
    await db.exec(`ALTER TABLE accounts ADD COLUMN merged_at TEXT`);
  }
  if (!(await columnExists(db, 'accounts', 'merge_session_id'))) {
    await db.exec(`ALTER TABLE accounts ADD COLUMN merge_session_id TEXT`);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS account_merge_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      survivor_account_id TEXT NOT NULL,
      merged_account_id TEXT NOT NULL,
      plaid_account_id TEXT,
      confidence_score INTEGER,
      initiated_by TEXT,
      pre_merge_snapshot TEXT,
      post_merge_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      rolled_back_at TEXT
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_account_merge_sessions_user
    ON account_merge_sessions(user_id, created_at DESC)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_merged_into
    ON accounts(merged_into_account_id)
    WHERE merged_into_account_id IS NOT NULL
  `);
};
