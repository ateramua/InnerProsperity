/**
 * Migration 039 — Budget integrity suppressions, telemetry, Plaid snooze, legacy backfill.
 */

module.exports = async function migration039(db) {
  console.log('   Budget integrity phase completion schema…');

  const dismissalCols = await db.all('PRAGMA table_info(plaid_account_dismissals)');
  if (!dismissalCols.some((c) => c.name === 'expires_at')) {
    await db.exec(
      `ALTER TABLE plaid_account_dismissals ADD COLUMN expires_at DATETIME`
    );
  }
  if (!dismissalCols.some((c) => c.name === 'reason')) {
    await db.exec(`ALTER TABLE plaid_account_dismissals ADD COLUMN reason TEXT`);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_integrity_suppressions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      account_id TEXT,
      reason TEXT,
      suppressed_until DATETIME,
      created_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_reconciliation_events (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT,
      recorded_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_budget_integrity_suppressions_user
      ON budget_integrity_suppressions(user_id, suppressed_until);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_budget_reconciliation_events_user
      ON budget_reconciliation_events(user_id, recorded_at DESC);
  `);

  // Legacy Plaid-linked on-budget accounts without opening balance → eligible for migration repair.
  await db.run(`
    UPDATE accounts
    SET onboarding_complete = 0,
        updated_at = datetime('now')
    WHERE IFNULL(source, '') = 'plaid'
      AND IFNULL(onboarding_complete, 0) = 1
      AND IFNULL(budget_inclusion_status, 'on_budget') = 'on_budget'
      AND LOWER(IFNULL(type, '')) IN ('checking', 'savings')
      AND imported_opening_balance_transaction_id IS NULL
      AND id NOT IN (
        SELECT account_id FROM transactions
        WHERE transaction_type = 'OPENING_BALANCE'
          AND IFNULL(is_deleted, 0) = 0
      )
  `);

  console.log('   Budget integrity phase completion schema complete.');
};
