/**
 * Migration 029 — Transaction categorization & budget mapping (FR-1–FR-13).
 * Payees, category rules, audit trail, splits, and transaction metadata.
 */

async function columnExists(db, tableName, columnName) {
  const columns = await db.all(`PRAGMA table_info(${tableName})`);
  return columns.some((col) => col.name === columnName);
}

async function tableExists(db, tableName) {
  const row = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [tableName]
  );
  return !!row;
}

module.exports = async function migration029(db) {
  console.log('   Transaction categorization schema…');

  if (!(await tableExists(db, 'payees'))) {
    await db.exec(`
      CREATE TABLE payees (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT,
        is_transfer_payee INTEGER DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        last_used_date INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_payees_user ON payees(user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payees_user_norm
        ON payees(user_id, normalized_name) WHERE is_transfer_payee = 0 AND normalized_name IS NOT NULL;
    `);
    console.log('   + payees table');
  }

  if (!(await columnExists(db, 'payees', 'normalized_name'))) {
    await db.exec(`ALTER TABLE payees ADD COLUMN normalized_name TEXT`);
    console.log('   + payees.normalized_name');
  }

  const txCols = [
    ['payee_id', 'TEXT'],
    ['raw_description', 'TEXT'],
    ['import_source', "TEXT DEFAULT 'manual'"],
    ['mapping_status', "TEXT DEFAULT 'uncategorized'"],
    ['suggested_category_id', 'TEXT'],
    ['cc_payment_reserved', 'REAL DEFAULT 0'],
    ['is_split_parent', 'INTEGER DEFAULT 0'],
  ];

  for (const [col, def] of txCols) {
    if (!(await columnExists(db, 'transactions', col))) {
      await db.exec(`ALTER TABLE transactions ADD COLUMN ${col} ${def}`);
      console.log(`   + transactions.${col}`);
    }
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS category_rules (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      payee_id TEXT NOT NULL,
      default_category_id TEXT NOT NULL,
      confirmation_count INTEGER DEFAULT 0,
      confidence_score REAL DEFAULT 0,
      auto_apply INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (payee_id) REFERENCES payees(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_category_rules_user_payee
      ON category_rules(user_id, payee_id);
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS transaction_category_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      transaction_id TEXT NOT NULL,
      previous_category_id TEXT,
      new_category_id TEXT,
      change_source TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_category_audit_tx
      ON transaction_category_audit(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_tx_category_audit_user
      ON transaction_category_audit(user_id, created_at);
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS transaction_splits (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category_id TEXT NOT NULL,
      amount REAL NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_transaction_splits_parent
      ON transaction_splits(transaction_id);
  `);

  await db.exec(`
    UPDATE transactions
    SET mapping_status = CASE
      WHEN is_transfer = 1 THEN 'transfer'
      WHEN category_id IS NOT NULL AND category_id != '' THEN 'categorized'
      WHEN suggested_category_id IS NOT NULL AND suggested_category_id != '' THEN 'needs_review'
      ELSE 'uncategorized'
    END
    WHERE mapping_status IS NULL OR mapping_status = 'uncategorized';
  `);

  await db.exec(`
    UPDATE transactions SET import_source = 'plaid'
    WHERE plaid_transaction_id IS NOT NULL AND (import_source IS NULL OR import_source = 'manual');
  `);

  await db.exec(`
    UPDATE transactions SET raw_description = description
    WHERE raw_description IS NULL AND description IS NOT NULL;
  `);

  console.log('   Transaction categorization migration complete.');
};
