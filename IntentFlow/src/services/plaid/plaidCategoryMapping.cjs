const { getPlaidCategoryKey } = require('./plaidService.cjs');

/**
 * Backfill category_id on Plaid-imported transactions for a mapping key.
 * @returns {Promise<{ updated: number }>}
 */
async function reapplyPlaidCategoryMapping(db, userId, plaidCategory, categoryId) {
  if (!plaidCategory || categoryId == null) {
    return { updated: 0 };
  }
  const result = await db.run(
    `UPDATE transactions SET category_id = ?, updated_at = datetime('now')
     WHERE user_id = ?
       AND plaid_transaction_id IS NOT NULL
       AND plaid_category_key = ?
       AND (is_deleted IS NULL OR is_deleted = 0)`,
    [categoryId, userId, plaidCategory]
  );
  return { updated: result.changes ?? 0 };
}

/**
 * Reapply all mappings for a user (e.g. after bulk import).
 */
async function reapplyAllPlaidCategoryMappings(db, userId) {
  const rows = await db.all(
    `SELECT plaid_category, category_id FROM plaid_category_mappings WHERE user_id = ?`,
    [userId]
  );
  let total = 0;
  for (const row of rows) {
    const { updated } = await reapplyPlaidCategoryMapping(
      db,
      userId,
      row.plaid_category,
      row.category_id
    );
    total += updated;
  }
  return { updated: total };
}

module.exports = {
  getPlaidCategoryKey,
  reapplyPlaidCategoryMapping,
  reapplyAllPlaidCategoryMappings,
};
