/**
 * Assignment ledger — authoritative write model for category assignments.
 * Every assignment MUST produce an audit event; monthly_budgets is projection-only.
 */

const crypto = require('crypto');
const { roundMoney, normalizeMonthKey } = require('../../shared/readyToAssignEngine.cjs');
const { mapAuditSourceToOperationType, OPERATION_TYPE } = require('./assignmentLedgerTypes.cjs');

const LEGACY_BACKFILL_SOURCE = 'legacy_backfill_v1';
const LEGACY_BACKFILL_SOURCES = new Set([
  LEGACY_BACKFILL_SOURCE,
  'legacy_reconciliation_backfill',
]);

const HEAL_AUDIT_SOURCES = new Set([
  'heal_phantom_assign',
  'implicit_repair',
  'phantom_heal',
  'auto_heal',
]);

function toLocalMonthKey(input) {
  return normalizeMonthKey(input);
}

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
    /** Audited assigned level (ledger-derived, floor at 0). */
    level: roundMoney(Math.max(0, net)),
    count: Number(row?.c) || 0,
  };
}

async function readAuthoritativeRta(db, userId) {
  const rtaLedgerService = require('./rtaLedgerService.cjs');
  if (await rtaLedgerService.isLedgerAuthorityEnabled(db, userId)) {
    return rtaLedgerService.computeDerivedRta(db, userId);
  }
  const readyToAssignPoolService = require('./readyToAssignPoolService.cjs');
  return readyToAssignPoolService.getPoolBalance(db, userId);
}

/**
 * Hard invariant: assignment increases require sufficient RTA before commit.
 */
async function assertSufficientRtaForAssignment(db, userId, assignDelta, opts = {}) {
  const delta = roundMoney(Number(assignDelta) || 0);
  if (delta <= 0.005) return;
  if (opts.skipRtaCheck === true) return;

  const rta = await readAuthoritativeRta(db, userId);
  if (rta + 0.05 < delta) {
    const err = new Error(
      `Insufficient Ready to Assign for assignment: need ${delta}, available ${rta}`
    );
    err.code = 'INSUFFICIENT_RTA';
    err.readyToAssign = rta;
    err.required = delta;
    throw err;
  }
}

/**
 * Verify audit event matches projection delta (post-write guard).
 */
function assertAuditMatchesProjection(auditRow, previousAssigned, newAssigned) {
  if (!auditRow) {
    const delta = roundMoney(newAssigned - previousAssigned);
    if (Math.abs(delta) >= 0.005) {
      const err = new Error('Assignment audit event required for budgeted_amount change.');
      err.code = 'ASSIGNMENT_AUDIT_REQUIRED';
      throw err;
    }
    return;
  }
  const expected = roundMoney(newAssigned - previousAssigned);
  const actual = roundMoney(auditRow.amountChanged);
  if (Math.abs(expected - actual) > 0.05) {
    const err = new Error(
      `Assignment audit mismatch: expected delta ${expected}, audit ${actual}`
    );
    err.code = 'ASSIGNMENT_AUDIT_MISMATCH';
    throw err;
  }
}

async function hasHealAuditForRow(db, userId, categoryId, monthKey) {
  const row = await db.get(
    `SELECT 1 AS ok
     FROM budget_assignment_audit
     WHERE user_id = ?
       AND CAST(category_id AS TEXT) = CAST(? AS TEXT)
       AND month = ?
       AND LOWER(IFNULL(source, '')) IN (${Array.from(HEAL_AUDIT_SOURCES)
         .map(() => '?')
         .join(', ')})
     LIMIT 1`,
    [String(userId), categoryId, toLocalMonthKey(monthKey), ...HEAL_AUDIT_SOURCES]
  );
  return Boolean(row?.ok);
}

async function findAssignmentProjectionGaps(db, userId) {
  const rows = await db.all(
    `SELECT mb.category_id, mb.month, mb.budgeted_amount, mb.available_amount,
            mb.activity_amount, c.name AS category_name
     FROM monthly_budgets mb
     INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
     WHERE c.user_id = ?
       AND IFNULL(c.archived, 0) = 0
       AND COALESCE(mb.budgeted_amount, 0) > 0.005
     ORDER BY date(mb.month), c.name`,
    [userId]
  );

  const gaps = [];
  for (const row of rows || []) {
    const budgeted = roundMoney(Number(row.budgeted_amount) || 0);
    const audit = await sumAuditedPositiveForRow(db, userId, row.category_id, row.month);
    const unauditedGap = roundMoney(Math.max(0, budgeted - audit.level));
    if (unauditedGap <= 0.005) continue;

    const healOnly = await hasHealAuditForRow(db, userId, row.category_id, row.month);
    if (healOnly) continue;

    gaps.push({
      categoryId: row.category_id,
      categoryName: row.category_name,
      month: toLocalMonthKey(row.month),
      budgeted,
      auditedLevel: audit.level,
      auditedPositive: audit.positive,
      unauditedGap,
      previousAssigned: audit.level,
      newAssigned: budgeted,
    });
  }
  return gaps;
}

/**
 * One-time / approved reconstruction: synthetic ledger events for projection gaps.
 */
async function reconstructMissingLedgerEvents(db, userId, opts = {}) {
  const { recordAssignmentEvent } = require('./budgetAssignmentAuditService.cjs');
  const rtaLedgerService = require('./rtaLedgerService.cjs');
  const budgetIntegrityService = require('./budgetIntegrityService.cjs');
  const { runBudgetTransaction } = require('../../db/transactionRunner.cjs');

  const gaps = await findAssignmentProjectionGaps(db, userId);
  if (!gaps.length) {
    return {
      applied: [],
      skipped: [],
      identityBefore: await budgetIntegrityService.evaluateGlobalBudgetIdentity(db, userId, opts),
      identityAfter: await budgetIntegrityService.evaluateGlobalBudgetIdentity(db, userId, opts),
      readyToAssign: await rtaLedgerService.computeDerivedRta(db, userId),
    };
  }

  const identityBefore = await budgetIntegrityService.evaluateGlobalBudgetIdentity(db, userId, opts);
  const applied = [];
  const skipped = [];
  let remainingRta = await rtaLedgerService.computeDerivedRta(db, userId);

  await runBudgetTransaction(db, async () => {
    for (const gap of gaps) {
      const existingBackfill = await db.get(
        `SELECT 1 AS ok FROM budget_assignment_audit
         WHERE user_id = ?
           AND CAST(category_id AS TEXT) = CAST(? AS TEXT)
           AND month = ?
           AND LOWER(IFNULL(source, '')) IN ('legacy_backfill_v1', 'legacy_reconciliation_backfill')
         LIMIT 1`,
        [String(userId), gap.categoryId, gap.month]
      );
      if (existingBackfill?.ok && !opts.force) {
        skipped.push({ ...gap, reason: 'already_backfilled' });
        continue;
      }

      if (remainingRta <= 0.005 && !opts.ignoreRtaCap) {
        skipped.push({ ...gap, reason: 'rta_cap_reached' });
        continue;
      }

      let backfillAmount = gap.unauditedGap;
      if (!opts.ignoreRtaCap) {
        backfillAmount = roundMoney(Math.min(backfillAmount, remainingRta));
      }
      if (backfillAmount <= 0.005) {
        skipped.push({ ...gap, reason: 'zero_backfill_amount' });
        continue;
      }

      const previousAssigned = roundMoney(gap.newAssigned - backfillAmount);
      const newAssigned = gap.newAssigned;

      await recordAssignmentEvent(db, {
        userId,
        categoryId: gap.categoryId,
        monthKey: gap.month,
        previousAssigned,
        newAssigned,
        source: opts.source || LEGACY_BACKFILL_SOURCE,
        operationType: OPERATION_TYPE.LEGACY_RECONCILIATION_BACKFILL,
        createdByOperation: opts.createdByOperation || 'assignmentLedgerService.reconstructMissingLedgerEvents',
        createdByMigration: opts.migrationId || null,
        createdBySystem: 1,
        metadata: {
          verified: true,
          unauditedGap: gap.unauditedGap,
          backfillAmount,
          origin: 'projection_gap_reconstruction',
          migrationId: opts.migrationId || null,
        },
      });
      applied.push({ ...gap, backfillAmount });
      remainingRta = roundMoney(remainingRta - backfillAmount);
    }
  });

  await rtaLedgerService.syncPoolFromLedger(db, userId, { source: 'ledger_sync' });
  await db.run(
    `UPDATE user_budget_pool SET rta_ledger_authority = 1 WHERE user_id = ?`,
    [userId]
  );

  const identityAfter = await budgetIntegrityService.evaluateGlobalBudgetIdentity(db, userId, opts);

  if (applied.length > 0) {
    await db.run(
      `INSERT INTO budget_reconciliation_events (id, user_id, event_type, payload_json)
       VALUES (?, ?, 'assignment_ledger_reconstruction', ?)`,
      [
        crypto.randomUUID(),
        userId,
        JSON.stringify({
          migrationId: opts.migrationId || null,
          appliedCount: applied.length,
          skippedCount: skipped.length,
          totalGapClosed: roundMoney(applied.reduce((s, g) => s + (g.backfillAmount || g.unauditedGap), 0)),
          identityBefore: identityBefore.budgetInvariantDelta,
          identityAfter: identityAfter.budgetInvariantDelta,
        }),
      ]
    );
  }

  return {
    applied,
    skipped,
    identityBefore,
    identityAfter,
    readyToAssign: await rtaLedgerService.computeDerivedRta(db, userId),
  };
}

/**
 * Atomic assignment write: audit (truth) → RTA sync → projection cache.
 */
async function commitAssignmentWrite(db, userId, entry, writeFn) {
  const previousAssigned = roundMoney(entry.previousAssigned);
  const newAssigned = roundMoney(entry.newAssigned);
  const delta = roundMoney(newAssigned - previousAssigned);

  await assertSufficientRtaForAssignment(db, userId, delta, entry.opts || {});

  const { recordAssignmentEvent } = require('./budgetAssignmentAuditService.cjs');
  const rtaLedgerService = require('./rtaLedgerService.cjs');
  const readyToAssignPoolService = require('./readyToAssignPoolService.cjs');

  let auditRow = null;
  if (Math.abs(delta) >= 0.005) {
    auditRow = await recordAssignmentEvent(db, {
      userId,
      categoryId: entry.categoryId,
      monthKey: entry.monthKey,
      previousAssigned,
      newAssigned,
      source: entry.source || 'assign',
      operationType: mapAuditSourceToOperationType(entry.source || 'assign'),
      createdByUserId: entry.createdByUserId || userId,
      createdByOperation: entry.createdByOperation || 'assignmentLedgerService.commitAssignmentWrite',
      createdBySystem: entry.createdBySystem ? 1 : 0,
      metadata: entry.metadata,
    });
  }
  assertAuditMatchesProjection(auditRow, previousAssigned, newAssigned);

  if (!(entry.opts?.skipPoolAdjustment === true)) {
    if (await rtaLedgerService.isLedgerAuthorityEnabled(db, userId)) {
      await rtaLedgerService.syncPoolFromLedger(db, userId, { source: 'assignment_write' });
    } else {
      await readyToAssignPoolService.applyAssignmentPoolDelta(
        db,
        userId,
        previousAssigned,
        newAssigned,
        { skipPoolAdjustment: false }
      );
    }
  }

  return writeFn({ auditRow, previousAssigned, newAssigned, delta });
}

module.exports = {
  LEGACY_BACKFILL_SOURCE,
  LEGACY_BACKFILL_SOURCES,
  HEAL_AUDIT_SOURCES,
  sumAuditedPositiveForRow,
  assertSufficientRtaForAssignment,
  assertAuditMatchesProjection,
  findAssignmentProjectionGaps,
  reconstructMissingLedgerEvents,
  commitAssignmentWrite,
};
