/**
 * Migration 025 — Add transactions.cleared (synced with is_cleared).
 */

async function columnExists(db, tableName, columnName) {
  const columns = await db.all(`PRAGMA table_info(${tableName})`);
  return columns.some((col) => col.name === columnName);
}

module.exports = async function migration025(db) {
  console.log('   Adding transactions.cleared column…');

  if (!(await columnExists(db, 'transactions', 'cleared'))) {
    await db.exec(`ALTER TABLE transactions ADD COLUMN cleared INTEGER DEFAULT 0`);
    console.log('   + transactions.cleared');
  }

  await db.exec(`
    UPDATE transactions
    SET cleared = IFNULL(is_cleared, 0)
    WHERE cleared IS NULL OR cleared != IFNULL(is_cleared, 0);
  `);

  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_transactions_cleared_from_is_cleared_insert
    AFTER INSERT ON transactions
    FOR EACH ROW
    WHEN NEW.cleared IS NULL OR NEW.cleared != IFNULL(NEW.is_cleared, 0)
    BEGIN
      UPDATE transactions
      SET cleared = IFNULL(NEW.is_cleared, 0)
      WHERE id = NEW.id;
    END;
  `);

  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_transactions_is_cleared_from_cleared_insert
    AFTER INSERT ON transactions
    FOR EACH ROW
    WHEN NEW.is_cleared IS NULL OR NEW.is_cleared != IFNULL(NEW.cleared, 0)
    BEGIN
      UPDATE transactions
      SET is_cleared = IFNULL(NEW.cleared, 0)
      WHERE id = NEW.id;
    END;
  `);

  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_transactions_cleared_from_is_cleared_update
    AFTER UPDATE OF is_cleared ON transactions
    FOR EACH ROW
    WHEN NEW.cleared != IFNULL(NEW.is_cleared, 0)
    BEGIN
      UPDATE transactions
      SET cleared = IFNULL(NEW.is_cleared, 0)
      WHERE id = NEW.id;
    END;
  `);

  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_transactions_is_cleared_from_cleared_update
    AFTER UPDATE OF cleared ON transactions
    FOR EACH ROW
    WHEN NEW.is_cleared != IFNULL(NEW.cleared, 0)
    BEGIN
      UPDATE transactions
      SET is_cleared = IFNULL(NEW.cleared, 0)
      WHERE id = NEW.id;
    END;
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_cleared ON transactions(cleared);
  `);

  console.log('   transactions.cleared migration complete.');
};
