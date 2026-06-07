/**
 * Persisted Ready to Assign pool — unallocated funds independent of account cash.
 * RTA only changes on income, assignment/unassignment, and explicit pool adjustments.
 */
module.exports = async function migration034(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_budget_pool (
      user_id TEXT PRIMARY KEY,
      ready_to_assign_balance REAL NOT NULL DEFAULT 0,
      pool_backfilled INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_budget_pool_updated
      ON user_budget_pool(updated_at DESC);
  `);
};
