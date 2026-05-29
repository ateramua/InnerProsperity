/**
 * Track Plaid accounts the user permanently removed so sync does not recreate them.
 */
async function migrate(db) {
  console.log('📁 Running migration: 021_plaid_account_dismissals');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS plaid_account_dismissals (
      plaid_account_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (plaid_account_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_plaid_dismissals_user ON plaid_account_dismissals(user_id);
  `);
  console.log('✅ Migration 021_plaid_account_dismissals completed');
}

module.exports = migrate;
