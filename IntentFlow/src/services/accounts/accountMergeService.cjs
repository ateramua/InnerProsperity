/**
 * Account merge execution, preview, reference migration, and rollback.
 */
const { v4: uuidv4 } = require('uuid');
const {
  mapPlaidTypeToInternal,
  mapInternalAccountTypeCategory,
  plaidBalanceToAppBalance,
  buildAccountDisplayName,
} = require('../plaid/plaidService.cjs');
const {
  analyzeMergeDuplicates,
  dedupeTransactionsOnMerge,
} = require('./transactionDedup.cjs');
const { THRESHOLD_AUTO } = require('./accountIdentityMatch.cjs');

async function tableExists(db, name) {
  const row = await db.get(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [name]
  );
  return !!row;
}

async function countRows(db, sql, params) {
  const row = await db.get(sql, params);
  return Number(row?.c || row?.cnt || 0);
}

async function snapshotAccount(db, accountId, userId) {
  const account = await db.get(
    `SELECT * FROM accounts WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
    [accountId, userId]
  );
  if (!account) return null;
  const txCount = await countRows(
    db,
    `SELECT COUNT(*) AS c FROM transactions
     WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ? AND IFNULL(is_deleted,0)=0`,
    [accountId, userId]
  );
  return { account, transactionCount: txCount };
}

/**
 * Migrate all foreign-key-like references from merged account → survivor.
 */
async function migrateAccountReferences(db, fromAccountId, toAccountId, userId) {
  const pairs = [
    [
      `UPDATE transactions SET account_id = ?
       WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [toAccountId, fromAccountId, userId],
    ],
    [
      `UPDATE transactions SET transfer_account_id = ?
       WHERE CAST(transfer_account_id AS TEXT) = CAST(? AS TEXT)`,
      [toAccountId, fromAccountId],
    ],
    [
      `UPDATE transactions SET counterparty_account_id = ?
       WHERE CAST(counterparty_account_id AS TEXT) = CAST(? AS TEXT)`,
      [toAccountId, fromAccountId],
    ],
    [
      `UPDATE accounts SET linked_savings_account = ?
       WHERE CAST(linked_savings_account AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [toAccountId, fromAccountId, userId],
    ],
  ];

  if (await tableExists(db, 'scheduled_transactions')) {
    pairs.push([
      `UPDATE scheduled_transactions SET account_id = ?
       WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
      [toAccountId, fromAccountId],
    ]);
  }
  if (await tableExists(db, 'account_balance_history')) {
    pairs.push([
      `UPDATE account_balance_history SET account_id = ?
       WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
      [toAccountId, fromAccountId],
    ]);
  }
  if (await tableExists(db, 'reconciliations')) {
    pairs.push([
      `UPDATE reconciliations SET account_id = ?
       WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
      [toAccountId, fromAccountId],
    ]);
  }
  if (await tableExists(db, 'credit_card_payments')) {
    pairs.push([
      `UPDATE credit_card_payments SET credit_card_account_id = ?
       WHERE CAST(credit_card_account_id AS TEXT) = CAST(? AS TEXT)`,
      [toAccountId, fromAccountId],
    ]);
  }
  if (await tableExists(db, 'categories')) {
    pairs.push([
      `UPDATE categories SET linked_account_id = ?
       WHERE CAST(linked_account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [toAccountId, fromAccountId, userId],
    ]);
  }
  if (await tableExists(db, 'goals')) {
    pairs.push([
      `UPDATE goals SET account_id = ?
       WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
      [toAccountId, fromAccountId],
    ]);
  }
  if (await tableExists(db, 'investments')) {
    pairs.push([
      `UPDATE investments SET account_id = ?
       WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
      [toAccountId, fromAccountId],
    ]);
  }

  const counts = {};
  for (const [sql, params] of pairs) {
    const result = await db.run(sql, params);
    const key = sql.split(' ')[1];
    counts[key] = (counts[key] || 0) + (result?.changes ?? 0);
  }
  return counts;
}

/**
 * Merge preview for UI (no mutations).
 */
async function getMergePreview(db, userId, plaidAccountId, targetAccountId) {
  const link = await db.get(
    `SELECT pa.*, pi.institution_name, pi.user_id
     FROM plaid_accounts pa
     JOIN plaid_items pi ON pa.item_id = pi.id
     WHERE pa.plaid_account_id = ? AND pi.user_id = ?`,
    [plaidAccountId, userId]
  );
  if (!link) throw new Error('Plaid account not found');

  const survivor = await db.get(
    `SELECT * FROM accounts WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
    [targetAccountId, userId]
  );
  if (!survivor) throw new Error('Target account not found');

  const sourceAccountId = link.account_id;
  const source =
    sourceAccountId && String(sourceAccountId) !== String(targetAccountId)
      ? await db.get(
          `SELECT * FROM accounts WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
          [sourceAccountId, userId]
        )
      : null;

  const survivorTxCount = await countRows(
    db,
    `SELECT COUNT(*) AS c FROM transactions
     WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ? AND IFNULL(is_deleted,0)=0`,
    [targetAccountId, userId]
  );

  const sourceTxCount = source
    ? await countRows(
        db,
        `SELECT COUNT(*) AS c FROM transactions
         WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ? AND IFNULL(is_deleted,0)=0`,
        [sourceAccountId, userId]
      )
    : 0;

  let duplicateAnalysis = {
    exactDuplicateCount: 0,
    probableDuplicateCount: 0,
    uniqueIncomingCount: sourceTxCount,
  };

  if (source && sourceTxCount > 0) {
    const sourceTxs = await db.all(
      `SELECT id, date, amount, payee, description, memo, category_id
       FROM transactions
       WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ? AND IFNULL(is_deleted,0)=0`,
      [sourceAccountId, userId]
    );
    const survivorTxs = await db.all(
      `SELECT id, date, amount, payee, description
       FROM transactions
       WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ? AND IFNULL(is_deleted,0)=0`,
      [targetAccountId, userId]
    );
    duplicateAnalysis = analyzeMergeDuplicates(sourceTxs, survivorTxs);
  }

  const goalsCount =
    (await tableExists(db, 'goals')) &&
    (await countRows(
      db,
      `SELECT COUNT(*) AS c FROM goals WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
      [targetAccountId]
    ));

  const budgetsViaCategory =
    (await tableExists(db, 'categories')) &&
    (await countRows(
      db,
      `SELECT COUNT(*) AS c FROM categories WHERE user_id = ? AND CAST(linked_account_id AS TEXT) = CAST(? AS TEXT)`,
      [userId, targetAccountId]
    ));

  return {
    existing: {
      id: survivor.id,
      name: survivor.name,
      balance: survivor.balance,
      transactionCount: survivorTxCount,
      institution: survivor.institution,
      connectedGoals: goalsCount || 0,
      connectedBudgets: budgetsViaCategory || 0,
      notes: survivor.notes,
    },
    incoming: {
      plaidAccountId,
      displayName: buildAccountDisplayName(
        { name: link.name, official_name: link.official_name, mask: link.mask },
        link.institution_name
      ),
      balance: source?.balance ?? survivor.balance,
      transactionCount: sourceTxCount,
      institution: link.institution_name,
      mask: link.mask,
    },
    preview: {
      totalTransactionsAfterMerge:
        survivorTxCount + duplicateAnalysis.uniqueIncomingCount,
      duplicateAnalysis,
      metadataPreserved: [
        'notes',
        'tags (via category_id)',
        'user categories',
        'reconciliation status',
        'split/transfer links',
      ],
      syncSource: 'plaid',
    },
    sourceAccountId: source?.id || null,
  };
}

/**
 * Execute Plaid → manual merge with transaction dedup + reference migration.
 */
async function executePlaidToManualMerge(
  db,
  userId,
  plaidAccountId,
  targetAccountId,
  deps = {}
) {
  const { updateAccountBalances, createPlaidClient, decryptToken } = deps;
  const sessionId = uuidv4();

  const preview = await getMergePreview(db, userId, plaidAccountId, targetAccountId);
  const link = await db.get(
    `SELECT pa.*, pi.institution_name, pi.institution_id, pi.user_id, pi.id AS item_id
     FROM plaid_accounts pa
     JOIN plaid_items pi ON pa.item_id = pi.id
     WHERE pa.plaid_account_id = ? AND pi.user_id = ?`,
    [plaidAccountId, userId]
  );
  if (!link) throw new Error('Plaid account not found');

  const target = await db.get(
    `SELECT * FROM accounts WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
    [targetAccountId, userId]
  );
  if (!target) throw new Error('Target account not found');

  const oldAccountId = link.account_id;
  const preSnapshot = {
    target: await snapshotAccount(db, targetAccountId, userId),
    source: oldAccountId
      ? await snapshotAccount(db, oldAccountId, userId)
      : null,
    plaidAccountId,
  };

  let balance = target.balance;
  if (createPlaidClient && link.item_id && decryptToken) {
    const item = await db.get(`SELECT access_token FROM plaid_items WHERE id = ?`, [
      link.item_id,
    ]);
    if (item?.access_token) {
      try {
        const accessToken = decryptToken(item.access_token);
        const plaidClient = createPlaidClient();
        const res = await plaidClient.accountsGet({ access_token: accessToken });
        const plaidAcct = res.data.accounts.find((a) => a.account_id === plaidAccountId);
        if (plaidAcct) {
          const raw =
            plaidAcct.balances?.current ?? plaidAcct.balances?.available ?? 0;
          balance = plaidBalanceToAppBalance(plaidAcct, raw);
        }
      } catch (_) {
        /* keep target balance */
      }
    }
  }

  const displayName = buildAccountDisplayName(
    { name: link.name, official_name: link.official_name, mask: link.mask },
    link.institution_name
  );
  const internalType = mapPlaidTypeToInternal({ type: link.type, subtype: link.subtype });
  const category = mapInternalAccountTypeCategory(internalType);

  await db.exec('BEGIN');
  try {
    if (
      oldAccountId &&
      String(oldAccountId) !== String(targetAccountId)
    ) {
      await dedupeTransactionsOnMerge(db, oldAccountId, targetAccountId, userId);
      await migrateAccountReferences(db, oldAccountId, targetAccountId, userId);

      await db.run(
        `UPDATE accounts SET
          is_active = 0,
          account_status = 'merged',
          merged_into_account_id = ?,
          merged_at = datetime('now'),
          merge_session_id = ?,
          source = 'manual',
          sync_enabled = 0,
          updated_at = datetime('now')
         WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
        [targetAccountId, sessionId, oldAccountId, userId]
      );
    }

    await db.run(
      `UPDATE plaid_accounts SET account_id = ?, updated_at = datetime('now')
       WHERE plaid_account_id = ?`,
      [targetAccountId, plaidAccountId]
    );

    await db.run(
      `UPDATE accounts SET
        name = ?, type = ?, account_type_category = ?, balance = ?,
        cleared_balance = ?, working_balance = ?,
        institution = ?, external_mask = ?, source = 'plaid', sync_enabled = 1,
        account_status = 'active',
        merged_into_account_id = NULL,
        merged_at = NULL,
        last_balance_sync_at = datetime('now'), updated_at = datetime('now')
       WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [
        displayName,
        internalType,
        category,
        balance,
        balance,
        balance,
        link.institution_name,
        link.mask || target.external_mask,
        targetAccountId,
        userId,
      ]
    );

    const postSnapshot = {
      target: await snapshotAccount(db, targetAccountId, userId),
      preview,
    };

    await db.run(
      `INSERT INTO account_merge_sessions (
        id, user_id, survivor_account_id, merged_account_id, plaid_account_id,
        confidence_score, initiated_by, pre_merge_snapshot, post_merge_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        userId,
        targetAccountId,
        oldAccountId && String(oldAccountId) !== String(targetAccountId)
          ? oldAccountId
          : targetAccountId,
        plaidAccountId,
        null,
        'user',
        JSON.stringify(preSnapshot),
        JSON.stringify(postSnapshot),
      ]
    );

    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  if (updateAccountBalances) {
    await updateAccountBalances(targetAccountId);
  }

  try {
    const {
      archiveCreditCardPaymentCategoryForAccount,
      syncCreditCardPaymentCategoriesForUser,
    } = require('./creditCardPaymentCategoryService.cjs');
    const deactivatedId =
      oldAccountId && String(oldAccountId) !== String(targetAccountId)
        ? oldAccountId
        : null;
    if (deactivatedId) {
      const mergedAway = await db.get(
        'SELECT * FROM accounts WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
        [deactivatedId, userId]
      );
      if (mergedAway) {
        await archiveCreditCardPaymentCategoryForAccount(db, mergedAway, {
          reason: 'account_merge',
        });
      }
    }
    await syncCreditCardPaymentCategoriesForUser(db, userId, { reason: 'account_merge' });
  } catch (ccErr) {
    console.warn('Credit card payment category sync after merge:', ccErr.message);
  }

  return {
    success: true,
    sessionId,
    targetAccountId,
    deactivatedAccountId:
      oldAccountId && String(oldAccountId) !== String(targetAccountId)
        ? oldAccountId
        : null,
    preview: preview.preview,
  };
}

/**
 * Activate a pending_merge Plaid staging account as a separate active account.
 */
async function keepPlaidAccountSeparate(db, userId, plaidAccountId) {
  const link = await db.get(
    `SELECT pa.account_id, pi.user_id
     FROM plaid_accounts pa
     JOIN plaid_items pi ON pa.item_id = pi.id
     WHERE pa.plaid_account_id = ? AND pi.user_id = ?`,
    [plaidAccountId, userId]
  );
  if (!link?.account_id) throw new Error('Plaid account not found');

  await db.run(
    `UPDATE accounts SET account_status = 'active', is_active = 1, updated_at = datetime('now')
     WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
    [link.account_id, userId]
  );

  return { success: true, accountId: link.account_id };
}

/**
 * Roll back a merge session (best-effort; restores merged account row state).
 */
async function rollbackMergeSession(db, userId, sessionId) {
  const session = await db.get(
    `SELECT * FROM account_merge_sessions
     WHERE id = ? AND user_id = ? AND rolled_back_at IS NULL`,
    [sessionId, userId]
  );
  if (!session) throw new Error('Merge session not found or already rolled back');

  const pre = JSON.parse(session.pre_merge_snapshot || '{}');
  const mergedId = session.merged_account_id;
  const survivorId = session.survivor_account_id;

  if (!pre.source?.account || mergedId === survivorId) {
    throw new Error('This merge cannot be rolled back automatically');
  }

  await db.exec('BEGIN');
  try {
    const acc = pre.source.account;
    await db.run(
      `UPDATE accounts SET
        is_active = 1,
        account_status = 'active',
        merged_into_account_id = NULL,
        merged_at = NULL,
        merge_session_id = NULL,
        name = ?, balance = ?, type = ?, institution = ?,
        updated_at = datetime('now')
       WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [
        acc.name,
        acc.balance,
        acc.type,
        acc.institution,
        mergedId,
        userId,
      ]
    );

    if (session.plaid_account_id) {
      await db.run(
        `UPDATE plaid_accounts SET account_id = ?, updated_at = datetime('now')
         WHERE plaid_account_id = ?`,
        [mergedId, session.plaid_account_id]
      );
    }

    await db.run(
      `UPDATE account_merge_sessions SET rolled_back_at = datetime('now') WHERE id = ?`,
      [sessionId]
    );

    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  return { success: true, sessionId, restoredAccountId: mergedId };
}

module.exports = {
  THRESHOLD_AUTO,
  getMergePreview,
  executePlaidToManualMerge,
  migrateAccountReferences,
  keepPlaidAccountSeparate,
  rollbackMergeSession,
  snapshotAccount,
};
