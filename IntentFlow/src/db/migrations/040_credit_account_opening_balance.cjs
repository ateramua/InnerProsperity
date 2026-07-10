/**
 * Migration 040 — Credit account opening balance audit + typed ledger rows.
 */

module.exports = async function migration040(db) {
  console.log('   Credit account opening balance schema…');

  const accountCols = await db.all('PRAGMA table_info(accounts)');
  if (!accountCols.some((c) => c.name === 'credit_opening_balance_transaction_id')) {
    await db.exec(
      `ALTER TABLE accounts ADD COLUMN credit_opening_balance_transaction_id INTEGER`
    );
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS opening_balance_audit (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      transaction_id INTEGER,
      event_type TEXT NOT NULL,
      previous_amount REAL,
      new_amount REAL,
      previous_date TEXT,
      new_date TEXT,
      source TEXT,
      payload_json TEXT,
      recorded_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opening_balance_audit_account
      ON opening_balance_audit(account_id, recorded_at DESC);
  `);

  // Backfill credit starting balance rows with typed marker + non-categorized status.
  await db.run(`
    UPDATE transactions
    SET transaction_type = 'CREDIT_OPENING_BALANCE',
        category_id = NULL,
        mapping_status = 'not_applicable',
        affects_rta = 0,
        updated_at = datetime('now')
    WHERE IFNULL(is_deleted, 0) = 0
      AND IFNULL(is_system, 0) = 1
      AND (LOWER(payee) = 'starting balance' OR LOWER(description) = 'starting balance')
      AND account_id IN (
        SELECT id FROM accounts WHERE LOWER(IFNULL(type, '')) IN ('credit', 'credit card', 'charge card')
      )
      AND IFNULL(transaction_type, '') = ''
  `);

  await db.run(`
    UPDATE accounts
    SET credit_opening_balance_transaction_id = (
      SELECT t.id FROM transactions t
      WHERE t.account_id = accounts.id
        AND IFNULL(t.is_deleted, 0) = 0
        AND t.transaction_type = 'CREDIT_OPENING_BALANCE'
      ORDER BY t.date ASC, t.created_at ASC
      LIMIT 1
    ),
    updated_at = datetime('now')
    WHERE LOWER(IFNULL(type, '')) IN ('credit', 'credit card', 'charge card')
      AND credit_opening_balance_transaction_id IS NULL
  `);

  console.log('   Credit account opening balance schema complete.');
};
