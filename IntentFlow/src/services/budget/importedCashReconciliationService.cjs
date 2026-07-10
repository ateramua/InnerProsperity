/**
 * Imported Cash Reconciliation Engine — converts external account balances into
 * budget-recognized RTA via synthetic OPENING_BALANCE ledger events.
 *
 * Plaid balance refreshes never mutate RTA directly; onboarding creates inflows.
 */

const { v4: uuidv4 } = require('uuid');
const { roundMoney, normalizeMonthKey } = require('../../shared/readyToAssignEngine.cjs');
const { isOnBudgetCashAccount } = require('../../utils/cashAccountUtils.cjs');
const budgetIntegrityService = require('../budget/budgetIntegrityService.cjs');
const readyToAssignPoolService = require('../budget/readyToAssignPoolService.cjs');
const envelopeCarryoverBridge = require('../budget/envelopeCarryoverBridge.cjs');
const rtaLedgerService = require('../budget/rtaLedgerService.cjs');

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

/** Sum budgeted amounts in months strictly after the viewed month anchor. */
function computeFutureAssignedAfterMonth(assignmentRows, anchorMonthKey) {
  const anchor = normalizeMonthKey(anchorMonthKey);
  let total = 0;
  for (const row of assignmentRows || []) {
    const month = normalizeMonthKey(row.month);
    const amount = roundMoney(Number(row.budgeted_amount) || 0);
    if (month > anchor && amount > 0.005) {
      total += amount;
    }
  }
  return roundMoney(total);
}

/**
 * Cross-month assignments reduce RTA globally but only raise the selected month's
 * category-available total — exclude that reserved slice from orphan imported cash.
 */
function adjustOrphanDeltaForFutureAssignments(identityDelta, futureAssignedAfterMonth) {
  const delta = roundMoney(Number(identityDelta) || 0);
  const future = roundMoney(Number(futureAssignedAfterMonth) || 0);
  if (delta <= HEALTH_THRESHOLDS.HEALTHY || future <= 0) return delta;
  return roundMoney(Math.max(0, delta - Math.min(delta, future)));
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

  let consistencyReport = null;
  if (opts.includeConsistencyReport !== false) {
    const budgetConsistencyService = require('./budgetConsistencyService.cjs');
    consistencyReport = await budgetConsistencyService.generateReconciliationReport(db, userId, opts);
  }

  return {
    status,
    analysis,
    snapshots,
    onboardingSnapshots,
    events,
    pendingDuplicates,
    suppressed: status.warningSuppressed,
    consistencyReport,
  };
}

/**
 * One-time migration helper — do not call at runtime (reconciliation is transaction-derived).
 * @deprecated Use migration backfill only; retained for existing migration scripts.
 */
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

async function runInTransaction(db, fn) {
  await db.run('BEGIN IMMEDIATE');
  try {
    const result = await fn();
    await db.run('COMMIT');
    return result;
  } catch (err) {
    try {
      await db.run('ROLLBACK');
    } catch (_) {
      /* ignore rollback failure */
    }
    throw err;
  }
}

async function getOpeningBalanceTotalForAccount(db, accountId, userId) {
  const row = await db.get(
    `SELECT COALESCE(SUM(ABS(amount)), 0) AS total
     FROM transactions
     WHERE account_id = ? AND user_id = ?
       AND transaction_type = ?
       AND (is_deleted IS NULL OR is_deleted = 0)`,
    [accountId, userId, OPENING_BALANCE_TYPE]
  );
  return roundMoney(Number(row?.total) || 0);
}

function computeAccountOnboardingGap(accountBalance, openingBalanceTotal) {
  const balance = roundMoney(Math.max(0, Number(accountBalance) || 0));
  const opening = roundMoney(Math.max(0, Number(openingBalanceTotal) || 0));
  return roundMoney(Math.max(0, balance - opening));
}

/**
 * Transaction-derived onboarding gap per on-budget cash account:
 * gap = current_balance - SUM(OPENING_BALANCE transactions)
 */
async function computeOnboardingGap(db, userId) {
  const rows = await db.all(
    `SELECT
       a.id,
       a.name,
       a.type,
       a.balance,
       a.working_balance,
       a.source,
       a.account_type_category,
       a.on_budget,
       a.budget_inclusion_status,
       COALESCE((
         SELECT SUM(ABS(t.amount))
         FROM transactions t
         WHERE t.account_id = a.id
           AND t.user_id = a.user_id
           AND t.transaction_type = ?
           AND (t.is_deleted IS NULL OR t.is_deleted = 0)
       ), 0) AS opening_balance_total
     FROM accounts a
     WHERE a.user_id = ?
       AND IFNULL(a.is_active, 1) = 1
       AND IFNULL(a.account_status, 'active') = 'active'
       AND LOWER(a.type) IN ('checking', 'savings')
       AND IFNULL(a.budget_inclusion_status, 'on_budget') = 'on_budget'`,
    [OPENING_BALANCE_TYPE, userId]
  );

  const proposals = [];
  for (const row of rows || []) {
    if (!isOnBudgetCashAccount(row)) continue;
    const bal = normalizeAssetBalance(row);
    if (bal < 0.005) continue;
    const openingTotal = roundMoney(Number(row.opening_balance_total) || 0);
    const gap = computeAccountOnboardingGap(bal, openingTotal);
    if (gap < HEALTH_THRESHOLDS.HEALTHY) continue;
    proposals.push({
      accountId: row.id,
      accountName: row.name,
      proposedOpeningBalance: gap,
      currentBalance: bal,
      openingBalanceTotal: openingTotal,
      source: row.source || 'manual',
    });
  }

  const proposedTotalOpening = roundMoney(
    proposals.reduce((sum, p) => sum + (Number(p.proposedOpeningBalance) || 0), 0)
  );

  return { proposals, proposedTotalOpening };
}

async function computeCreditCardReserveDrift(db, userId, anchorMonth) {
  const monthlyBudgetService = require('../budget/monthlyBudgetService.cjs');
  const anchor = monthlyBudgetService.toLocalMonthKey(anchorMonth || new Date());
  const baselineMonth = monthlyBudgetService.toLocalMonthKey(new Date());

  const anchorRows = await db.all(
    `SELECT COALESCE(SUM(mb.available_amount), 0) AS total
     FROM monthly_budgets mb
     INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
     WHERE c.user_id = ?
       AND c.is_credit_card_payment_category = 1
       AND date(mb.month) = date(?)`,
    [userId, anchor]
  );
  const baselineRows = await db.all(
    `SELECT COALESCE(SUM(mb.available_amount), 0) AS total
     FROM monthly_budgets mb
     INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
     WHERE c.user_id = ?
       AND c.is_credit_card_payment_category = 1
       AND date(mb.month) = date(?)`,
    [userId, baselineMonth]
  );

  const anchorTotal = roundMoney(Number(anchorRows?.[0]?.total) || 0);
  const baselineTotal = roundMoney(Number(baselineRows?.[0]?.total) || 0);
  const drift = roundMoney(Math.max(0, baselineTotal - anchorTotal));
  return {
    anchorMonth: anchor,
    baselineMonth,
    anchorTotal,
    baselineTotal,
    drift,
    significant: drift > HEALTH_THRESHOLDS.HEALTHY,
  };
}

/**
 * Classify budget integrity into distinct, actionable issue types.
 */
async function classifyBudgetIntegrityIssues(db, userId, opts = {}) {
  const global = await budgetIntegrityService.evaluateGlobalBudgetIdentity(db, userId, opts);
  const onboarding = await computeOnboardingGap(db, userId);
  const envelope = await envelopeCarryoverBridge.detectCarryoverGapIssues(db, userId);
  const ccReserve = await computeCreditCardReserveDrift(db, userId, global.anchorMonth);

  const overAssignedGap = computeOverAssignedGap(global.budgetInvariantDelta);
  const onboardingAmount = onboarding.proposedTotalOpening;
  const envelopeAmount = envelope.estimatedLoss;
  const ccAmount = ccReserve.significant ? ccReserve.drift : 0;

  let unexplainedDrift = roundMoney(global.budgetInvariantDelta);
  if (unexplainedDrift > 0) {
    unexplainedDrift = roundMoney(
      Math.max(0, unexplainedDrift - onboardingAmount - envelopeAmount - ccAmount)
    );
  }

  const issues = [];

  if (onboardingAmount > HEALTH_THRESHOLDS.HEALTHY) {
    issues.push({
      type: 'imported_cash_onboarding',
      label: 'Imported cash onboarding',
      message: 'Accounts contain cash that has not been added to the budget.',
      amount: onboardingAmount,
      severity: onboardingAmount > HEALTH_THRESHOLDS.ERROR ? 'critical' : 'error',
      proposals: onboarding.proposals,
    });
  }

  if (envelopeAmount > HEALTH_THRESHOLDS.HEALTHY) {
    issues.push({
      type: 'envelope_integrity',
      label: 'Envelope integrity',
      message: 'One or more category balances appear corrupted (missing month carryover).',
      amount: envelopeAmount,
      severity: envelopeAmount > HEALTH_THRESHOLDS.ERROR ? 'critical' : 'error',
      details: envelope.issues.slice(0, 10),
    });
  }

  if (ccAmount > HEALTH_THRESHOLDS.HEALTHY) {
    issues.push({
      type: 'credit_card_reserve',
      label: 'Credit card reserve',
      message: 'Credit card payment reserves require recalculation.',
      amount: ccAmount,
      severity: ccAmount > HEALTH_THRESHOLDS.WARNING ? 'error' : 'warning',
      details: ccReserve,
    });
  }

  if (overAssignedGap > HEALTH_THRESHOLDS.HEALTHY) {
    issues.push({
      type: 'over_assigned',
      label: 'Over-assigned budget',
      message: 'Category assignments exceed the cash available in your budget envelope.',
      amount: overAssignedGap,
      severity: overAssignedGap > HEALTH_THRESHOLDS.ERROR ? 'critical' : 'error',
    });
  }

  if (unexplainedDrift > HEALTH_THRESHOLDS.HEALTHY && overAssignedGap <= HEALTH_THRESHOLDS.HEALTHY) {
    issues.push({
      type: 'budget_identity_drift',
      label: 'Budget identity drift',
      message: 'Budget balances are out of sync.',
      amount: unexplainedDrift,
      severity: unexplainedDrift > HEALTH_THRESHOLDS.ERROR ? 'critical' : 'warning',
    });
  }

  const primaryIssue = issues.sort((a, b) => (b.amount || 0) - (a.amount || 0))[0] || null;

  return {
    global,
    issues,
    primaryIssue,
    onboarding,
    envelope,
    ccReserve,
    overAssignedGap,
    unexplainedDrift,
  };
}

async function getIdentityStatus(db, userId, opts = {}) {
  const warningSuppressed = await isIntegrityWarningSuppressed(db, userId);
  const classified = await classifyBudgetIntegrityIssues(db, userId, opts);
  const global = classified.global;

  const monthlyBudgetService = require('../budget/monthlyBudgetService.cjs');
  const { rows } = await monthlyBudgetService.getGlobalAssignmentTotals(db, userId);
  const totalAssigned = roundMoney(
    (rows || []).reduce((sum, row) => sum + (Number(row.budgeted_amount) || 0), 0)
  );

  const onboardingGap = classified.onboarding.proposedTotalOpening;
  const envelopeLoss = classified.envelope.estimatedLoss;
  const overAssignedGap = classified.overAssignedGap;

  const unallocatedImportedCash = onboardingGap;
  const healthStatus = classifyHealthStatus(
    overAssignedGap > HEALTH_THRESHOLDS.HEALTHY
      ? -overAssignedGap
      : global.budgetInvariantDelta
  );

  const needsOrphanRepair = onboardingGap > HEALTH_THRESHOLDS.WARNING;
  const needsOverAssignmentRepair = overAssignedGap > HEALTH_THRESHOLDS.WARNING;
  const needsEnvelopeRepair = envelopeLoss > HEALTH_THRESHOLDS.WARNING;
  const needsReconciliation =
    !warningSuppressed &&
    (needsOrphanRepair ||
      needsOverAssignmentRepair ||
      needsEnvelopeRepair ||
      classified.issues.some((issue) => issue.amount > HEALTH_THRESHOLDS.WARNING));

  const primary = classified.primaryIssue;

  return {
    ...global,
    totalAssigned,
    futureAssignedAfterMonth: global.futureAssignedAfterAnchor,
    rawBudgetInvariantDelta: global.budgetInvariantDelta,
    orphanBudgetInvariantDelta: global.budgetInvariantDelta,
    unallocatedImportedCash,
    overAssignedGap,
    healthStatus,
    warningSuppressed,
    needsOrphanRepair,
    needsOverAssignmentRepair,
    needsEnvelopeRepair,
    needsReconciliation,
    identityIssueType: primary?.type || null,
    issues: classified.issues,
    primaryIssue: primary,
    diagnostics: {
      onboardingGap,
      envelopeLoss,
      ccReserveDrift: classified.ccReserve.drift,
      unexplainedDrift: classified.unexplainedDrift,
      ledgerRta: await rtaLedgerService.computeDerivedRta(db, userId),
      ledgerAuthority: await rtaLedgerService.isLedgerAuthorityEnabled(db, userId),
    },
    thresholds: HEALTH_THRESHOLDS,
    monthKey: global.anchorMonth,
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

  const currentBalance = normalizeAssetBalance(account);
  const openingTotal = await getOpeningBalanceTotalForAccount(db, accountId, userId);
  const unreconciledGap = computeAccountOnboardingGap(currentBalance, openingTotal);
  if (!opts.force && unreconciledGap < HEALTH_THRESHOLDS.HEALTHY) {
    return { skipped: true, reason: 'already_reconciled' };
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

/**
 * Normalize a linked account balance to USD for budget / OPENING_BALANCE purposes.
 * Non-USD Plaid rows should store the USD equivalent on working_balance (or balance_usd).
 */
function normalizeImportedBalanceToUsd(account, importedBalance) {
  const fallback = roundMoney(Math.max(0, Number(importedBalance) || 0));
  if (!account) return fallback;
  const currency = String(account.currency || 'USD').trim().toUpperCase();
  if (!currency || currency === 'USD') return fallback;
  const usdEquivalent =
    account.usd_working_balance ??
    account.balance_usd ??
    account.working_balance ??
    account.balance;
  if (usdEquivalent != null && Number.isFinite(Number(usdEquivalent))) {
    return roundMoney(Math.max(0, Number(usdEquivalent)));
  }
  return fallback;
}

/**
 * Reverse synthetic OPENING_BALANCE inflows when an on-budget cash account is removed.
 */
async function reverseOpeningBalanceForAccount(db, userId, accountId) {
  const rows = await db.all(
    `SELECT * FROM transactions
     WHERE account_id = ? AND user_id = ?
       AND transaction_type = ?
       AND (is_deleted IS NULL OR is_deleted = 0)`,
    [accountId, userId, OPENING_BALANCE_TYPE]
  );
  if (!rows.length) return { reversed: 0, totalAmount: 0 };

  let totalAmount = 0;
  for (const tx of rows) {
    await readyToAssignPoolService.syncPoolForTransaction(db, userId, tx, 'reverse');
    await db.run(
      `UPDATE transactions SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`,
      [tx.id]
    );
    totalAmount = roundMoney(totalAmount + Math.abs(Number(tx.amount) || 0));
  }

  await db.run(
    `UPDATE accounts
     SET imported_opening_balance_transaction_id = NULL,
         onboarding_complete = 0,
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [accountId, userId]
  );

  return { reversed: rows.length, totalAmount };
}

/**
 * Whether a system transaction can be removed via imported-cash opening balance reversal.
 */
function isReversibleImportedCashOpeningBalance(tx) {
  if (!tx) return false;
  const isOpeningType = tx.transaction_type === OPENING_BALANCE_TYPE;
  const isReconciliation =
    tx.reconciliation_generated === 1 || tx.reconciliation_generated === true;
  return isOpeningType || isReconciliation;
}

/**
 * Reverse a single synthetic OPENING_BALANCE inflow (e.g. mistaken reconciliation repair).
 * Only reconciliation-generated or typed OPENING_BALANCE rows may be reversed.
 */
async function reverseOpeningBalanceTransaction(db, userId, transactionId) {
  const tx = await db.get(
    `SELECT * FROM transactions
     WHERE id = ? AND user_id = ?
       AND (is_deleted IS NULL OR is_deleted = 0)`,
    [transactionId, userId]
  );
  if (!tx) {
    const err = new Error('Opening balance transaction not found');
    err.code = 'OPENING_BALANCE_NOT_FOUND';
    throw err;
  }

  const isOpeningType = tx.transaction_type === OPENING_BALANCE_TYPE;
  const isReconciliation =
    tx.reconciliation_generated === 1 || tx.reconciliation_generated === true;
  if (!isOpeningType && !isReconciliation) {
    const err = new Error('Only imported-cash OPENING_BALANCE transactions can be reversed here');
    err.code = 'OPENING_BALANCE_NOT_REVERSIBLE';
    throw err;
  }

  await readyToAssignPoolService.syncPoolForTransaction(db, userId, tx, 'reverse');
  await db.run(
    `UPDATE transactions SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`,
    [tx.id]
  );

  const account = await db.get('SELECT id FROM accounts WHERE id = ? AND user_id = ?', [
    tx.account_id,
    userId,
  ]);
  if (account?.id) {
    await db.run(
      `UPDATE accounts
       SET imported_opening_balance_transaction_id = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?
         AND CAST(imported_opening_balance_transaction_id AS TEXT) = CAST(? AS TEXT)`,
      [account.id, userId, tx.id]
    );
  }

  const TransactionService = require('../transactions/transactionService.cjs');
  const txService = new TransactionService(async () => db);
  await txService.updateAccountBalances(tx.account_id);

  return {
    reversed: true,
    transactionId: tx.id,
    accountId: tx.account_id,
    amount: roundMoney(Math.abs(Number(tx.amount) || 0)),
    readyToAssign: await readyToAssignPoolService.getPoolBalance(db, userId),
  };
}

async function accountHasLedgerOpeningBalance(db, userId) {
  const row = await db.get(
    `SELECT id FROM transactions
     WHERE user_id = ?
       AND (is_deleted IS NULL OR is_deleted = 0)
       AND (
         transaction_type = ?
         OR (
           IFNULL(is_system, 0) = 1
           AND (LOWER(payee) = 'starting balance' OR LOWER(description) = 'starting balance')
         )
       )
     LIMIT 1`,
    [userId, OPENING_BALANCE_TYPE]
  );
  return Boolean(row?.id);
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

  return runInTransaction(db, async () => {
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
      if (!isOnBudgetCashAccount(account)) {
        await db.run(
          `UPDATE accounts SET onboarding_complete = 1, updated_at = datetime('now') WHERE id = ?`,
          [candidate.accountId]
        );
        continue;
      }

      const importedUsd = normalizeImportedBalanceToUsd(
        account,
        candidate.importedBalance != null
          ? candidate.importedBalance
          : normalizeAssetBalance(account)
      );
      const netNew = computeNetNewCashForAccount(importedUsd, candidate.priorBalance);
      netNewTotal = roundMoney(netNewTotal + netNew);

      const existingOpening = await getOpeningBalanceTotalForAccount(
        db,
        candidate.accountId,
        userId
      );
      const ledgerGap = computeAccountOnboardingGap(importedUsd, existingOpening);
      if (netNew < 0.005 && ledgerGap < HEALTH_THRESHOLDS.HEALTHY) {
        await db.run(
          `UPDATE accounts SET onboarding_complete = 1, onboarding_snapshot_id = ?, updated_at = datetime('now') WHERE id = ?`,
          [snapshotId, candidate.accountId]
        );
        continue;
      }

      const amountToOpen = netNew >= HEALTH_THRESHOLDS.HEALTHY ? netNew : ledgerGap;
      if (amountToOpen < HEALTH_THRESHOLDS.HEALTHY) {
        continue;
      }

      const result = await createOpeningBalanceInflow(db, userId, candidate.accountId, amountToOpen, {
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
  });
}

/**
 * Analyze orphaned imported cash for existing users (migration preview).
 */
async function analyzeImportedCashMigration(db, userId, opts = {}) {
  const status = await getIdentityStatus(db, userId, opts);
  const onboarding = await computeOnboardingGap(db, userId);

  return {
    ...status,
    proposals: onboarding.proposals,
    proposedTotalOpening: onboarding.proposedTotalOpening,
    canAutoRepair:
      status.unallocatedImportedCash > HEALTH_THRESHOLDS.WARNING && onboarding.proposals.length > 0,
  };
}

/**
 * User-approved repair: create opening balances for pending accounts / orphaned cash.
 */
async function applyImportedCashReconciliation(db, userId, opts = {}) {
  return runInTransaction(db, async () => {
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
    }

    if (
      !openings.length &&
      analysis.unallocatedImportedCash > HEALTH_THRESHOLDS.WARNING &&
      !analysis.proposals.length
    ) {
      await recordTelemetryEvent(db, userId, 'imported_cash_reconciliation_skipped', {
        reason: 'no_onboarding_proposals_administrative_rta_repair_disabled',
        unallocatedBefore: analysis.unallocatedImportedCash,
        snapshotId,
      });
    }

    await rtaLedgerService.syncPoolFromLedger(db, userId, { source: 'ledger_sync' });

    await db.run(
      `UPDATE budget_onboarding_snapshots
       SET opening_balance_total = ?
       WHERE id = ?`,
      [roundMoney(openings.reduce((sum, o) => sum + (o.amount || 0), 0)), snapshotId]
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
  });
}

module.exports = {
  OPENING_BALANCE_TYPE,
  HEALTH_THRESHOLDS,
  classifyHealthStatus,
  computeUnallocatedImportedCash,
  computeFutureAssignedAfterMonth,
  adjustOrphanDeltaForFutureAssignments,
  computeOverAssignedGap,
  computeNetNewCashForAccount,
  computeOnboardingGap,
  computeAccountOnboardingGap,
  getOpeningBalanceTotalForAccount,
  runInTransaction,
  computeCreditCardReserveDrift,
  classifyBudgetIntegrityIssues,
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
  normalizeImportedBalanceToUsd,
  reverseOpeningBalanceForAccount,
  reverseOpeningBalanceTransaction,
  isReversibleImportedCashOpeningBalance,
  accountHasLedgerOpeningBalance,
};
