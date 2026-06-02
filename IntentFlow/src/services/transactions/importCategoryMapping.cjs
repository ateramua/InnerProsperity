/**
 * Persist and load bank CSV category → IntentFlow budget category mappings.
 * Mappings can be global (institution_key '') or per detected bank / account institution.
 */

const { SUPPORTED_BANKS } = require('./bankImportProfiles.cjs');

function normKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normInstitutionKey(value) {
  const k = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return k.slice(0, 64);
}

function institutionDisplayName(institutionKey) {
  const key = normInstitutionKey(institutionKey);
  if (!key) return 'Default (all institutions)';
  const bank = (SUPPORTED_BANKS || []).find((b) => b.id === key);
  if (bank?.name) return bank.name;
  return key.replace(/_/g, ' ');
}

/**
 * @param {{ detectedProfile?: { id?: string }|null, account?: { institution?: string }|null }} ctx
 */
function resolveInstitutionKey(ctx = {}) {
  if (ctx.detectedProfile?.id) return normInstitutionKey(ctx.detectedProfile.id);
  const inst = normKey(ctx.account?.institution);
  if (inst) return normInstitutionKey(inst);
  return '';
}

/**
 * Merge institution-specific mappings over global defaults.
 */
async function getMappingsForImport(db, userId, institutionKey = '') {
  const instKey = normInstitutionKey(institutionKey);
  const rows = await db.all(
    `SELECT institution_key, bank_category, category_id
     FROM import_category_mappings
     WHERE user_id = ?
       AND (institution_key = ? OR institution_key = '')`,
    [userId, instKey]
  );

  const global = {};
  const institution = {};
  for (const row of rows || []) {
    if (!row?.bank_category) continue;
    if (row.category_id == null || row.category_id === '') continue;
    const cid = row.category_id;
    if (row.institution_key === instKey && instKey) {
      institution[row.bank_category] = cid;
    } else if (!row.institution_key) {
      global[row.bank_category] = cid;
    }
  }

  const merged = { ...global, ...institution };
  return { merged, global, institution, institutionKey: instKey };
}

/** @deprecated Use getMappingsForImport — returns flat map for backwards compatibility */
async function getImportCategoryMappings(db, userId, institutionKey = '') {
  const { merged } = await getMappingsForImport(db, userId, institutionKey);
  return merged;
}

async function saveImportCategoryMappings(db, userId, mappings, institutionKey = '') {
  if (!mappings || typeof mappings !== 'object') return { saved: 0 };
  const instKey = normInstitutionKey(institutionKey);
  let saved = 0;

  for (const [bankCategory, categoryId] of Object.entries(mappings)) {
    const key = normKey(bankCategory);
    if (!key) continue;
    if (categoryId == null || categoryId === '') continue;

    const { isReadyToAssignSentinel } = require('../../shared/readyToAssignCategory.cjs');
    const cid = isReadyToAssignSentinel(categoryId) ? null : categoryId;
    await db.run(
      `INSERT INTO import_category_mappings (user_id, institution_key, bank_category, category_id, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, institution_key, bank_category) DO UPDATE SET
         category_id = excluded.category_id,
         updated_at = datetime('now')`,
      [userId, instKey, key, cid]
    );
    saved += 1;
  }
  return { saved, institutionKey: instKey };
}

async function listImportCategoryMappings(db, userId) {
  const rows = await db.all(
    `SELECT m.institution_key, m.bank_category, m.category_id, m.updated_at,
            c.name AS category_name
     FROM import_category_mappings m
     LEFT JOIN categories c ON c.id = m.category_id AND c.user_id = m.user_id
     WHERE m.user_id = ?
     ORDER BY m.institution_key, m.bank_category`,
    [userId]
  );
  return (rows || []).map((row) => ({
    institutionKey: row.institution_key || '',
    institutionLabel: institutionDisplayName(row.institution_key),
    bankCategory: row.bank_category,
    categoryId: row.category_id,
    categoryName: row.category_name || (row.category_id ? 'Uncategorized' : 'Ready to Assign'),
    updatedAt: row.updated_at,
  }));
}

async function deleteImportCategoryMapping(db, userId, institutionKey, bankCategory) {
  const instKey = normInstitutionKey(institutionKey);
  const key = normKey(bankCategory);
  if (!key) return { deleted: 0 };
  const result = await db.run(
    `DELETE FROM import_category_mappings
     WHERE user_id = ? AND institution_key = ? AND bank_category = ?`,
    [userId, instKey, key]
  );
  return { deleted: result.changes || 0 };
}

module.exports = {
  normKey,
  normInstitutionKey,
  institutionDisplayName,
  resolveInstitutionKey,
  getMappingsForImport,
  getImportCategoryMappings,
  saveImportCategoryMappings,
  listImportCategoryMappings,
  deleteImportCategoryMapping,
};
