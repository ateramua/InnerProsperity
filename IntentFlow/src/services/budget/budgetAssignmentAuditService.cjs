/**
 * Persists assignment change audit rows (spec: IntentFlow Budgeting Engine §9).
 * Authoritative write-model for assignment events; monthly_budgets is a projection.
 */

const crypto = require('crypto');
const { roundMoney, normalizeMonthKey } = require('../../shared/readyToAssignEngine.cjs');
const { mapAuditSourceToOperationType, OPERATION_TYPE } = require('./assignmentLedgerTypes.cjs');

const toLocalMonthKey = normalizeMonthKey;

let provenanceColumnsReady = null;

async function hasProvenanceColumns(db) {
  if (provenanceColumnsReady != null) return provenanceColumnsReady;
  const cols = await db.all('PRAGMA table_info(budget_assignment_audit)');
  provenanceColumnsReady = cols.some((c) => c.name === 'operation_type');
  return provenanceColumnsReady;
}

/**
 * @param {import('sqlite').Database} db
 * @param {{
 *   userId: string,
 *   categoryId: string,
 *   monthKey: string,
 *   previousAssigned: number,
 *   newAssigned: number,
 *   source?: string,
 *   operationType?: string,
 *   createdByUserId?: string,
 *   createdByOperation?: string,
 *   createdByMigration?: string,
 *   createdBySystem?: boolean|number,
 *   metadata?: object,
 * }} entry
 */
async function recordBudgetAssignmentAudit(db, entry) {
  const userId = entry?.userId;
  const categoryId = entry?.categoryId;
  if (!userId || categoryId == null) return null;

  const previousAssigned = roundMoney(entry.previousAssigned);
  const newAssigned = roundMoney(entry.newAssigned);
  const amountChanged = roundMoney(newAssigned - previousAssigned);
  if (Math.abs(amountChanged) < 0.005) return null;

  const month = toLocalMonthKey(entry.monthKey || new Date());
  const metadata =
    entry.metadata != null ? JSON.stringify(entry.metadata) : null;
  const source = entry.source || 'assign';
  const operationType =
    entry.operationType || mapAuditSourceToOperationType(source);

  const id = crypto.randomUUID();
  const withProvenance = await hasProvenanceColumns(db);

  if (withProvenance) {
    await db.run(
      `INSERT INTO budget_assignment_audit (
        id, user_id, category_id, month,
        previous_assigned, new_assigned, amount_changed,
        source, metadata, created_at,
        operation_type, created_by_user_id, created_by_operation,
        created_by_migration, created_by_system
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        categoryId,
        month,
        previousAssigned,
        newAssigned,
        amountChanged,
        source,
        metadata,
        operationType,
        entry.createdByUserId || null,
        entry.createdByOperation || null,
        entry.createdByMigration || null,
        entry.createdBySystem ? 1 : 0,
      ]
    );
  } else {
    await db.run(
      `INSERT INTO budget_assignment_audit (
        id, user_id, category_id, month,
        previous_assigned, new_assigned, amount_changed,
        source, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        id,
        userId,
        categoryId,
        month,
        previousAssigned,
        newAssigned,
        amountChanged,
        source,
        metadata,
      ]
    );
  }

  return {
    id,
    userId,
    categoryId,
    month,
    previousAssigned,
    newAssigned,
    amountChanged,
    source,
    operationType,
  };
}

/** Alias for event-sourced assignment ledger writes. */
const recordAssignmentEvent = recordBudgetAssignmentAudit;

/**
 * @param {import('sqlite').Database} db
 * @param {string} userId
 * @param {{ limit?: number, categoryId?: string, monthKey?: string }} [opts]
 */
async function getBudgetAssignmentAuditLog(db, userId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const params = [userId];
  let sql = `
    SELECT a.*, c.name AS category_name
    FROM budget_assignment_audit a
    LEFT JOIN categories c ON CAST(c.id AS TEXT) = CAST(a.category_id AS TEXT)
    WHERE a.user_id = ?
  `;

  if (opts.categoryId != null) {
    sql += ' AND CAST(a.category_id AS TEXT) = CAST(? AS TEXT)';
    params.push(opts.categoryId);
  }
  if (opts.monthKey != null) {
    sql += ' AND a.month = ?';
    params.push(toLocalMonthKey(opts.monthKey));
  }

  sql += ' ORDER BY a.created_at DESC LIMIT ?';
  params.push(limit);

  const rows = await db.all(sql, params);
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    categoryName: row.category_name || null,
    month: row.month,
    previousAssigned: roundMoney(row.previous_assigned),
    newAssigned: roundMoney(row.new_assigned),
    amountChanged: roundMoney(row.amount_changed),
    source: row.source,
    metadata: row.metadata ? safeParseJson(row.metadata) : null,
    createdAt: row.created_at,
  }));
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

module.exports = {
  recordBudgetAssignmentAudit,
  recordAssignmentEvent,
  getBudgetAssignmentAuditLog,
};
