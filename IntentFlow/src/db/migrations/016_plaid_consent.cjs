/**
 * Optional Plaid item consent expiry metadata.
 */
async function migrate(db) {
  console.log('📁 Running migration: 016_plaid_consent');

  const info = await db.all('PRAGMA table_info(plaid_items)');
  const cols = new Set(info.map((c) => c.name));
  if (!cols.has('consent_expires_at')) {
    await db.exec(`ALTER TABLE plaid_items ADD COLUMN consent_expires_at DATETIME`);
    console.log('➕ Added plaid_items.consent_expires_at');
  }

  console.log('✅ Migration 016_plaid_consent completed');
}

module.exports = migrate;
