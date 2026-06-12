/**
 * Unified duplicate-account resolution for Plaid imports.
 * Actions: merge | replace | keep_both | ignore | ignore_temporarily | keep_off_budget
 */

const { v4: uuidv4 } = require('uuid');
const accountMergeService = require('./accountMergeService.cjs');
const importedCashReconciliationService = require('../budget/importedCashReconciliationService.cjs');

const VALID_ACTIONS = new Set([
  'merge',
  'replace',
  'keep_both',
  'ignore',
  'ignore_temporarily',
  'keep_off_budget',
]);

async function recordResolutionEvent(db, userId, eventType, payload = {}) {
  await db.run(
    `INSERT INTO budget_reconciliation_events (id, user_id, event_type, payload_json)
     VALUES (?, ?, ?, ?)`,
    [uuidv4(), userId, eventType, JSON.stringify(payload)]
  );
}

async function dismissPlaidAccount(db, userId, plaidAccountId, { temporaryDays = null, reason = null } = {}) {
  const expiresAt =
    temporaryDays && Number(temporaryDays) > 0
      ? new Date(Date.now() + Number(temporaryDays) * 86400000).toISOString()
      : null;
  await db.run(
    `INSERT INTO plaid_account_dismissals (plaid_account_id, user_id, dismissed_at, expires_at, reason)
     VALUES (?, ?, datetime('now'), ?, ?)
     ON CONFLICT(plaid_account_id, user_id) DO UPDATE SET
       dismissed_at = datetime('now'),
       expires_at = excluded.expires_at,
       reason = excluded.reason`,
    [plaidAccountId, userId, expiresAt, reason]
  );
}

async function markAccountOffBudget(db, userId, accountId, duplicateOfAccountId = null) {
  await db.run(
    `UPDATE accounts
     SET budget_inclusion_status = 'off_budget',
         on_budget = 0,
         account_type_category = 'tracking',
         duplicate_of_account_id = COALESCE(?, duplicate_of_account_id),
         onboarding_complete = 1,
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [duplicateOfAccountId, accountId, userId]
  );
}

async function activatePlaidStagingAccount(db, userId, plaidAccountId) {
  const link = await db.get(
    `SELECT pa.account_id
     FROM plaid_accounts pa
     JOIN plaid_items pi ON pa.item_id = pi.id
     WHERE pa.plaid_account_id = ? AND pi.user_id = ?`,
    [plaidAccountId, userId]
  );
  if (!link?.account_id) throw new Error('Plaid account not found');
  await db.run(
    `UPDATE accounts
     SET account_status = 'active', is_active = 1, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [link.account_id, userId]
  );
  return link.account_id;
}

/**
 * Replace manual account: Plaid-linked account becomes primary; manual is archived.
 */
async function replaceManualWithPlaid(db, userId, plaidAccountId, manualAccountId, deps = {}) {
  const link = await db.get(
    `SELECT pa.account_id
     FROM plaid_accounts pa
     JOIN plaid_items pi ON pa.item_id = pi.id
     WHERE pa.plaid_account_id = ? AND pi.user_id = ?`,
    [plaidAccountId, userId]
  );
  if (!link?.account_id) throw new Error('Plaid account not found');

  const plaidAccountIdInternal = link.account_id;
  if (String(plaidAccountIdInternal) === String(manualAccountId)) {
    return { action: 'replace', accountId: plaidAccountIdInternal, skipped: true };
  }

  await db.exec('BEGIN');
  try {
    await accountMergeService.migrateAccountReferences(
      db,
      manualAccountId,
      plaidAccountIdInternal,
      userId
    );
    await db.run(
      `UPDATE accounts
       SET is_active = 0,
           account_status = 'archived',
           duplicate_of_account_id = ?,
           merged_into_account_id = ?,
           merged_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [plaidAccountIdInternal, plaidAccountIdInternal, manualAccountId, userId]
    );
    await db.run(
      `UPDATE plaid_accounts SET account_id = ?, updated_at = datetime('now')
       WHERE plaid_account_id = ?`,
      [plaidAccountIdInternal, plaidAccountId]
    );
    await db.run(
      `UPDATE accounts
       SET account_status = 'active', is_active = 1, source = 'plaid', updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [plaidAccountIdInternal, userId]
    );
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }

  if (deps.processImportedCashOnboarding) {
    const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [
      plaidAccountIdInternal,
      userId,
    ]);
    const bal = Math.max(0, Number(account?.working_balance ?? account?.balance) || 0);
    await deps.processImportedCashOnboarding(db, userId, [
      { accountId: plaidAccountIdInternal, priorBalance: 0, importedBalance: bal },
    ]);
  }

  return { action: 'replace', accountId: plaidAccountIdInternal, replacedAccountId: manualAccountId };
}

/**
 * @param {object} opts
 * @param {string} opts.action
 * @param {string} opts.plaidAccountId
 * @param {string} [opts.targetAccountId] - manual account for merge/replace
 * @param {number} [opts.temporaryDays=7]
 */
async function resolveAccountDuplicate(db, userId, opts = {}, deps = {}) {
  const action = String(opts.action || '').toLowerCase();
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`Invalid duplicate resolution action: ${action}`);
  }
  const plaidAccountId = opts.plaidAccountId;
  if (!plaidAccountId) throw new Error('plaidAccountId is required');

  let result;
  switch (action) {
    case 'merge': {
      if (!opts.targetAccountId) throw new Error('targetAccountId required for merge');
      result = await accountMergeService.executePlaidToManualMerge(
        db,
        userId,
        plaidAccountId,
        opts.targetAccountId,
        deps
      );
      break;
    }
    case 'replace': {
      if (!opts.targetAccountId) throw new Error('targetAccountId required for replace');
      result = await replaceManualWithPlaid(db, userId, plaidAccountId, opts.targetAccountId, deps);
      break;
    }
    case 'keep_both': {
      const accountId = await activatePlaidStagingAccount(db, userId, plaidAccountId);
      if (deps.processImportedCashOnboarding) {
        const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [
          accountId,
          userId,
        ]);
        const bal = Math.max(0, Number(account?.working_balance ?? account?.balance) || 0);
        await deps.processImportedCashOnboarding(db, userId, [
          { accountId, priorBalance: 0, importedBalance: bal },
        ]);
      }
      result = { action: 'keep_both', accountId };
      break;
    }
    case 'ignore': {
      await dismissPlaidAccount(db, userId, plaidAccountId, {
        reason: opts.reason || 'user_ignored_duplicate',
      });
      const link = await db.get(
        `SELECT pa.account_id FROM plaid_accounts pa
         JOIN plaid_items pi ON pa.item_id = pi.id
         WHERE pa.plaid_account_id = ? AND pi.user_id = ?`,
        [plaidAccountId, userId]
      );
      if (link?.account_id) {
        await db.run(
          `UPDATE accounts SET is_active = 0, account_status = 'archived', updated_at = datetime('now')
           WHERE id = ? AND user_id = ?`,
          [link.account_id, userId]
        );
      }
      result = { action: 'ignore', plaidAccountId };
      break;
    }
    case 'ignore_temporarily': {
      await dismissPlaidAccount(db, userId, plaidAccountId, {
        temporaryDays: opts.temporaryDays || 7,
        reason: opts.reason || 'user_snoozed_duplicate',
      });
      result = { action: 'ignore_temporarily', plaidAccountId, days: opts.temporaryDays || 7 };
      break;
    }
    case 'keep_off_budget': {
      const accountId = await activatePlaidStagingAccount(db, userId, plaidAccountId);
      await markAccountOffBudget(db, userId, accountId, opts.targetAccountId || null);
      result = { action: 'keep_off_budget', accountId };
      break;
    }
    default:
      throw new Error(`Unhandled action: ${action}`);
  }

  await recordResolutionEvent(db, userId, `duplicate:${action}`, {
    plaidAccountId,
    targetAccountId: opts.targetAccountId || null,
    result,
  });

  return { success: true, ...result };
}

module.exports = {
  VALID_ACTIONS,
  resolveAccountDuplicate,
  dismissPlaidAccount,
  markAccountOffBudget,
  replaceManualWithPlaid,
  recordResolutionEvent,
};
