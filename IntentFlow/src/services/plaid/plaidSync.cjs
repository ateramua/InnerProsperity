/**
 * Plaid account + transaction sync (main process).
 */
const { v4: uuidv4 } = require('uuid');
const {
  createPlaidClient,
  plaidAmountToAppAmount,
  plaidBalanceToAppBalance,
  mapPlaidTypeToInternal,
  mapInternalAccountTypeCategory,
  getPlaidCategoryKey,
  buildAccountDisplayName,
  accountFingerprint,
  isPlaidTransferTransaction,
} = require('./plaidService.cjs');
const { findManualAccountCandidates } = require('./plaidAccountMatch.cjs');
const { logPlaidSyncRun } = require('./plaidSyncAudit.cjs');
const {
  reapplyPlaidCategoryMapping,
  reapplyAllPlaidCategoryMappings,
} = require('./plaidCategoryMapping.cjs');

async function getCategoryMappings(db, userId) {
  return db.all(
    `SELECT plaid_category, category_id FROM plaid_category_mappings WHERE user_id = ?`,
    [userId]
  );
}

async function assertItemOwnedByUser(db, itemId, userId) {
  const item = await db.get('SELECT * FROM plaid_items WHERE id = ? AND user_id = ?', [
    itemId,
    userId,
  ]);
  if (!item) throw new Error('Item not found or not owned by user');
  return item;
}

/**
 * @param {string} itemId
 * @param {{ getDatabase: Function, decryptToken: Function, updateAccountBalances: Function }} deps
 */
async function syncPlaidAccounts(itemId, deps) {
  const { getDatabase, decryptToken, updateAccountBalances } = deps;
  const db = await getDatabase();
  const item = await db.get('SELECT * FROM plaid_items WHERE id = ?', [itemId]);
  if (!item) throw new Error('Item not found');

  const accessToken = decryptToken(item.access_token);
  if (!accessToken) {
    return { success: false, error: 'TOKEN_DECRYPTION_FAILED', itemId };
  }

  const plaidClient = createPlaidClient();
  let accountsResponse;
  try {
    accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
  } catch (error) {
    const code = error.response?.data?.error_code;
    if (code === 'ITEM_LOGIN_REQUIRED') {
      await db.run(
        `UPDATE plaid_items SET status = 'login_required', last_error = ?, updated_at = datetime('now') WHERE id = ?`,
        [code, itemId]
      );
      return { success: false, error: 'ITEM_LOGIN_REQUIRED', itemId };
    }
    throw error;
  }
  const plaidAccounts = accountsResponse.data.accounts;
  const institutionName = item.institution_name || null;
  const institutionId = item.institution_id || null;
  const mergeOffers = [];

  for (const plaidAccount of plaidAccounts) {
    const fingerprint = accountFingerprint(institutionId, plaidAccount);
    const internalType = mapPlaidTypeToInternal(plaidAccount);
    const category = mapInternalAccountTypeCategory(internalType);
    const rawBalance =
      plaidAccount.balances?.current ?? plaidAccount.balances?.available ?? 0;
    const balance = plaidBalanceToAppBalance(plaidAccount, rawBalance);
    const displayName = buildAccountDisplayName(plaidAccount, institutionName);

    const existingLink = await db.get(
      `SELECT account_id FROM plaid_accounts WHERE plaid_account_id = ?`,
      [plaidAccount.account_id]
    );

    if (existingLink?.account_id) {
      const acctRow = await db.get(
        `SELECT sync_enabled, balance_locked FROM accounts WHERE id = ? AND user_id = ?`,
        [existingLink.account_id, item.user_id]
      );
      const skipBalance =
        acctRow?.sync_enabled === 0 || acctRow?.balance_locked === 1;
      if (skipBalance) {
        await db.run(
          `UPDATE accounts SET
            name = ?, type = ?, account_type_category = ?,
            institution = ?, external_mask = ?, source = 'plaid',
            last_balance_sync_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ? AND user_id = ?`,
          [
            displayName,
            internalType,
            category,
            institutionName || plaidAccount.official_name || null,
            plaidAccount.mask || null,
            existingLink.account_id,
            item.user_id,
          ]
        );
      } else {
        await db.run(
          `UPDATE accounts SET
            name = ?, type = ?, account_type_category = ?, balance = ?,
            cleared_balance = ?, working_balance = ?,
            institution = ?, external_mask = ?, source = 'plaid',
            last_balance_sync_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ? AND user_id = ?`,
          [
            displayName,
            internalType,
            category,
            balance,
            balance,
            balance,
            institutionName || plaidAccount.official_name || null,
            plaidAccount.mask || null,
            existingLink.account_id,
            item.user_id,
          ]
        );
      }
      await db.run(
        `UPDATE plaid_accounts SET
          name = ?, official_name = ?, type = ?, subtype = ?, mask = ?,
          fingerprint = ?, updated_at = datetime('now')
         WHERE plaid_account_id = ?`,
        [
          plaidAccount.name,
          plaidAccount.official_name,
          plaidAccount.type,
          plaidAccount.subtype,
          plaidAccount.mask,
          fingerprint,
          plaidAccount.account_id,
        ]
      );
      if (updateAccountBalances) {
        await updateAccountBalances(existingLink.account_id);
      }
      continue;
    }

    const candidates = await findManualAccountCandidates(db, item.user_id, {
      internalType,
      mask: plaidAccount.mask || null,
      institutionName,
    });

    let internalAccountId = null;
    if (candidates.length === 1) {
      internalAccountId = candidates[0].id;
    } else if (candidates.length > 1) {
      mergeOffers.push({
        plaidAccountId: plaidAccount.account_id,
        plaidDisplayName: displayName,
        mask: plaidAccount.mask,
        type: internalType,
        candidates: candidates.map((c) => ({
          id: c.id,
          name: c.name,
          balance: c.balance,
          institution: c.institution,
        })),
      });
    }

    if (!internalAccountId) {
      internalAccountId = uuidv4();
      await db.run(
        `INSERT INTO accounts (
          id, user_id, name, type, account_type_category, balance, cleared_balance, working_balance,
          currency, institution, external_mask, source, last_balance_sync_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, 'plaid', datetime('now'), datetime('now'), datetime('now'))`,
        [
          internalAccountId,
          item.user_id,
          displayName,
          internalType,
          category,
          balance,
          balance,
          balance,
          institutionName,
          plaidAccount.mask || null,
        ]
      );
    } else {
      const mergeAcct = await db.get(
        `SELECT sync_enabled, balance_locked FROM accounts WHERE id = ?`,
        [internalAccountId]
      );
      const skipBal = mergeAcct?.sync_enabled === 0 || mergeAcct?.balance_locked === 1;
      if (skipBal) {
        await db.run(
          `UPDATE accounts SET
            name = ?, account_type_category = ?,
            institution = ?, external_mask = ?, source = 'plaid', sync_enabled = 1,
            last_balance_sync_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ?`,
          [
            displayName,
            category,
            institutionName,
            plaidAccount.mask || null,
            internalAccountId,
          ]
        );
      } else {
        await db.run(
          `UPDATE accounts SET
            name = ?, account_type_category = ?, balance = ?, cleared_balance = ?, working_balance = ?,
            institution = ?, external_mask = ?, source = 'plaid', sync_enabled = 1,
            last_balance_sync_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ?`,
          [
            displayName,
            category,
            balance,
            balance,
            balance,
            institutionName,
            plaidAccount.mask || null,
            internalAccountId,
          ]
        );
      }
    }

    await db.run(
      `INSERT INTO plaid_accounts (
        plaid_account_id, item_id, account_id, name, official_name, type, subtype, mask, fingerprint, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(plaid_account_id) DO UPDATE SET
        account_id = excluded.account_id,
        item_id = excluded.item_id,
        name = excluded.name,
        official_name = excluded.official_name,
        type = excluded.type,
        subtype = excluded.subtype,
        mask = excluded.mask,
        fingerprint = excluded.fingerprint,
        updated_at = datetime('now')`,
      [
        plaidAccount.account_id,
        itemId,
        internalAccountId,
        plaidAccount.name,
        plaidAccount.official_name,
        plaidAccount.type,
        plaidAccount.subtype,
        plaidAccount.mask,
        fingerprint,
      ]
    );
  }

  await db.run(
    `UPDATE plaid_items SET status = 'active', last_error = NULL, updated_at = datetime('now') WHERE id = ?`,
    [itemId]
  );

  try {
    await syncLiabilitiesForItem(itemId, { getDatabase, decryptToken });
  } catch (liabErr) {
    console.warn('Liabilities sync skipped:', liabErr.message);
  }

  try {
    await syncItemConsentFromPlaid(itemId, { getDatabase, decryptToken });
  } catch (consentErr) {
    console.warn('Consent refresh skipped:', consentErr.message);
  }

  await logPlaidSyncRun(db, {
    userId: item.user_id,
    itemId,
    syncType: 'accounts',
    status: 'ok',
  });

  return { success: true, mergeOffers };
}

/**
 * Enrich credit/loan accounts from Plaid Liabilities product (when enabled).
 */
async function syncLiabilitiesForItem(itemId, deps) {
  const { getDatabase, decryptToken } = deps;
  const db = await getDatabase();
  const item = await db.get('SELECT * FROM plaid_items WHERE id = ?', [itemId]);
  if (!item) return { success: false };

  const accessToken = decryptToken(item.access_token);
  if (!accessToken) return { success: false, error: 'TOKEN_DECRYPTION_FAILED' };

  const plaidClient = createPlaidClient();
  let liabilities;
  try {
    const res = await plaidClient.liabilitiesGet({ access_token: accessToken });
    liabilities = res.data.liabilities;
  } catch (err) {
    const code = err.response?.data?.error_code;
    if (code === 'PRODUCT_NOT_READY' || code === 'INVALID_PRODUCT') {
      return { success: false, skipped: true };
    }
    throw err;
  }

  let updated = 0;

  for (const card of liabilities?.credit || []) {
    const link = await db.get(
      `SELECT account_id FROM plaid_accounts WHERE plaid_account_id = ?`,
      [card.account_id]
    );
    if (!link?.account_id) continue;

    const limit = card.limit ?? card.credit_limit ?? null;
    const apr = card.aprs?.[0]?.apr_percentage ?? card.apr ?? null;
    const minimum = card.minimum_payment_amount ?? card.last_statement_balance ?? null;
    const due = card.next_payment_due_date ?? null;

    await db.run(
      `UPDATE accounts SET
        credit_limit = COALESCE(?, credit_limit),
        limit = COALESCE(?, limit),
        interest_rate = COALESCE(?, interest_rate),
        minimum_payment = COALESCE(?, minimum_payment),
        due_date = COALESCE(?, due_date),
        updated_at = datetime('now')
       WHERE id = ?`,
      [limit, limit, apr, minimum, due, link.account_id]
    );
    updated++;
  }

  for (const loan of liabilities?.mortgage || []) {
    const link = await db.get(
      `SELECT account_id FROM plaid_accounts WHERE plaid_account_id = ?`,
      [loan.account_id]
    );
    if (!link?.account_id) continue;

    const monthly = loan.last_payment_amount ?? loan.next_monthly_payment ?? null;
    const rate = loan.interest_rate?.percentage ?? null;
    const due = loan.next_payment_due_date ?? null;

    await db.run(
      `UPDATE accounts SET
        monthly_payment = COALESCE(?, payment_amount),
        payment_amount = COALESCE(?, payment_amount),
        interest_rate = COALESCE(?, interest_rate),
        next_payment_date = COALESCE(?, next_payment_date),
        updated_at = datetime('now')
       WHERE id = ?`,
      [monthly, monthly, rate, due, link.account_id]
    );
    updated++;
  }

  for (const loan of liabilities?.student || []) {
    const link = await db.get(
      `SELECT account_id FROM plaid_accounts WHERE plaid_account_id = ?`,
      [loan.account_id]
    );
    if (!link?.account_id) continue;

    const monthly = loan.minimum_payment_amount ?? null;
    const rate = loan.interest_rate_percentage ?? null;
    const due = loan.next_payment_due_date ?? null;

    await db.run(
      `UPDATE accounts SET
        monthly_payment = COALESCE(?, payment_amount),
        payment_amount = COALESCE(?, payment_amount),
        interest_rate = COALESCE(?, interest_rate),
        next_payment_date = COALESCE(?, next_payment_date),
        updated_at = datetime('now')
       WHERE id = ?`,
      [monthly, monthly, rate, due, link.account_id]
    );
    updated++;
  }

  return { success: true, updated };
}

async function syncTransactionsForItem(itemId, deps) {
  const { getDatabase, decryptToken, updateAccountBalances } = deps;
  const db = await getDatabase();
  const plaidClient = createPlaidClient();

  const item = await db.get('SELECT * FROM plaid_items WHERE id = ?', [itemId]);
  if (!item) throw new Error('Item not found');

  const accessToken = decryptToken(item.access_token);
  const cursor = item.cursor || null;

  const linkedAccounts = await db.all(
    `SELECT pa.account_id, a.user_id, pa.plaid_account_id
     FROM plaid_accounts pa
     JOIN accounts a ON pa.account_id = a.id
     WHERE pa.item_id = ?`,
    [itemId]
  );

  if (linkedAccounts.length === 0) {
    return { success: false, error: 'No linked accounts found for this item' };
  }

  const userId = linkedAccounts[0]?.user_id;
  if (!userId) return { success: false, error: 'No user found for this item' };

  const existingMappings = await getCategoryMappings(db, userId);

  let added = [];
  let modified = [];
  let removed = [];
  let hasMore = true;
  let nextCursor = cursor;

  while (hasMore) {
    const request = { access_token: accessToken };
    if (nextCursor) request.cursor = nextCursor;
    try {
      const response = await plaidClient.transactionsSync(request);
      added.push(...response.data.added);
      modified.push(...response.data.modified);
      removed.push(...response.data.removed);
      hasMore = response.data.has_more;
      nextCursor = response.data.next_cursor;
    } catch (error) {
      const code = error.response?.data?.error_code;
      if (code === 'ITEM_LOGIN_REQUIRED') {
        await db.run(
          `UPDATE plaid_items SET status = 'login_required', last_error = ?, updated_at = datetime('now') WHERE id = ?`,
          [code, itemId]
        );
        return { success: false, error: 'ITEM_LOGIN_REQUIRED', itemId };
      }
      throw error;
    }
  }

  let transactionsAdded = 0;
  let transactionsModified = 0;
  let transactionsRemoved = 0;
  const updatedAccounts = new Set();
  const unmappedCategories = new Set();

  const insertTransaction = async (plaidTx, accountId, uid, categoryId, categoryKey) => {
    const amount = plaidAmountToAppAmount(plaidTx.amount);
    const isTransfer = isPlaidTransferTransaction(plaidTx) ? 1 : 0;
    await db.run(
      `INSERT INTO transactions (
        account_id, user_id, date, description, amount,
        category_id, payee, memo, is_cleared, is_transfer,
        plaid_transaction_id, plaid_category_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        accountId,
        uid,
        plaidTx.date,
        plaidTx.name,
        amount,
        categoryId,
        plaidTx.merchant_name || null,
        plaidTx.pending ? 'Pending' : null,
        plaidTx.pending ? 0 : 1,
        isTransfer,
        plaidTx.transaction_id,
        categoryKey,
      ]
    );
    updatedAccounts.add(accountId);
  };

  const updateTransaction = async (plaidTx, accountId, uid, categoryId, categoryKey) => {
    const amount = plaidAmountToAppAmount(plaidTx.amount);
    const isTransfer = isPlaidTransferTransaction(plaidTx) ? 1 : 0;
    await db.run(
      `UPDATE transactions SET
        date = ?, description = ?, amount = ?,
        category_id = ?, payee = ?, memo = ?, is_cleared = ?, is_transfer = ?,
        plaid_category_key = ?, updated_at = datetime('now')
       WHERE plaid_transaction_id = ? AND user_id = ?`,
      [
        plaidTx.date,
        plaidTx.name,
        amount,
        categoryId,
        plaidTx.merchant_name || null,
        plaidTx.pending ? 'Pending' : null,
        plaidTx.pending ? 0 : 1,
        isTransfer,
        categoryKey,
        plaidTx.transaction_id,
        uid,
      ]
    );
    updatedAccounts.add(accountId);
  };

  const resolveCategoryId = (plaidTx) => {
    const key = getPlaidCategoryKey(plaidTx);
    if (!key) return { categoryId: null, key: null };
    const mapping = existingMappings.find((m) => m.plaid_category === key);
    if (!mapping) unmappedCategories.add(key);
    return { categoryId: mapping ? mapping.category_id : null, key };
  };

  for (const plaidTx of added) {
    const accountLink = linkedAccounts.find((acc) => acc.plaid_account_id === plaidTx.account_id);
    if (!accountLink) continue;

    const existing = await db.get(
      `SELECT id FROM transactions WHERE plaid_transaction_id = ?`,
      [plaidTx.transaction_id]
    );
    if (existing) continue;

    const { categoryId, key } = resolveCategoryId(plaidTx);
    await insertTransaction(
      plaidTx,
      accountLink.account_id,
      accountLink.user_id,
      categoryId,
      key
    );
    transactionsAdded++;
  }

  for (const plaidTx of modified) {
    const accountLink = linkedAccounts.find((acc) => acc.plaid_account_id === plaidTx.account_id);
    if (!accountLink) continue;
    const { categoryId, key } = resolveCategoryId(plaidTx);
    await updateTransaction(
      plaidTx,
      accountLink.account_id,
      accountLink.user_id,
      categoryId,
      key
    );
    transactionsModified++;
  }

  for (const plaidTx of removed) {
    const existingTx = await db.get(
      `SELECT account_id FROM transactions WHERE plaid_transaction_id = ?`,
      [plaidTx.transaction_id]
    );
    if (existingTx) {
      await db.run(
        `UPDATE transactions SET
          is_deleted = 1,
          memo = COALESCE(memo, '') || CASE WHEN memo IS NULL OR memo = '' THEN '' ELSE ' | ' END || '[Removed by bank sync]',
          updated_at = datetime('now')
         WHERE plaid_transaction_id = ?`,
        [plaidTx.transaction_id]
      );
      updatedAccounts.add(existingTx.account_id);
      transactionsRemoved++;
    }
  }

  if (updateAccountBalances) {
    for (const accountId of updatedAccounts) {
      await updateAccountBalances(accountId);
    }
  }

  await db.run(
    `UPDATE plaid_items SET cursor = ?, last_sync = datetime('now'), status = 'active',
     last_error = NULL, updated_at = datetime('now') WHERE id = ?`,
    [nextCursor, itemId]
  );

  const itemRow = await db.get(`SELECT user_id FROM plaid_items WHERE id = ?`, [itemId]);
  await logPlaidSyncRun(db, {
    userId: itemRow?.user_id,
    itemId,
    syncType: 'transactions',
    status: 'ok',
    transactionsAdded,
    transactionsModified,
    transactionsRemoved,
  });

  return {
    success: true,
    transactionsAdded,
    transactionsModified,
    transactionsRemoved,
    unmappedCategories: Array.from(unmappedCategories),
  };
}

async function removePlaidItem(itemId, userId, deps, options = {}) {
  const { getDatabase, decryptToken } = deps;
  const {
    deleteImportedTransactions = false,
    deactivateAccounts = true,
  } = options;
  const db = await getDatabase();
  const item = await assertItemOwnedByUser(db, itemId, userId);

  try {
    const accessToken = decryptToken(item.access_token);
    if (accessToken) {
      const plaidClient = createPlaidClient();
      await plaidClient.itemRemove({ access_token: accessToken });
    }
  } catch (err) {
    console.warn('Plaid itemRemove failed (continuing local cleanup):', err.message);
  }

  const links = await db.all(
    `SELECT account_id, plaid_account_id FROM plaid_accounts WHERE item_id = ?`,
    [itemId]
  );
  const accountIds = links.map((l) => l.account_id).filter(Boolean);

  await db.exec('BEGIN');
  try {
    if (deleteImportedTransactions && accountIds.length) {
      const acctPh = accountIds.map(() => '?').join(',');
      const importedRows = await db.all(
        `SELECT id FROM transactions
         WHERE user_id = ? AND plaid_transaction_id IS NOT NULL AND account_id IN (${acctPh})`,
        [userId, ...accountIds]
      );
      const importedIds = importedRows.map((r) => r.id);
      if (importedIds.length) {
        const idPh = importedIds.map(() => '?').join(',');
        await db.run(
          `UPDATE transactions SET linked_transaction_id = NULL, transfer_group_id = NULL,
           transfer_account_id = NULL, counterparty_account_id = NULL, updated_at = datetime('now')
           WHERE linked_transaction_id IN (${idPh}) AND id NOT IN (${idPh})`,
          [...importedIds, ...importedIds]
        );
        await db.run(
          `DELETE FROM reconciliation_entries WHERE transaction_id IN (${idPh})`,
          importedIds
        );
        await db.run(
          `DELETE FROM credit_card_payments WHERE transaction_id IN (${idPh})`,
          importedIds
        );
        const goalTable = await db.get(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='goal_contributions'`
        );
        if (goalTable) {
          await db.run(
            `DELETE FROM goal_contributions WHERE transaction_id IN (${idPh})`,
            importedIds
          );
        }
        await db.run(
          `UPDATE transactions SET is_deleted = 1, updated_at = datetime('now')
           WHERE id IN (${idPh})`,
          importedIds
        );
      }
    }

    // plaid_sync_runs.item_id FK — clear audit rows before removing the item.
    const syncRunsTable = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='plaid_sync_runs'`
    );
    if (syncRunsTable) {
      await db.run('DELETE FROM plaid_sync_runs WHERE item_id = ?', [itemId]);
    }

    await db.run('DELETE FROM plaid_accounts WHERE item_id = ?', [itemId]);
    await db.run('DELETE FROM plaid_items WHERE id = ?', [itemId]);

    for (const accountId of accountIds) {
      if (deactivateAccounts) {
        await db.run(
          `UPDATE accounts SET is_active = 0, source = 'manual', sync_enabled = 0,
           updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
          [accountId, userId]
        );
      } else {
        await db.run(
          `UPDATE accounts SET source = 'manual', sync_enabled = 0, updated_at = datetime('now')
           WHERE id = ? AND user_id = ?`,
          [accountId, userId]
        );
      }
    }

    await db.exec('COMMIT');

    await logPlaidSyncRun(db, {
      userId,
      itemId: null,
      syncType: 'disconnect',
      status: 'ok',
    });
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }

  return { success: true, deactivatedAccountIds: deactivateAccounts ? accountIds : [] };
}

/**
 * Sync all linked items for the current user (accounts + transactions).
 */
async function syncAllPlaidItems(deps, { userId, getLinkedItems }) {
  const items = await getLinkedItems();
  const results = [];
  for (const item of items) {
    try {
      const accountResult = await syncPlaidAccounts(item.id, deps);
      if (!accountResult.success) {
        results.push({ itemId: item.id, success: false, error: accountResult.error });
        continue;
      }
      const txResult = await syncTransactionsForItem(item.id, deps);
      results.push({
        itemId: item.id,
        success: txResult.success,
        ...txResult,
        mergeOffers: accountResult.mergeOffers,
      });
    } catch (err) {
      results.push({ itemId: item.id, success: false, error: err.message });
    }
  }
  return { success: true, results };
}

/**
 * Detach one internal account from Plaid without removing the whole Item.
 */
async function unlinkPlaidAccount(accountId, userId, deps) {
  const { getDatabase } = deps;
  const db = await getDatabase();
  const account = await db.get(
    `SELECT id, source FROM accounts WHERE id = ? AND user_id = ?`,
    [accountId, userId]
  );
  if (!account) throw new Error('Account not found');

  const link = await db.get(
    `SELECT pa.plaid_account_id, pa.item_id
     FROM plaid_accounts pa
     JOIN plaid_items pi ON pa.item_id = pi.id
     WHERE pa.account_id = ? AND pi.user_id = ?`,
    [accountId, userId]
  );
  if (!link) throw new Error('Account is not linked to Plaid');

  await db.run('DELETE FROM plaid_accounts WHERE account_id = ?', [accountId]);
  await db.run(
    `UPDATE accounts SET source = 'manual', sync_enabled = 0, last_balance_sync_at = NULL,
     updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
    [accountId, userId]
  );

  return { success: true, itemId: link.item_id };
}

/**
 * Poll optional webhook relay for pending sync flags (Phase 4).
 * Relay should expose GET {PLAID_WEBHOOK_RELAY_URL}/pending?userId=
 * → { items: [{ itemId, syncRequired }] }
 */
async function pollPlaidWebhookRelay(userId, onSyncItem, deps = {}) {
  const baseUrl = process.env.PLAID_WEBHOOK_RELAY_URL;
  if (!baseUrl || typeof onSyncItem !== 'function') return { polled: false, synced: [] };

  const relayBase = baseUrl.replace(/\/$/, '');
  const url = `${relayBase}/pending?userId=${encodeURIComponent(userId)}`;
  const headers = {};
  if (process.env.PLAID_WEBHOOK_RELAY_API_KEY) {
    headers.Authorization = `Bearer ${process.env.PLAID_WEBHOOK_RELAY_API_KEY}`;
  }

  let data;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return { polled: true, synced: [], error: `HTTP ${res.status}` };
    data = await res.json();
  } catch (err) {
    return { polled: true, synced: [], error: err.message };
  }

  const synced = [];
  const acknowledgedEventIds = [];
  for (const entry of data?.items || []) {
    if (!entry?.itemId) continue;
    try {
      if (entry.webhookCode === 'PENDING_EXPIRATION' && deps?.handlePendingExpiration) {
        await deps.handlePendingExpiration(entry.itemId, userId);
        synced.push(entry.itemId);
        if (entry.eventId) acknowledgedEventIds.push(entry.eventId);
        continue;
      }
      if (!entry.syncRequired) {
        if (entry.eventId) acknowledgedEventIds.push(entry.eventId);
        continue;
      }
      await onSyncItem(entry.itemId, userId);
      synced.push(entry.itemId);
      if (entry.eventId) acknowledgedEventIds.push(entry.eventId);
    } catch (err) {
      console.warn('Webhook relay sync skipped for item', entry.itemId, err.message);
    }
  }

  if (acknowledgedEventIds.length) {
    try {
      await fetch(`${relayBase}/pending/ack`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ eventIds: acknowledgedEventIds }),
      });
    } catch (err) {
      console.warn('Webhook relay ack failed:', err.message);
    }
  }
  return { polled: true, synced };
}

/** Refresh consent_expires_at from Plaid itemGet (PENDING_EXPIRATION UX). */
async function syncItemConsentFromPlaid(itemId, deps) {
  const { getDatabase, decryptToken } = deps;
  const db = await getDatabase();
  const item = await db.get(`SELECT access_token FROM plaid_items WHERE id = ?`, [itemId]);
  if (!item?.access_token) return;
  const plaidClient = createPlaidClient();
  const accessToken = decryptToken(item.access_token);
  if (!accessToken) return;
  const response = await plaidClient.itemGet({ access_token: accessToken });
  const exp = response.data?.item?.consent_expiration_time;
  if (exp) {
    await db.run(
      `UPDATE plaid_items SET consent_expires_at = ?, updated_at = datetime('now') WHERE id = ?`,
      [exp, itemId]
    );
  }
}

/**
 * Mark item when relay reports PENDING_EXPIRATION (user must reconnect before expiry).
 */
async function handlePendingExpiration(itemId, userId, deps) {
  const { getDatabase } = deps;
  const db = await getDatabase();
  await assertItemOwnedByUser(db, itemId, userId);
  await db.run(
    `UPDATE plaid_items SET status = 'consent_expiring', last_error = 'PENDING_EXPIRATION',
     updated_at = datetime('now') WHERE id = ?`,
    [itemId]
  );
  try {
    await syncItemConsentFromPlaid(itemId, deps);
  } catch (_) {
    /* optional */
  }
  return { success: true, itemId };
}

async function logSyncError(db, itemId, syncType, errorMessage) {
  try {
    const item = await db.get(`SELECT user_id FROM plaid_items WHERE id = ?`, [itemId]);
    await logPlaidSyncRun(db, {
      userId: item?.user_id,
      itemId,
      syncType,
      status: 'error',
      errorMessage: errorMessage || 'unknown',
    });
  } catch (_) {
    /* ignore audit failures */
  }
}

module.exports = {
  syncPlaidAccounts,
  syncTransactionsForItem,
  syncLiabilitiesForItem,
  syncItemConsentFromPlaid,
  handlePendingExpiration,
  removePlaidItem,
  unlinkPlaidAccount,
  syncAllPlaidItems,
  assertItemOwnedByUser,
  getCategoryMappings,
  reapplyPlaidCategoryMapping,
  reapplyAllPlaidCategoryMappings,
  logSyncError,
  pollPlaidWebhookRelay,
};
