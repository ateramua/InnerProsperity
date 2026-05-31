/**
 * Persist and load bank CSV category → IntentFlow budget category mappings.
 */

function normKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

async function getImportCategoryMappings(db, userId) {
  const rows = await db.all(
    `SELECT bank_category, category_id FROM import_category_mappings WHERE user_id = ?`,
    [userId]
  );
  const map = {};
  for (const row of rows || []) {
    if (row?.bank_category) {
      map[row.bank_category] = row.category_id ?? null;
    }
  }
  return map;
}

async function saveImportCategoryMappings(db, userId, mappings) {
  if (!mappings || typeof mappings !== 'object') return { saved: 0 };
  let saved = 0;
  for (const [bankCategory, categoryId] of Object.entries(mappings)) {
    const key = normKey(bankCategory);
    if (!key) continue;
    if (categoryId == null || categoryId === '') continue;
    const cid = categoryId === 'inflow_ready_to_assign' ? null : categoryId;
    await db.run(
      `INSERT INTO import_category_mappings (user_id, bank_category, category_id, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, bank_category) DO UPDATE SET
         category_id = excluded.category_id,
         updated_at = datetime('now')`,
      [userId, key, cid]
    );
    saved++;
  }
  return { saved };
}

module.exports = {
  normKey,
  getImportCategoryMappings,
  saveImportCategoryMappings,
};
