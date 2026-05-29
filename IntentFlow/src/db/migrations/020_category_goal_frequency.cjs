module.exports = async function migrate020CategoryGoalFrequency(db) {
  const cols = async (table) => db.all(`PRAGMA table_info(${table})`);
  const hasCol = async (table, col) => (await cols(table)).some((c) => c.name === col);

  if (!(await hasCol('categories', 'target_frequency'))) {
    await db.exec(
      "ALTER TABLE categories ADD COLUMN target_frequency TEXT DEFAULT 'monthly'",
    );
  }

  await db.exec(`
    UPDATE categories
    SET target_frequency = 'monthly'
    WHERE target_frequency IS NULL OR TRIM(target_frequency) = ''
  `);
};
