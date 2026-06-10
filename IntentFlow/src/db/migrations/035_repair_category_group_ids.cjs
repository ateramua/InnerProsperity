/**
 * Backfill category_groups.id where inserts omitted the TEXT primary key.
 * Existing categories reference groups via CAST(rowid AS TEXT) in group_id.
 */
module.exports = async function migration035(db) {
  await db.exec(`
    UPDATE category_groups
    SET id = CAST(rowid AS TEXT)
    WHERE id IS NULL OR TRIM(CAST(id AS TEXT)) = '';
  `);
};
