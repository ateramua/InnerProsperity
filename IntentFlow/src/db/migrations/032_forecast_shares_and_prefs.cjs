'use strict';

async function tableExists(db, name) {
  const row = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [name],
  );
  return Boolean(row);
}

module.exports = async function migration032(db) {
  console.log('📁 Running migration: 032_forecast_shares_and_prefs');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS forecast_shares (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_forecast_shares_user_id ON forecast_shares(user_id);
    CREATE INDEX IF NOT EXISTS idx_forecast_shares_expires ON forecast_shares(expires_at);

    CREATE TABLE IF NOT EXISTS forecast_recurring_prefs (
      user_id INTEGER NOT NULL,
      recurring_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('confirmed', 'ignored')),
      override_json TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, recurring_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  if (await tableExists(db, 'scheduled_transactions')) {
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tx_user_date
        ON scheduled_transactions(user_id, date, status);
    `);
  }

  console.log('✅ Migration 032_forecast_shares_and_prefs completed');
};
