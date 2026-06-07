/**
 * Assigned (budgeted_amount) may only change through explicit user-intent flows.
 * Envelope refresh, sync, activity recompute, and background healers must never mutate Assigned.
 */

const { roundMoney } = require('../../shared/readyToAssignEngine.cjs');

/** Audit sources that represent an intentional user assignment action. */
const USER_INTENT_ASSIGNMENT_SOURCES = new Set([
  'assign',
  'delta_assign',
  'bulk_assign',
  'move_money',
  'move_money_undo',
  'fund_underfunded',
  'quick_assign',
  'unassign_month',
  'table_import',
  'budget_table_import',
  'consolidate_assignments',
  'reset_envelopes',
  'cc_payment_reserve',
  'transaction_import_cc_reserve',
]);

const BLOCKED_AUTOMATED_SOURCES = new Set([
  'heal_phantom_assign',
  'implicit_repair',
  'phantom_heal',
  'auto_heal',
  'sync',
  'plaid_sync',
]);

function normalizeAuditSource(source) {
  return String(source || 'assign').trim().toLowerCase();
}

function isUserIntentAssignmentSource(source) {
  const normalized = normalizeAuditSource(source);
  if (BLOCKED_AUTOMATED_SOURCES.has(normalized)) {
    return false;
  }
  return USER_INTENT_ASSIGNMENT_SOURCES.has(normalized);
}

/**
 * @param {{ auditSource?: string, userIntentAssignment?: boolean }} opts
 */
function assertUserIntentAssignmentChange(opts = {}) {
  if (opts.userIntentAssignment === true) {
    return;
  }
  const source = normalizeAuditSource(opts.auditSource);
  if (isUserIntentAssignmentSource(source)) {
    return;
  }
  const err = new Error(
    'Assigned amounts can only change through an explicit user assignment action.',
  );
  err.code = 'ASSIGNMENT_CHANGE_NOT_USER_INTENT';
  err.auditSource = source;
  throw err;
}

/**
 * @param {number} previousAssigned
 * @param {number} newAssigned
 * @param {{ auditSource?: string, userIntentAssignment?: boolean, allowUnchanged?: boolean }} opts
 */
function assertAssignedMutationAllowed(previousAssigned, newAssigned, opts = {}) {
  const prev = roundMoney(previousAssigned);
  const next = roundMoney(newAssigned);
  if (Math.abs(next - prev) <= 0.005) {
    return;
  }
  assertUserIntentAssignmentChange(opts);
}

/**
 * @param {{ userIntentAssignment?: boolean }} opts
 */
function requireUserIntentMaintenanceOperation(opts = {}) {
  if (opts.userIntentAssignment !== true) {
    const err = new Error(
      'This budget maintenance operation requires explicit user confirmation.',
    );
    err.code = 'ASSIGNMENT_MAINTENANCE_NOT_USER_INTENT';
    throw err;
  }
}

module.exports = {
  USER_INTENT_ASSIGNMENT_SOURCES,
  BLOCKED_AUTOMATED_SOURCES,
  isUserIntentAssignmentSource,
  assertUserIntentAssignmentChange,
  assertAssignedMutationAllowed,
  requireUserIntentMaintenanceOperation,
};
