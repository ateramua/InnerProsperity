module.exports = async function migrate019PreserveArchivedCategoryGroup(db) {
  const cols = async (table) => db.all(`PRAGMA table_info(${table})`);
  const hasCol = async (table, col) => (await cols(table)).some((c) => c.name === col);

  if (!(await hasCol('categories', 'original_group_name'))) {
    await db.exec('ALTER TABLE categories ADD COLUMN original_group_name TEXT');
  }

  await db.exec(`
    UPDATE categories
    SET original_group_name = (
      SELECT cg.name
      FROM category_groups cg
      WHERE cg.user_id = categories.user_id
        AND CAST(cg.id AS TEXT) = CAST(
          COALESCE(
            NULLIF(TRIM(categories.original_group_id), ''),
            NULLIF(TRIM(categories.group_id), '')
          ) AS TEXT
        )
      LIMIT 1
    )
    WHERE (
        categories.archived = 1
        OR categories.archived = '1'
        OR lower(trim(cast(categories.archived as text))) = 'true'
      )
      AND (original_group_name IS NULL OR TRIM(original_group_name) = '')
      AND COALESCE(NULLIF(TRIM(original_group_id), ''), NULLIF(TRIM(group_id), '')) IS NOT NULL
  `);
};
