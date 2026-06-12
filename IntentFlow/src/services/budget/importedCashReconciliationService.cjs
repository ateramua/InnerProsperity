/**
 * Imported Cash Reconciliation Engine — converts external account balances into
 * budget-recognized RTA via synthetic OPENING_BALANCE ledger events.
 *
 * Plaid balance refreshes never mutate RTA directly; onboarding creates inflows.
 */

const { v4: uuidv4 } = require('uuid');
const { roundMoney } = require('../../shared/readyToAssignEngine.cjs');
const { isOnBudgetCashAccount } = require('../../utils/cashAccountUtils.cjs');
const budgetIntegrityService = require('../budget/budgetIntegrityService.cjs');
const readyToAssignPoolService = require('../budget/readyToAssignPoolService.cjs');

const OPENING_BALANCE_TYPE = 'OPENING_BALANCE';
const HEALTH_THRESHOLDS = Object.freeze({
  HEALTHY: 0.01,
  WARNING: 10,
  ERROR: 1000,
});

function classifyHealthStatus(identityDelta) {
  const delta = Math.abs(roundMoney(Number(identityDelta) || 0));
  if (delta < HEALTH_THRESHOLDS.HEALTHY) return 'healthy';
  if (delta <= HEALTH_THRESHOLDS.WARNING) return 'warning';
  if (delta <= HEALTH_THRESHOLDS.ERROR) return 'error';
  return 'critical';
}

function computeUnallocatedImportedCash(identityDelta) {
  const delta = roundMoney(Number(identityDelta) || 0);
  return delta > HEALTH_THRESHOLDS.HEALTHY ? delta : 0;
}

function normalizeAssetBalance(account) {
  if (!account) return 0;
  const wb = account.working_balance;
  const bal = wb != null && Number.isFinite(Number(wb)) ? Number(wb) : Number(account.balance) || 0;
  return roundMoney(Math.max(0, bal));
}

/**
 * Net-new on-budget cash for a single account onboarding.
 */
function computeNetNewCashForAccount(importedBalance, priorMappedBalance = 0) {
  const imported = roundMoney(Math.max(0, Number(importedBalance) || 0));
  const prior = roundMoney(Math.max(0, Number(priorMappedBalance) || 0));
  return roundMoney(Math.max(0, imported - prior));
}

async function recordIdentitySnapshot(db, userId, opts = {}) {
  const identity = await budgetIntegrityService.evaluateBudgetIdentity(db, userId, opts);
  const unallocated = computeUnallocatedImportedCash(identity.budgetInvariantDelta);
  const health = classifyHealthStatus(identity.budgetInvariantDelta);
  const monthlyBudgetService = require('../budget/monthlyBudgetService.cjs');
  const { rows } = await monthlyBudgetService.getGlobalAssignmentTotals(db, userId);
  const assignedTotal = roundMoney(
    (rows || []).reduce((sum, row) => sum + (Number(row.budgeted_amount) || 0), 0)
  );
  const id = uuidv4();
  await db.run(
    `INSERT INTO budget_identity_snapshots (
      id, user_id, on_budget_cash, rta, assigned_total, category_available_total,
      identity_delta, unallocated_imported_cash, health_status, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      identity.onBudgetCash,
      identity.readyToAssign,
      assignedTotal,
      identity.categoryTotal,
      identity.budgetInvariantDelta,
      unallocated,
      health,
      opts.source || 'imported_cash_reconciliation',
    ]
  );
  return { id, ...identity, unallocatedImportedCash: unallocated, healthStatus: health };
}

function computeOverAssignedGap(identityDelta) {
  const delta = roundMoney(Number(identityDelta) || 0);
  return delta < -HEALTH_THRESHOLDS.HEALTHY ? roundMoney(Math.abs(delta)) : 0;
}

async function isIntegrityWarningSuppressed(db, userId) {
  const row = await db.get(
    `SELECT id FROM budget_integrity_suppressions
     WHERE user_id = ?
       AND scope = 'global'
       AND (suppressed_until IS NULL OR datetime(suppressed_until) > datetime('now'))
     LIMIT 1`,
    [userId]
  );
  return Boolean(row?.id);
}

async function suppressIntegrityWarning(db, userId, opts = {}) {
  const id = uuidv4();
  const days = Number(opts.days) || 0;
  const suppressedUntil =
    days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
  await db.run(
    `INSERT INTO budget_integrity_suppressions (id, user_id, scope, account_id, reason, suppressed_until)
     VALUES (?, ?, 'global', NULL, ?, ?)`,
    [id, userId, opts.reason || 'user_dismissed_banner', suppressedUntil]
  );
  await recordTelemetryEvent(db, userId, 'integrity_warning_suppressed', { days, id });
  return { id, suppressedUntil };
}

async function recordTelemetryEvent(db, userId, eventType, payload = {}) {
  await db.run(
    `INSERT INTO budget_reconciliation_events (id, user_id, event_type, payload_json)
     VALUES (?, ?, ?, ?)`,
    [uuidv4(), userId, eventType, JSON.stringify(payload)]
  );
}

async function listIdentitySnapshots(db, userId, limit = 20) {
  return db.all(
    `SELECT * FROM budget_identity_snapshots
     WHERE user_id = ?
     ORDER BY datetime(recorded_at) DESC
     LIMIT ?`,
    [userId, limit]
  );
}

async function listOnboardingSnapshots(db, userId, limit = 20) {
  return db.all(
    `SELECT * FROM budget_onboarding_snapshots
     WHERE user_id = ?
     ORDER BY datetime(recorded_at) DESC
     LIMIT ?`,
    [userId, limit]
  );
}

async function listReconciliationEvents(db, userId, limit = 50) {
  return db.all(
    `SELECT id, event_type, payload_json, recorded_at
     FROM budget_reconciliation_events
     WHERE user_id = ?
     ORDER BY datetime(recorded_at) DESC
     LIMIT ?`,
    [userId, limit]
  );
}

async function getIdentityDiagnostics(db, userId, opts = {}) {
  const status = await getIdentityStatus(db, userId, opts);
  const analysis = await analyzeImportedCashMigration(db, userId, opts);
  const snapshots = await listIdentitySnapshots(db, userId, 10);
  const onboardingSnapshots = await listOnboardingSnapshots(db, userId, 10);
  const events = await listReconciliationEvents(db, userId, 25);
  const pendingDuplicates = await db.all(
    `SELECT a.id, a.name, a.type, a.balance, a.working_balance, a.account_status,
            pa.plaid_account_id, pa.mask
     FROM accounts a
     JOIN plaid_accounts pa ON pa.account_id = a.id
     WHERE a.user_id = ?
       AND IFNULL(a.account_status, 'active') = 'pending_merge'`,
    [userId]
  );
  return {
    status,
    analysis,
    snapshots,
    onboardingSnapshots,
    events,
    pendingDuplicates,
    suppressed: status.warningSuppressed,
  };
}

async function ensureLegacyPlaidOnboardingMarkers(db, userId) {
  await db.run(
    `UPDATE accounts
     SET onboarding_complete = 0, updated_at = datetime('now')
     WHERE user_id = ?
       AND IFNULL(source, '') = 'plaid'
       AND IFNULL(onboarding_complete, 0) = 1
       AND IFNULL(budget_inclusion_status, 'on_budget') = 'on_budget'
       AND LOWER(IFNULL(type, '')) IN ('checking', 'savings')
       AND imported_opening_balance_transaction_id IS NULL
       AND id NOT IN (
         SELECT account_id FROM transactions
         WHERE user_id = ?
           AND transaction_type = 'OPENING_BALANCE'
           AND IFNULL(is_deleted, 0) = 0
       )`,
    [userId, userId]
  );
}

async function getIdentityStatus(db, userId, opts = {}) {
  await ensureLegacyPlaidOnboardingMarkers(db, userId);
  const identity = await budgetIntegrityService.evaluateBudgetIdentity(db, userId, opts);
  const unallocatedImportedCash = computeUnallocatedImportedCash(identity.budgetInvariantDelta);
  const overAssignedGap = computeOverAssignedGap(identity.budgetInvariantDelta);
  const healthStatus = classifyHealthStatus(identity.budgetInvariantDelta);
  const warningSuppressed = await isIntegrityWarningSuppressed(db, userId);
  const monthlyBudgetService = require('../budget/monthlyBudgetService.cjs');
  const { rows } = await monthlyBudgetService.getGlobalAssignmentTotals(db, userId);
  const totalAssigned = roundMoney(
    (rows || []).reduce((sum, row) => sum + (Number(row.budgeted_amount) || 0), 0)
  );

  const needsOrphanRepair = unallocatedImportedCash > HEALTH_THRESHOLDS.WARNING;
  const needsOverAssignmentRepair = overAssignedGap > HEALTH_THRESHOLDS.WARNING;

  return {
    ...identity,
    totalAssigned,
    unallocatedImportedCash,
    overAssignedGap,
    healthStatus,
    warningSuppressed,
    needsOrphanRepair,
    needsOverAssignmentRepair,
    needsReconciliation:
      !warningSuppressed && (needsOrphanRepair || needsOverAssignmentRepair),
    identityIssueType: needsOrphanRepair
      ? 'orphaned_imported_cash'
      : needsOverAssignmentRepair
        ? 'over_assigned'
        : null,
    thresholds: HEALTH_THRESHOLDS,
  };
}

async function hasOpeningBalanceForAccount(db, accountId, userId) {
  const row = await db.get(
    `SELECT id FROM transactions
     WHERE account_id = ? AND user_id = ?
       AND (
         transaction_type = ?
         OR (
           IFNULL(is_system, 0) = 1
           AND (LOWER(payee) = 'starting balance' OR LOWER(description) = 'starting balance')
         )
       )
       AND (is_deleted IS NULL OR is_deleted = 0)
     LIMIT 1`,
    [accountId, userId, OPENING_BALANCE_TYPE]
  );
  return Boolean(row?.id);
}

/**
 * Create synthetic OPENING_BALANCE inflow credited to Ready to Assign.
 */
async function createOpeningBalanceInflow(db, userId, accountId, amount, opts = {}) {
  const inflowAmount = roundMoney(Math.abs(Number(amount) || 0));
  if (inflowAmount < 0.005) return { skipped: true, reason: 'zero_amount' };

  const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [
    accountId,
    userId,
  ]);
  if (!account || !isOnBudgetCashAccount(account)) {
    return { skipped: true, reason: 'not_on_budget_cash' };
  }

  if (!opts.force && (await hasOpeningBalanceForAccount(db, accountId, userId))) {
    return { skipped: true, reason: 'already_exists' };
  }

  const date = opts.effectiveDate || new Date().toISOString().slice(0, 10);
  const snapshotId = opts.onboardingSnapshotId || null;

  const insert = await db.run(
    `INSERT INTO transactions (
      account_id, user_id, date, description, amount, direction,
      payee, memo, category_id, is_cleared, is_system, is_reconciled, is_adjustment,
      transaction_type, affects_rta, synthetic, reconciliation_generated,
      onboarding_event, imported_cash_event, onboarding_snapshot_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'inflow', ?, ?, NULL, 1, 1, 1, 0,
      ?, 1, 1, ?, 1, 1, ?, datetime('now'), datetime('now'))`,
    [
      accountId,
      userId,
      date,
      'Starting Balance',
      inflowAmount,
      'Starting Balance',
      opts.memo || 'Imported cash opening balance (Plaid link)',
      OPENING_BALANCE_TYPE,
      opts.reconciliationGenerated ? 1 : 0,
      snapshotId,
    ]
  );

  const txId = insert.lastID;
  const tx = await db.get('SELECT * FROM transactions WHERE id = ?', [txId]);
  await readyToAssignPoolService.syncPoolForTransaction(db, userId, tx, 'apply');

  await db.run(
    `UPDATE accounts
     SET onboarding_complete = 1,
         imported_opening_balance_transaction_id = ?,
         onboarding_snapshot_id = COALESCE(?, onboarding_snapshot_id),
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [txId, snapshotId, accountId, userId]
  );

  return {
    skipped: false,
    transactionId: txId,
    amount: inflowAmount,
    readyToAssign: await readyToAssignPoolService.getPoolBalance(db, userId),
  };
}

async function createOnboardingSnapshot(db, userId, { itemId = null, netNewCash = 0, openingTotal = 0 } = {}) {
  const id = uuidv4();
  await db.run(
    `INSERT INTO budget_onboarding_snapshots (
      id, user_id, item_id, net_new_cash, opening_balance_total, notes
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, itemId, roundMoney(netNewCash), roundMoney(openingTotal), null]
  );
  return id;
}

/**
 * Process accounts linked during a Plaid account sync (onboarding only — not daily refresh).
 * @param {Array<{ accountId: string, priorBalance?: number, importedBalance: number, skip?: boolean }>} candidates
 */
async function processImportedCashOnboarding(db, userId, candidates = [], opts = {}) {
  const eligible = (candidates || []).filter((c) => c?.accountId && !c.skip);
  if (!eligible.length) {
    return { processed: 0, openings: [], snapshotId: null };
  }

  const snapshotId = await createOnboardingSnapshot(db, userId, {
    itemId: opts.itemId || null,
    netNewCash: 0,
    openingTotal: 0,
  });

  const openings = [];
  let netNewTotal = 0;
  let openingTotal = 0;

  for (const candidate of eligible) {
    const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [
      candidate.accountId,
      userId,
    ]);
    if (!account) continue;
    if (account.onboarding_complete === 1 || account.onboarding_complete === true) continue;
    if (!isOnBudgetCashAccount(account)) {
      await db.run(
        `UPDATE accounts SET onboarding_complete = 1, updated_at = datetime('now') WHERE id = ?`,
        [candidate.accountId]
      );
      continue;
    }

    const netNew = computeNetNewCashForAccount(
      candidate.importedBalance,
      candidate.priorBalance
    );
    netNewTotal = roundMoney(netNewTotal + netNew);
    if (netNew < 0.005) {
      await db.run(
        `UPDATE accounts SET onboarding_complete = 1, onboarding_snapshot_id = ?, updated_at = datetime('now') WHERE id = ?`,
        [snapshotId, candidate.accountId]
      );
      continue;
    }

    const result = await createOpeningBalanceInflow(db, userId, candidate.accountId, netNew, {
      onboardingSnapshotId: snapshotId,
      memo: 'Opening balance from linked bank account',
      reconciliationGenerated: false,
    });
    if (!result.skipped) {
      openings.push({ accountId: candidate.accountId, ...result });
      openingTotal = roundMoney(openingTotal + result.amount);
    }
  }

  await db.run(
    `UPDATE budget_onboarding_snapshots
     SET net_new_cash = ?, opening_balance_total = ?
     WHERE id = ?`,
    [netNewTotal, openingTotal, snapshotId]
  );

  const snapshot = await recordIdentitySnapshot(db, userId, {
    monthKey: opts.monthKey,
    source: 'plaid_onboarding',
  });

  await recordTelemetryEvent(db, userId, 'plaid_onboarding_complete', {
    processed: openings.length,
    netNewCash: netNewTotal,
    openingTotal,
    snapshotId,
  });

  return {
    processed: openings.length,
    openings,
    snapshotId,
    netNewCash: netNewTotal,
    openingTotal,
    identity: snapshot,
  };
}

/**
 * Analyze orphaned imported cash for existing users (migration preview).
 */
async function analyzeImportedCashMigration(db, userId, opts = {}) {
  const status = await getIdentityStatus(db, userId, opts);
  const accountsNeedingOnboarding = await db.all(
    `SELECT id, name, type, balance, working_balance, source, onboarding_complete
     FROM accounts
     WHERE user_id = ?
       AND IFNULL(is_active, 1) = 1
       AND IFNULL(account_status, 'active') = 'active'
       AND IFNULL(onboarding_complete, 0) = 0
       AND LOWER(type) IN ('checking', 'savings')
       AND IFNULL(budget_inclusion_status, 'on_budget') = 'on_budget'`,
    [userId]
  );

  const proposals = [];
  for (const account of accountsNeedingOnboarding) {
    if (!isOnBudgetCashAccount(account)) continue;
    const bal = normalizeAssetBalance(account);
    if (bal < 0.005) continue;
    const hasOpening = await hasOpeningBalanceForAccount(db, account.id, userId);
    if (hasOpening) continue;
    proposals.push({
      accountId: account.id,
      accountName: account.name,
      proposedOpeningBalance: bal,
      source: account.source || 'manual',
    });
  }

  return {
    ...status,
    proposals,
    proposedTotalOpening: roundMoney(
      proposals.reduce((sum, p) => sum + p.proposedOpeningBalance, 0)
    ),
    canAutoRepair:
      status.unallocatedImportedCash > HEALTH_THRESHOLDS.WARNING && proposals.length > 0,
  };
}

/**
 * User-approved repair: create opening balances for pending accounts / orphaned cash.
 */
async function applyImportedCashReconciliation(db, userId, opts = {}) {
  const analysis = await analyzeImportedCashMigration(db, userId, opts);
  const snapshotId = await createOnboardingSnapshot(db, userId, {
    netNewCash: analysis.unallocatedImportedCash,
    openingTotal: 0,
    notes: opts.approvedByUser ? 'user_approved_migration' : 'system_repair',
  });

  const openings = [];
  const accountIds = opts.accountIds || analysis.proposals.map((p) => p.accountId);

  if (accountIds.length && analysis.proposals.length) {
    for (const proposal of analysis.proposals) {
      if (!accountIds.includes(proposal.accountId)) continue;
      const result = await createOpeningBalanceInflow(
        db,
        userId,
        proposal.accountId,
        proposal.proposedOpeningBalance,
        {
          onboardingSnapshotId: snapshotId,
          memo: 'Imported cash reconciliation (user approved)',
          reconciliationGenerated: true,
          force: opts.force === true,
        }
      );
      if (!result.skipped) openings.push(result);
    }
  } else if (analysis.unallocatedImportedCash > HEALTH_THRESHOLDS.WARNING) {
    const target = await db.get(
      `SELECT id FROM accounts
       WHERE user_id = ?
         AND IFNULL(is_active, 1) = 1
         AND LOWER(type) IN ('checking', 'savings')
         AND IFNULL(budget_inclusion_status, 'on_budget') = 'on_budget'
       ORDER BY ABS(COALESCE(working_balance, balance, 0)) DESC
       LIMIT 1`,
      [userId]
    );
    if (target?.id) {
      const result = await createOpeningBalanceInflow(
        db,
        userId,
        target.id,
        analysis.unallocatedImportedCash,
        {
          onboardingSnapshotId: snapshotId,
          memo: 'Consolidated imported cash reconciliation',
          reconciliationGenerated: true,
          force: true,
        }
      );
      if (!result.skipped) openings.push(result);
    }
  }

  await db.run(
    `UPDATE budget_onboarding_snapshots
     SET opening_balance_total = ?
     WHERE id = ?`,
    [
      roundMoney(openings.reduce((sum, o) => sum + (o.amount || 0), 0)),
      snapshotId,
    ]
  );

  const identity = await recordIdentitySnapshot(db, userId, {
    monthKey: opts.monthKey,
    source: 'imported_cash_repair',
  });

  await recordTelemetryEvent(db, userId, 'imported_cash_reconciled', {
    openingsCount: openings.length,
    openingTotal: roundMoney(openings.reduce((sum, o) => sum + (o.amount || 0), 0)),
    snapshotId,
  });

  return {
    openings,
    snapshotId,
    identity,
    analysisBefore: analysis,
    readyToAssign: await readyToAssignPoolService.getPoolBalance(db, userId),
  };
}

module.exports = {
  OPENING_BALANCE_TYPE,
  HEALTH_THRESHOLDS,
  classifyHealthStatus,
  computeUnallocatedImportedCash,
  computeOverAssignedGap,
  computeNetNewCashForAccount,
  getIdentityStatus,
  getIdentityDiagnostics,
  listIdentitySnapshots,
  listOnboardingSnapshots,
  listReconciliationEvents,
  recordTelemetryEvent,
  isIntegrityWarningSuppressed,
  suppressIntegrityWarning,
  ensureLegacyPlaidOnboardingMarkers,
  recordIdentitySnapshot,
  createOpeningBalanceInflow,
  processImportedCashOnboarding,
  analyzeImportedCashMigration,
  applyImportedCashReconciliation,
  hasOpeningBalanceForAccount,
};
