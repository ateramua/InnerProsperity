/**
 * Migration 038 — Imported cash reconciliation & budget identity snapshots.
 */

module.exports = async function migration038(db) {
  console.log('   Imported cash reconciliation schema…');

  const accountColumns = [
    ['onboarding_complete', 'INTEGER NOT NULL DEFAULT 0'],
    ['onboarding_snapshot_id', 'TEXT'],
    ['imported_opening_balance_transaction_id', 'INTEGER'],
    ['duplicate_of_account_id', 'TEXT'],
    ['budget_inclusion_status', "TEXT NOT NULL DEFAULT 'on_budget'"],
    ['on_budget', 'INTEGER NOT NULL DEFAULT 1'],
  ];

  for (const [name, def] of accountColumns) {
    const cols = await db.all('PRAGMA table_info(accounts)');
    if (!cols.some((c) => c.name === name)) {
      await db.exec(`ALTER TABLE accounts ADD COLUMN ${name} ${def}`);
    }
  }

  const txColumns = [
    ['transaction_type', 'TEXT'],
    ['affects_rta', 'INTEGER NOT NULL DEFAULT 0'],
    ['synthetic', 'INTEGER NOT NULL DEFAULT 0'],
    ['reconciliation_generated', 'INTEGER NOT NULL DEFAULT 0'],
    ['onboarding_event', 'INTEGER NOT NULL DEFAULT 0'],
    ['imported_cash_event', 'INTEGER NOT NULL DEFAULT 0'],
    ['onboarding_snapshot_id', 'TEXT'],
  ];

  for (const [name, def] of txColumns) {
    const cols = await db.all('PRAGMA table_info(transactions)');
    if (!cols.some((c) => c.name === name)) {
      await db.exec(`ALTER TABLE transactions ADD COLUMN ${name} ${def}`);
    }
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_identity_snapshots (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      recorded_at DATETIME NOT NULL DEFAULT (datetime('now')),
      on_budget_cash REAL NOT NULL DEFAULT 0,
      rta REAL NOT NULL DEFAULT 0,
      assigned_total REAL NOT NULL DEFAULT 0,
      category_available_total REAL NOT NULL DEFAULT 0,
      identity_delta REAL NOT NULL DEFAULT 0,
      unallocated_imported_cash REAL NOT NULL DEFAULT 0,
      health_status TEXT NOT NULL DEFAULT 'healthy',
      source TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_onboarding_snapshots (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      item_id TEXT,
      recorded_at DATETIME NOT NULL DEFAULT (datetime('now')),
      net_new_cash REAL NOT NULL DEFAULT 0,
      opening_balance_total REAL NOT NULL DEFAULT 0,
      notes TEXT
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_budget_identity_snapshots_user
      ON budget_identity_snapshots(user_id, recorded_at DESC);
  `);

  console.log('   Imported cash reconciliation schema complete.');
};
