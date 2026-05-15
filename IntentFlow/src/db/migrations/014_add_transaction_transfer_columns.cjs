/**
 * Transfer columns required by monthlyBudgetService, transactionService, and payee flows.
 * Dev DBs created via initSchema.cjs alone may miss these until this migration runs.
 */
async function migrate(db) {
  console.log('📁 Running migration: 014_add_transaction_transfer_columns');
  const tableInfo = await db.all('PRAGMA table_info(transactions)');
  const existing = new Set(tableInfo.map((c) => c.name));

  const columnsToAdd = [
    ['is_transfer', 'INTEGER DEFAULT 0'],
    ['transfer_group_id', 'TEXT'],
    ['linked_transaction_id', 'TEXT'],
    ['counterparty_account_id', 'TEXT'],
    ['transfer_account_id', 'TEXT'],
    ['import_id', 'TEXT'],
    ['check_number', 'TEXT'],
  ];

  await db.exec('BEGIN');
  try {
    for (const [name, def] of columnsToAdd) {
      if (!existing.has(name)) {
        console.log(`➕ Adding transactions.${name}`);
        await db.exec(`ALTER TABLE transactions ADD COLUMN ${name} ${def}`);
      }
    }
    await db.exec('COMMIT');
    console.log('✅ Migration 014_add_transaction_transfer_columns completed');
  } catch (e) {
    await db.exec('ROLLBACK');
    console.error('❌ Migration 014 failed:', e);
    throw e;
  }
}

module.exports = migrate;
