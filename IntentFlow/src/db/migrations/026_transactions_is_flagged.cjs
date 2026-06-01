/**
 * Migration 026 — Add transactions.is_flagged for register flagging.
 */

async function columnExists(db, tableName, columnName) {
  const columns = await db.all(`PRAGMA table_info(${tableName})`);
  return columns.some((col) => col.name === columnName);
}

module.exports = async function migration026(db) {
  console.log('   Adding transactions.is_flagged column…');

  if (!(await columnExists(db, 'transactions', 'is_flagged'))) {
    await db.exec(`ALTER TABLE transactions ADD COLUMN is_flagged INTEGER DEFAULT 0`);
    console.log('   + transactions.is_flagged');
  }

  await db.exec(`
    UPDATE transactions SET is_flagged = 0 WHERE is_flagged IS NULL;
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_is_flagged ON transactions(is_flagged);
  `);

  console.log('   transactions.is_flagged migration complete.');
};
