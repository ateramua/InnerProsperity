/**
 * Manual ↔ Plaid account matching and merge helpers.
 */
const {
  mapPlaidTypeToInternal,
  mapInternalAccountTypeCategory,
  plaidBalanceToAppBalance,
  buildAccountDisplayName,
  accountFingerprint,
} = require('./plaidService.cjs');

/**
 * Find manual accounts that may be the same as a Plaid account (not already linked).
 */
async function findManualAccountCandidates(db, userId, { internalType, mask, institutionName }) {
  let query = `
    SELECT a.id, a.name, a.type, a.external_mask, a.institution, a.balance, a.source
    FROM accounts a
    WHERE a.user_id = ?
      AND a.is_active = 1
      AND (a.source IS NULL OR a.source = 'manual')
      AND a.type = ?
      AND NOT EXISTS (
        SELECT 1 FROM plaid_accounts pa WHERE pa.account_id = a.id
      )
  `;
  const params = [userId, internalType];

  if (mask) {
    query += ` AND (
      a.external_mask = ?
      OR (a.account_number IS NOT NULL AND a.account_number LIKE ?)
    )`;
    params.push(mask, `%${mask}`);
  } else if (institutionName) {
    query += ` AND (
      a.institution IS NULL
      OR LOWER(a.institution) LIKE LOWER(?)
    )`;
    params.push(`%${institutionName}%`);
  }

  query += ` ORDER BY a.name LIMIT 10`;
  return db.all(query, params);
}

/**
 * Link a Plaid account row to an existing internal account (merge).
 */
async function mergePlaidAccountToManual(db, userId, plaidAccountId, targetAccountId, deps = {}) {
  const { updateAccountBalances } = deps;

  const link = await db.get(
    `SELECT pa.*, pi.institution_name, pi.institution_id, pi.user_id
     FROM plaid_accounts pa
     JOIN plaid_items pi ON pa.item_id = pi.id
     WHERE pa.plaid_account_id = ? AND pi.user_id = ?`,
    [plaidAccountId, userId]
  );
  if (!link) throw new Error('Plaid account not found');

  const target = await db.get(
    `SELECT * FROM accounts WHERE id = ? AND user_id = ? AND is_active = 1`,
    [targetAccountId, userId]
  );
  if (!target) throw new Error('Target account not found');
  if (target.source === 'plaid') {
    const alreadyLinked = await db.get(
      `SELECT 1 FROM plaid_accounts WHERE account_id = ? AND plaid_account_id != ?`,
      [targetAccountId, plaidAccountId]
    );
    if (alreadyLinked) throw new Error('Target account is already linked to another Plaid account');
  }

  const oldAccountId = link.account_id;
  const institutionName = link.institution_name || null;

  const plaidClient = deps.createPlaidClient?.();
  let balance = target.balance;
  if (plaidClient && link.item_id) {
    const item = await db.get(`SELECT access_token FROM plaid_items WHERE id = ?`, [link.item_id]);
    if (item?.access_token && deps.decryptToken) {
      try {
        const accessToken = deps.decryptToken(item.access_token);
        const res = await plaidClient.accountsGet({ access_token: accessToken });
        const plaidAcct = res.data.accounts.find((a) => a.account_id === plaidAccountId);
        if (plaidAcct) {
          const raw =
            plaidAcct.balances?.current ?? plaidAcct.balances?.available ?? 0;
          balance = plaidBalanceToAppBalance(plaidAcct, raw);
        }
      } catch (_) {
        /* use existing balance */
      }
    }
  }

  const displayName = buildAccountDisplayName(
    { name: link.name, official_name: link.official_name, mask: link.mask },
    institutionName
  );
  const internalType = mapPlaidTypeToInternal({
    type: link.type,
    subtype: link.subtype,
  });
  const category = mapInternalAccountTypeCategory(internalType);

  await db.exec('BEGIN');
  try {
    await db.run(
      `UPDATE plaid_accounts SET account_id = ?, updated_at = datetime('now') WHERE plaid_account_id = ?`,
      [targetAccountId, plaidAccountId]
    );

    await db.run(
      `UPDATE accounts SET
        name = ?, type = ?, account_type_category = ?, balance = ?,
        cleared_balance = ?, working_balance = ?,
        institution = ?, external_mask = ?, source = 'plaid', sync_enabled = 1,
        last_balance_sync_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [
        displayName,
        internalType,
        category,
        balance,
        balance,
        balance,
        institutionName,
        link.mask || target.external_mask,
        targetAccountId,
        userId,
      ]
    );

    if (oldAccountId && oldAccountId !== targetAccountId) {
      await db.run(
        `UPDATE accounts SET is_active = 0, source = 'manual', sync_enabled = 0,
         updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
        [oldAccountId, userId]
      );
    }

    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  if (updateAccountBalances) {
    await updateAccountBalances(targetAccountId);
  }

  return {
    success: true,
    targetAccountId,
    deactivatedAccountId: oldAccountId !== targetAccountId ? oldAccountId : null,
  };
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
       WHERE user_id = ? AND is_active = 1 AND type = ?
         AND (external_mask = ? OR account_number LIKE ?)`,
      [userId, type, mask, `%${mask}`]
    );
    duplicates.push(...byMask);
  }

  if (name && institution) {
    const byName = await db.all(
      `SELECT id, name, type, external_mask, source, institution
       FROM accounts
       WHERE user_id = ? AND is_active = 1 AND type = ?
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
     WHERE a.user_id = ? AND a.is_active = 1 AND a.type = ?
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
  mergePlaidAccountToManual,
  checkManualAccountDuplicate,
};
