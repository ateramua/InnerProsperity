/**
 * Budget consistency reconciliation — read-first diagnostics and user-approved repairs.
 * Assignment audit is the write-model target; monthly_budgets is a projection.
 */

const crypto = require('crypto');
const { roundMoney, normalizeMonthKey } = require('../../shared/readyToAssignEngine.cjs');

function toLocalMonthKey(input) {
  return normalizeMonthKey(input);
}

const ASSIGNMENT_CLASS = Object.freeze({
  LEGITIMATE_HISTORICAL_ASSIGNMENT: 'LEGITIMATE_HISTORICAL_ASSIGNMENT',
  PHANTOM_ASSIGNMENT: 'PHANTOM_ASSIGNMENT',
  MIGRATION_ARTIFACT: 'MIGRATION_ARTIFACT',
  INITIALIZATION_DATA: 'INITIALIZATION_DATA',
  AUDIT_COMPLETE: 'AUDIT_COMPLETE',
  UNKNOWN: 'UNKNOWN',
});

const REPAIR_ACTION = Object.freeze({
  CREATE_SYNTHETIC_AUDIT: 'CREATE_SYNTHETIC_AUDIT',
  ZERO_PHANTOM_ASSIGNMENT: 'ZERO_PHANTOM_ASSIGNMENT',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  NONE: 'NONE',
});

const { mapAuditSourceToOperationType, OPERATION_TYPE } = require('./assignmentLedgerTypes.cjs');

async function sumAuditedPositiveForRow(db, userId, categoryId, monthKey) {
  const row = await db.get(
    `SELECT COALESCE(SUM(CASE WHEN amount_changed > 0 THEN amount_changed ELSE 0 END), 0) AS pos,
            COALESCE(SUM(amount_changed), 0) AS net,
            COUNT(*) AS c
     FROM budget_assignment_audit
     WHERE user_id = ?
       AND CAST(category_id AS TEXT) = CAST(? AS TEXT)
       AND month = ?`,
    [String(userId), categoryId, toLocalMonthKey(monthKey)]
  );
  const net = roundMoney(Number(row?.net) || 0);
  return {
    positive: roundMoney(Number(row?.pos) || 0),
    net,
    level: roundMoney(Math.max(0, net)),
    count: Number(row?.c) || 0,
  };
}

async function isPhantomAssignmentRow(db, userId, categoryId, monthKey, budgeted, available, activity) {
  const monthlyBudgetService = require('./monthlyBudgetService.cjs');
  const phantoms = await monthlyBudgetService.findPhantomImplicitAssignmentRows(db, userId);
  return phantoms.some(
    (p) =>
      String(p.categoryId) === String(categoryId) &&
      toLocalMonthKey(p.month) === toLocalMonthKey(monthKey)
  );
}

function inferOriginHint({ monthKey, budgeted, audit, categoryName, isPhantom }) {
  if (audit.count > 0) return 'Assignment audit trail present';
  if (isPhantom) return 'Implicit repair / orphan available inflation';
  if (roundMoney(budgeted) >= 5000 && roundMoney(budgeted) % 500 === 0) {
    return 'Initial budget setup (round target-style amount, no audit)';
  }
  if (toLocalMonthKey(monthKey) <= '2026-06-01') {
    return 'Legacy pre-audit assignment row';
  }
  return `Unaudited ${categoryName || 'category'} assignment`;
}

async function classifyAssignmentRow(db, userId, row) {
  const budgeted = roundMoney(Number(row.budgeted_amount) || 0);
  const available = roundMoney(Number(row.available_amount) || 0);
  const activity = roundMoney(Number(row.activity_amount) || 0);
  const audit = await sumAuditedPositiveForRow(db, userId, row.category_id, row.month);

  if (budgeted <= 0.005) {
    return {
      classification: ASSIGNMENT_CLASS.AUDIT_COMPLETE,
      unauditedGap: 0,
      audit,
      origin: 'No assignment',
      recommendedAction: REPAIR_ACTION.NONE,
    };
  }

  const unauditedGap = roundMoney(Math.max(0, budgeted - audit.level));
  if (unauditedGap <= 0.005) {
    return {
      classification: ASSIGNMENT_CLASS.AUDIT_COMPLETE,
      unauditedGap: 0,
      audit,
      origin: 'Fully audited',
      recommendedAction: REPAIR_ACTION.NONE,
    };
  }

  const isPhantom = await isPhantomAssignmentRow(
    db,
    userId,
    row.category_id,
    row.month,
    budgeted,
    available,
    activity
  );

  let classification = ASSIGNMENT_CLASS.UNKNOWN;
  let recommendedAction = REPAIR_ACTION.MANUAL_REVIEW;

  const hasHealAudit = await db.get(
    `SELECT 1 AS ok FROM budget_assignment_audit
     WHERE user_id = ?
       AND CAST(category_id AS TEXT) = CAST(? AS TEXT)
       AND month = ?
       AND LOWER(IFNULL(source, '')) IN ('heal_phantom_assign', 'implicit_repair', 'phantom_heal', 'auto_heal')
     LIMIT 1`,
    [String(userId), row.category_id, toLocalMonthKey(row.month)]
  );

  if (hasHealAudit?.ok && isPhantom) {
    classification = ASSIGNMENT_CLASS.PHANTOM_ASSIGNMENT;
    recommendedAction = REPAIR_ACTION.MANUAL_REVIEW;
  } else {
    classification =
      audit.count === 0 && budgeted >= 1000
        ? ASSIGNMENT_CLASS.INITIALIZATION_DATA
        : ASSIGNMENT_CLASS.LEGITIMATE_HISTORICAL_ASSIGNMENT;
    recommendedAction = REPAIR_ACTION.CREATE_SYNTHETIC_AUDIT;
  }

  const migrationSources = ['implicit_repair', 'heal_phantom_assign', 'migration', 'legacy'];
  if (
    hasHealAudit?.ok &&
    audit.count === 0 &&
    migrationSources.some((s) => String(row.source || '').toLowerCase().includes(s))
  ) {
    classification = ASSIGNMENT_CLASS.MIGRATION_ARTIFACT;
    recommendedAction = REPAIR_ACTION.MANUAL_REVIEW;
  }

  return {
    classification,
    unauditedGap,
    audit,
    origin: inferOriginHint({
      monthKey: row.month,
      budgeted,
      audit,
      categoryName: row.category_name,
      isPhantom,
    }),
    recommendedAction,
  };
}

async function detectUnauditedAssignments(db, userId) {
  const rows = await db.all(
    `SELECT mb.category_id, mb.month, mb.budgeted_amount, mb.available_amount, mb.activity_amount,
            c.name AS category_name,
            c.is_credit_card_payment_category
     FROM monthly_budgets mb
     INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
     WHERE c.user_id = ?
       AND IFNULL(c.archived, 0) = 0
       AND COALESCE(mb.budgeted_amount, 0) > 0.005
     ORDER BY date(mb.month), c.name`,
    [userId]
  );

  const items = [];
  for (const row of rows || []) {
    const meta = await classifyAssignmentRow(db, userId, row);
    if (meta.unauditedGap <= 0.005) continue;
    const budgeted = roundMoney(Number(row.budgeted_amount) || 0);
    items.push({
      id: `${row.category_id}:${toLocalMonthKey(row.month)}`,
      categoryId: row.category_id,
      categoryName: row.category_name,
      month: toLocalMonthKey(row.month),
      budgeted,
      available: roundMoney(Number(row.available_amount) || 0),
      activity: roundMoney(Number(row.activity_amount) || 0),
      auditedPositive: meta.audit.positive,
      auditedLevel: meta.audit.level,
      auditRowCount: meta.audit.count,
      unauditedGap: meta.unauditedGap,
      classification: meta.classification,
      origin: meta.origin,
      recommendedAction: meta.recommendedAction,
      isCreditCardPayment: row.is_credit_card_payment_category === 1,
    });
  }
  return items;
}

async function detectGlobalTotalsMismatch(db, userId) {
  const budgetIntegrityService = require('./budgetIntegrityService.cjs');
  const rtaLedgerService = require('./rtaLedgerService.cjs');
  const monthlyBudgetService = require('./monthlyBudgetService.cjs');

  const global = await budgetIntegrityService.evaluateGlobalBudgetIdentity(db, userId);
  const txCredits = await rtaLedgerService.sumRtaTransactionCredits(db, userId);
  const assignNet = await rtaLedgerService.sumAssignmentPoolDeltas(db, userId);
  const derivedRta = await rtaLedgerService.computeDerivedRta(db, userId);

  const allBudgeted = await db.get(
    `SELECT COALESCE(SUM(mb.budgeted_amount), 0) AS t
     FROM monthly_budgets mb
     INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
     WHERE c.user_id = ? AND IFNULL(c.archived, 0) = 0`,
    [userId]
  );
  const allAuditPos = await db.get(
    `SELECT COALESCE(SUM(CASE WHEN amount_changed > 0 THEN amount_changed ELSE 0 END), 0) AS t
     FROM budget_assignment_audit WHERE user_id = ?`,
    [String(userId)]
  );

  const totalBudgeted = roundMoney(Number(allBudgeted?.t) || 0);
  const totalAuditedPositive = roundMoney(Number(allAuditPos?.t) || 0);
  const ledgerGap = roundMoney(totalBudgeted - totalAuditedPositive);

  return {
    global,
    ledger: { txCredits, assignNet, derivedRta },
    totalBudgeted,
    totalAuditedPositive,
    ledgerGap,
    overAssignedGap: global.budgetInvariantDelta < -0.01 ? roundMoney(Math.abs(global.budgetInvariantDelta)) : 0,
  };
}

async function detectRtaDrift(db, userId) {
  const rtaLedgerService = require('./rtaLedgerService.cjs');
  const readyToAssignPoolService = require('./readyToAssignPoolService.cjs');
  const derived = await rtaLedgerService.computeDerivedRta(db, userId);
  const poolRow = await db.get(
    `SELECT ready_to_assign_balance, rta_ledger_authority FROM user_budget_pool WHERE user_id = ?`,
    [userId]
  );
  const stored = roundMoney(Number(poolRow?.ready_to_assign_balance) || 0);
  return {
    derived,
    stored,
    drift: roundMoney(derived - stored),
    ledgerAuthority: poolRow?.rta_ledger_authority === 1,
    significant: Math.abs(derived - stored) > 0.05,
  };
}

/**
 * Phase A — read-only assignment reconciliation report.
 */
async function generateReconciliationReport(db, userId, opts = {}) {
  const envelopeCarryoverBridge = require('./envelopeCarryoverBridge.cjs');
  const importedCashReconciliationService = require('./importedCashReconciliationService.cjs');

  const unaudited = await detectUnauditedAssignments(db, userId);
  const totals = await detectGlobalTotalsMismatch(db, userId);
  const rtaDrift = await detectRtaDrift(db, userId);
  const carryover = await envelopeCarryoverBridge.detectCarryoverGapIssues(db, userId);
  const identity = await importedCashReconciliationService.getIdentityStatus(db, userId, opts);

  const byClassification = {};
  for (const item of unaudited) {
    byClassification[item.classification] = byClassification[item.classification] || [];
    byClassification[item.classification].push(item);
  }

  const totalUnauditedGap = roundMoney(
    unaudited.reduce((sum, item) => sum + item.unauditedGap, 0)
  );

  const proposals = unaudited
    .filter((item) => item.recommendedAction !== REPAIR_ACTION.NONE)
    .map((item) => ({
      ...item,
      repairId: `${item.id}:${item.recommendedAction}`,
      autoApplyAllowed: false,
      requiresUserApproval: true,
    }));

  return {
    generatedAt: new Date().toISOString(),
    userId,
    readOnly: true,
    identity,
    totals,
    rtaDrift,
    carryoverIssues: carryover.issues,
    carryoverEstimatedLoss: carryover.estimatedLoss,
    unauditedAssignments: unaudited,
    byClassification,
    summary: {
      totalUnauditedGap,
      ledgerGap: totals.ledgerGap,
      overAssignedGap: totals.overAssignedGap,
      unauditedRowCount: unaudited.length,
      proposalCount: proposals.length,
      invariantValid: totals.global.invariantValid,
    },
    proposals,
    warnings: buildReportWarnings({ totals, unaudited, rtaDrift, carryover }),
  };
}

function buildReportWarnings({ totals, unaudited, rtaDrift, carryover }) {
  const warnings = [];
  if (totals.overAssignedGap > 10) {
    warnings.push({
      code: 'OVER_ASSIGNED',
      message: `Global identity over-assigned by $${totals.overAssignedGap.toFixed(2)}`,
    });
  }
  if (Math.abs(totals.ledgerGap - totals.overAssignedGap) > 50 && totals.overAssignedGap > 10) {
    warnings.push({
      code: 'LEDGER_GAP_MISMATCH',
      message:
        'Total budgeted vs audit gap does not fully explain over-assignment; verify both sources before repair.',
    });
  }
  if (unaudited.length > 0) {
    warnings.push({
      code: 'MISSING_AUDIT',
      message: `${unaudited.length} assignment row(s) lack full audit coverage ($${totals.ledgerGap.toFixed(2)} total).`,
    });
  }
  if (rtaDrift.significant) {
    warnings.push({
      code: 'RTA_POOL_DRIFT',
      message: `Persisted RTA pool differs from ledger by $${rtaDrift.drift.toFixed(2)}.`,
    });
  }
  if (carryover.estimatedLoss > 10) {
    warnings.push({
      code: 'CARRYOVER_GAP',
      message: `Estimated carryover corruption: $${carryover.estimatedLoss.toFixed(2)}.`,
    });
  }
  return warnings;
}

/**
 * Phase B — proposed repairs only (no mutation).
 */
async function proposeRepairs(db, userId, opts = {}) {
  const report = await generateReconciliationReport(db, userId, opts);
  return {
    proposals: report.proposals,
    summary: report.summary,
    warnings: report.warnings,
  };
}

/**
 * Phase C — user-approved repair: synthetic audit events for verified assignments only.
 */
async function applyApprovedRepairs(db, userId, repairIds = [], opts = {}) {
  if (!opts.userApproved) {
    const err = new Error('Assignment repairs require explicit user approval.');
    err.code = 'REPAIR_NOT_USER_APPROVED';
    throw err;
  }

  const report = await generateReconciliationReport(db, userId, opts);
  const idSet = new Set((repairIds || []).map(String));
  const selected = report.proposals.filter((p) => idSet.has(String(p.repairId)));

  if (!selected.length) {
    return { applied: [], skipped: [], reportBefore: report.summary };
  }

  const { recordAssignmentEvent } = require('./budgetAssignmentAuditService.cjs');
  const rtaLedgerService = require('./rtaLedgerService.cjs');
  const budgetIntegrityService = require('./budgetIntegrityService.cjs');
  const { runBudgetTransaction } = require('../../db/transactionRunner.cjs');

  const identityBefore = await budgetIntegrityService.evaluateGlobalBudgetIdentity(db, userId, opts);
  const applied = [];
  const skipped = [];

  await runBudgetTransaction(db, async () => {
    for (const proposal of selected) {
      if (proposal.recommendedAction === REPAIR_ACTION.CREATE_SYNTHETIC_AUDIT) {
        if (
          proposal.classification !== ASSIGNMENT_CLASS.LEGITIMATE_HISTORICAL_ASSIGNMENT &&
          proposal.classification !== ASSIGNMENT_CLASS.INITIALIZATION_DATA
        ) {
          skipped.push({ ...proposal, reason: 'classification_not approved for backfill' });
          continue;
        }

        const previousAssigned = roundMoney(proposal.budgeted - proposal.unauditedGap);
        await recordAssignmentEvent(db, {
          userId,
          categoryId: proposal.categoryId,
          monthKey: proposal.month,
          previousAssigned,
          newAssigned: proposal.budgeted,
          source: 'legacy_reconciliation_backfill',
          operationType: OPERATION_TYPE.LEGACY_RECONCILIATION_BACKFILL,
          createdByOperation: 'budgetConsistencyService.applyApprovedRepairs',
          createdByMigration: opts.migrationId || null,
          createdBySystem: 1,
          metadata: {
            repairId: proposal.repairId,
            classification: proposal.classification,
            origin: proposal.origin,
            unauditedGap: proposal.unauditedGap,
            approvedByUser: true,
          },
        });
        applied.push({ ...proposal, action: REPAIR_ACTION.CREATE_SYNTHETIC_AUDIT });
        continue;
      }

      if (proposal.recommendedAction === REPAIR_ACTION.ZERO_PHANTOM_ASSIGNMENT) {
        skipped.push({
          ...proposal,
          reason: 'phantom zeroing requires separate user-intent maintenance flow',
        });
        continue;
      }

      skipped.push({ ...proposal, reason: 'manual_review_required' });
    }
  });

  await rtaLedgerService.syncPoolFromLedger(db, userId, { source: 'ledger_sync' });
  const identityAfter = await budgetIntegrityService.evaluateGlobalBudgetIdentity(db, userId, opts);

  await db.run(
    `INSERT INTO budget_reconciliation_events (id, user_id, event_type, payload_json)
     VALUES (?, ?, 'assignment_reconciliation_applied', ?)`,
    [
      crypto.randomUUID(),
      userId,
      JSON.stringify({
        appliedCount: applied.length,
        skippedCount: skipped.length,
        identityBefore: identityBefore.budgetInvariantDelta,
        identityAfter: identityAfter.budgetInvariantDelta,
      }),
    ]
  );

  return {
    applied,
    skipped,
    identityBefore,
    identityAfter,
    readyToAssign: await rtaLedgerService.computeDerivedRta(db, userId),
  };
}

/**
 * Assert global identity is not worsened by a mutation (transactional guard).
 */
async function assertGlobalIdentityNotWorsened(db, userId, beforeDelta, context = '', opts = {}) {
  const budgetIntegrityService = require('./budgetIntegrityService.cjs');
  const after = await budgetIntegrityService.evaluateGlobalBudgetIdentity(db, userId, opts);
  const before = roundMoney(Number(beforeDelta) || 0);
  const afterDelta = roundMoney(after.budgetInvariantDelta);

  if (after.invariantValid) return after;

  const tolerance = roundMoney(Number(opts.tolerance) || 0.05);
  if (afterDelta < 0 && before < 0) {
    if (Math.abs(afterDelta) <= Math.abs(before) + tolerance) return after;
  }
  if (Math.abs(afterDelta) <= Math.abs(before) + tolerance) return after;

  const err = new Error(
    `Budget identity worsened${context ? ` (${context})` : ''}: ` +
      `before ${before}, after ${afterDelta}`
  );
  err.code = 'BUDGET_IDENTITY_WORSENED';
  err.before = before;
  err.after = afterDelta;
  throw err;
}

/**
 * Startup / nightly read-only consistency scan.
 */
async function runConsistencyScan(db, userId, opts = {}) {
  const report = await generateReconciliationReport(db, userId, opts);
  const level =
    report.summary.overAssignedGap > 1000 || report.summary.totalUnauditedGap > 1000
      ? 'error'
      : report.summary.unauditedRowCount > 0
        ? 'warning'
        : 'healthy';
  return { level, report, logLine: formatScanLogLine(report) };
}

function formatScanLogLine(report) {
  const s = report.summary;
  if (s.invariantValid && s.unauditedRowCount === 0) {
    return 'Budget consistency: healthy';
  }
  return (
    `Budget consistency: ${s.unauditedRowCount} unaudited row(s), ` +
    `gap $${s.totalUnauditedGap.toFixed(2)}, over-assigned $${s.overAssignedGap.toFixed(2)}`
  );
}

module.exports = {
  ASSIGNMENT_CLASS,
  REPAIR_ACTION,
  OPERATION_TYPE,
  mapAuditSourceToOperationType,
  detectUnauditedAssignments,
  detectGlobalTotalsMismatch,
  detectRtaDrift,
  generateReconciliationReport,
  proposeRepairs,
  applyApprovedRepairs,
  assertGlobalIdentityNotWorsened,
  runConsistencyScan,
};
