/**
 * Manual ↔ Plaid account matching and merge helpers.
 */
const {
  mapPlaidTypeToInternal,
  accountFingerprint,
} = require('./plaidService.cjs');
const {
  findScoredManualCandidates,
  buildPlaidContext,
  THRESHOLD_AUTO,
  THRESHOLD_CONFIRM,
} = require('../accounts/accountIdentityMatch.cjs');
const {
  executePlaidToManualMerge,
  getMergePreview,
  keepPlaidAccountSeparate,
  rollbackMergeSession,
} = require('../accounts/accountMergeService.cjs');

/**
 * @deprecated Use findScoredManualCandidates — kept for compatibility.
 */
async function findManualAccountCandidates(db, userId, { internalType, mask, institutionName }) {
  const scored = await findScoredManualCandidates(db, userId, {
    internalType,
    mask,
    institutionName,
    displayName: '',
    balance: 0,
  });
  return scored.map(({ id, name, balance, institution, type, external_mask }) => ({
    id,
    name,
    type,
    external_mask,
    institution,
    balance,
    source: 'manual',
  }));
}

/**
 * Link a Plaid account row to an existing internal account (merge).
 */
async function mergePlaidAccountToManual(db, userId, plaidAccountId, targetAccountId, deps = {}) {
  return executePlaidToManualMerge(db, userId, plaidAccountId, targetAccountId, deps);
}

/**
 * Check for possible duplicate before manual account create.
 */
async function checkManualAccountDuplicate(db, userId, { type, mask, name, institution }) {
  const duplicates = [];

  if (mask && type) {
    const byMask = await db.all(
      `SELECT id, name, type, external_mask, source, institution
       FROM accounts
       WHERE user_id = ? AND is_active = 1
         AND IFNULL(account_status, 'active') = 'active'
         AND type = ?
         AND (external_mask = ? OR account_number LIKE ?)`,
      [userId, type, mask, `%${mask}`]
    );
    duplicates.push(...byMask);
  }

  if (name && institution) {
    const byName = await db.all(
      `SELECT id, name, type, external_mask, source, institution
       FROM accounts
       WHERE user_id = ? AND is_active = 1
         AND IFNULL(account_status, 'active') = 'active'
         AND type = ?
         AND LOWER(name) = LOWER(?)
         AND institution IS NOT NULL AND LOWER(institution) LIKE LOWER(?)`,
      [userId, type, name.trim(), `%${institution}%`]
    );
    for (const row of byName) {
      if (!duplicates.some((d) => d.id === row.id)) duplicates.push(row);
    }
  }

  const plaidLinked = await db.all(
    `SELECT a.id, a.name, a.type, a.external_mask, a.source, a.institution
     FROM accounts a
     JOIN plaid_accounts pa ON pa.account_id = a.id
     WHERE a.user_id = ? AND a.is_active = 1
       AND IFNULL(a.account_status, 'active') = 'active'
       AND a.type = ?
       ${mask ? 'AND (a.external_mask = ? OR pa.mask = ?)' : ''}`,
    mask ? [userId, type, mask, mask] : [userId, type]
  );
  for (const row of plaidLinked) {
    if (!duplicates.some((d) => d.id === row.id)) duplicates.push(row);
  }

  return duplicates;
}

module.exports = {
  findManualAccountCandidates,
  findScoredManualCandidates,
  buildPlaidContext,
  THRESHOLD_AUTO,
  THRESHOLD_CONFIRM,
  mergePlaidAccountToManual,
  executePlaidToManualMerge,
  getMergePreview,
  keepPlaidAccountSeparate,
  rollbackMergeSession,
  checkManualAccountDuplicate,
  accountFingerprint,
};
