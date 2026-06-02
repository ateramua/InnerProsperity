/**
 * Migration 030 — Per-user Naive Bayes models for category ML recommendations.
 */

async function columnExists(db, tableName, columnName) {
  const columns = await db.all(`PRAGMA table_info(${tableName})`);
  return columns.some((col) => col.name === columnName);
}

module.exports = async function migration030(db) {
  console.log('   Category ML recommendation schema…');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS category_ml_models (
      user_id INTEGER PRIMARY KEY,
      model_json TEXT NOT NULL,
      training_samples INTEGER DEFAULT 0,
      trained_at TEXT,
      updated_at TEXT
    );
  `);

  const txCols = [
    ['suggested_category_source', 'TEXT'],
    ['suggested_category_confidence', 'REAL'],
  ];

  for (const [col, def] of txCols) {
    if (!(await columnExists(db, 'transactions', col))) {
      await db.exec(`ALTER TABLE transactions ADD COLUMN ${col} ${def}`);
      console.log(`   + transactions.${col}`);
    }
  }

  console.log('   Category ML migration complete.');
};
