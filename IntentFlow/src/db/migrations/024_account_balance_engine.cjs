/**
 * Migration 024 — Account Transaction Balance Engine
 * Adds initial_balance, transaction direction/system flags, and indexes.
 */

async function columnExists(db, tableName, columnName) {
  const columns = await db.all(`PRAGMA table_info(${tableName})`);
  return columns.some((col) => col.name === columnName);
}

async function addColumnIfMissing(db, table, column, definition) {
  if (!(await columnExists(db, table, column))) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`   + accounts.${column}`);
  }
}

module.exports = async function migration024(db) {
  console.log('   Account balance engine schema…');

  await addColumnIfMissing(db, 'accounts', 'initial_balance', 'REAL DEFAULT 0');

  await addColumnIfMissing(db, 'transactions', 'direction', "TEXT CHECK(direction IN ('inflow','outflow') OR direction IS NULL)");
  await addColumnIfMissing(db, 'transactions', 'is_system', 'INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'transactions', 'is_adjustment', 'INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'transactions', 'is_reconciled', 'INTEGER DEFAULT 0');

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_cleared ON transactions(is_cleared);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_cleared ON transactions(account_id, is_cleared);
  `);

  // Backfill initial_balance = stored balance minus transaction sum (legacy accounts).
  await db.exec(`
    UPDATE accounts
    SET initial_balance = (
      COALESCE(balance, 0) - COALESCE((
        SELECT SUM(amount)
        FROM transactions t
        WHERE t.account_id = accounts.id
          AND (t.is_deleted IS NULL OR t.is_deleted = 0)
      ), 0)
    )
    WHERE initial_balance IS NULL OR initial_balance = 0;
  `);

  // Backfill direction from signed amount where missing.
  await db.exec(`
    UPDATE transactions
    SET direction = CASE WHEN amount >= 0 THEN 'inflow' ELSE 'outflow' END
    WHERE direction IS NULL AND amount IS NOT NULL;
  `);

  // Mark existing starting-balance rows as system transactions.
  await db.exec(`
    UPDATE transactions
    SET is_system = 1,
        is_cleared = CASE WHEN IFNULL(is_cleared, 0) = 0 THEN 1 ELSE is_cleared END,
        is_reconciled = 1
    WHERE (LOWER(payee) = 'starting balance' OR LOWER(description) = 'starting balance')
      AND IFNULL(is_system, 0) = 0;
  `);

  await db.exec(`
    UPDATE transactions
    SET is_reconciled = 1
    WHERE is_cleared = 2 AND IFNULL(is_reconciled, 0) = 0;
  `);

  console.log('   Account balance engine migration complete.');
};
