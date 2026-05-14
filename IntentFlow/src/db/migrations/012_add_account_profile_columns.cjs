// Adds profile / modal fields not present on older accounts rows.

async function migrate(db) {
  console.log('📁 Running migration: 012_add_account_profile_columns');
  const tableInfo = await db.all('PRAGMA table_info(accounts)');
  const existing = new Set(tableInfo.map((c) => c.name));

  const columnsToAdd = [
    ['account_holder_name', 'TEXT'],
    ['loan_type', 'TEXT'],
    ['paired_category_id', 'TEXT'],
    ['rewards_program', 'TEXT'],
    ['transfer_limit', 'REAL'],
    ['linked_savings_account', 'TEXT'],
  ];

  await db.exec('BEGIN');
  try {
    for (const [name, def] of columnsToAdd) {
      if (!existing.has(name)) {
        console.log(`➕ Adding accounts.${name}`);
        await db.exec(`ALTER TABLE accounts ADD COLUMN ${name} ${def}`);
      }
    }
    await db.exec('COMMIT');
    console.log('✅ Migration 012_add_account_profile_columns completed');
  } catch (e) {
    await db.exec('ROLLBACK');
    console.error('❌ Migration 012 failed:', e);
    throw e;
  }
}

module.exports = migrate;
