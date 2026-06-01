/**
 * Migration 027 — Scope import category mappings per financial institution.
 */

async function tableExists(db, name) {
  const row = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [name]
  );
  return Boolean(row);
}

async function columnExists(db, tableName, columnName) {
  const columns = await db.all(`PRAGMA table_info(${tableName})`);
  return columns.some((col) => col.name === columnName);
}

module.exports = async function migration027(db) {
  console.log('   Upgrading import_category_mappings for per-institution keys…');

  if (!(await tableExists(db, 'import_category_mappings'))) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS import_category_mappings (
        user_id INTEGER NOT NULL,
        institution_key TEXT NOT NULL DEFAULT '',
        bank_category TEXT NOT NULL,
        category_id TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, institution_key, bank_category),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );
      CREATE INDEX IF NOT EXISTS idx_import_category_mappings_user_id
        ON import_category_mappings(user_id);
      CREATE INDEX IF NOT EXISTS idx_import_category_mappings_institution
        ON import_category_mappings(user_id, institution_key);
    `);
    console.log('   Created import_category_mappings with institution_key');
    return;
  }

  if (await columnExists(db, 'import_category_mappings', 'institution_key')) {
    console.log('   institution_key already present');
    return;
  }

  await db.exec(`
    CREATE TABLE import_category_mappings_v2 (
      user_id INTEGER NOT NULL,
      institution_key TEXT NOT NULL DEFAULT '',
      bank_category TEXT NOT NULL,
      category_id TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, institution_key, bank_category),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  await db.exec(`
    INSERT INTO import_category_mappings_v2 (user_id, institution_key, bank_category, category_id, updated_at)
    SELECT user_id, '', bank_category, category_id, updated_at
    FROM import_category_mappings;
  `);

  await db.exec(`DROP TABLE import_category_mappings;`);
  await db.exec(`ALTER TABLE import_category_mappings_v2 RENAME TO import_category_mappings;`);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_import_category_mappings_user_id
      ON import_category_mappings(user_id);
    CREATE INDEX IF NOT EXISTS idx_import_category_mappings_institution
      ON import_category_mappings(user_id, institution_key);
  `);

  console.log('   import_category_mappings institution_key migration complete.');
};
