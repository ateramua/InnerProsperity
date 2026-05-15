/**
 * Plaid integration columns + one-time amount sign fix for imported transactions.
 */
async function migrate(db) {
  console.log('📁 Running migration: 013_plaid_integration');

  const addColumnIfMissing = async (table, name, def) => {
    const info = await db.all(`PRAGMA table_info(${table})`);
    if (!info.some((c) => c.name === name)) {
      console.log(`➕ Adding ${table}.${name}`);
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
    }
  };

  await db.exec('BEGIN');
  try {
    await addColumnIfMissing('accounts', 'source', "TEXT NOT NULL DEFAULT 'manual'");
    await addColumnIfMissing('accounts', 'sync_enabled', 'INTEGER NOT NULL DEFAULT 1');
    await addColumnIfMissing('accounts', 'external_mask', 'TEXT');
    await addColumnIfMissing('accounts', 'last_balance_sync_at', 'DATETIME');

    await addColumnIfMissing('plaid_items', 'status', "TEXT DEFAULT 'active'");
    await addColumnIfMissing('plaid_items', 'last_error', 'TEXT');

    await addColumnIfMissing('plaid_accounts', 'fingerprint', 'TEXT');

    // Backfill source for existing Plaid-linked accounts
    await db.run(`
      UPDATE accounts
      SET source = 'plaid'
      WHERE id IN (SELECT account_id FROM plaid_accounts WHERE account_id IS NOT NULL)
        AND (source IS NULL OR source = 'manual')
    `);

    // Fix transaction amounts imported from Plaid (positive outflow → negative in app)
    const fixed = await db.run(`
      UPDATE transactions
      SET amount = -amount
      WHERE plaid_transaction_id IS NOT NULL
        AND amount > 0
    `);
    if (fixed?.changes) {
      console.log(`🔄 Negated ${fixed.changes} Plaid transaction amount(s) for app convention`);
    }

    await db.exec('COMMIT');
    console.log('✅ Migration 013_plaid_integration completed');
  } catch (e) {
    await db.exec('ROLLBACK');
    console.error('❌ Migration 013 failed:', e);
    throw e;
  }
}

module.exports = migrate;
