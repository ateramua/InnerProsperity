/**
 * Persist CSV/bank export category → IntentFlow budget category mappings.
 */
async function migrate(db) {
  console.log('📁 Running migration: 023_import_category_mappings');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS import_category_mappings (
      user_id INTEGER NOT NULL,
      bank_category TEXT NOT NULL,
      category_id TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, bank_category),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
    CREATE INDEX IF NOT EXISTS idx_import_category_mappings_user_id
      ON import_category_mappings(user_id);
  `);
  console.log('✅ Migration 023_import_category_mappings completed');
}

module.exports = migrate;
