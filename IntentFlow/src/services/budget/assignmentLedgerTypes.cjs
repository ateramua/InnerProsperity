/**
 * Assignment event operation types (write-model vocabulary).
 */

const OPERATION_TYPE = Object.freeze({
  ASSIGNMENT_CREATED: 'AssignmentCreated',
  ASSIGNMENT_UPDATED: 'AssignmentUpdated',
  ASSIGNMENT_REMOVED: 'AssignmentRemoved',
  MOVE_MONEY: 'MoveMoney',
  FUND_UNDERFUNDED: 'FundUnderfunded',
  CC_RESERVE_TRANSFER: 'CCReserveTransfer',
  LEGACY_RECONCILIATION_BACKFILL: 'LegacyReconciliationBackfill',
});

const LEGACY_BACKFILL_V1 = 'legacy_backfill_v1';

function mapAuditSourceToOperationType(source) {
  const s = String(source || '').trim().toLowerCase();
  if (s === 'fund_underfunded') return OPERATION_TYPE.FUND_UNDERFUNDED;
  if (s === 'move_money' || s === 'move_money_undo') return OPERATION_TYPE.MOVE_MONEY;
  if (s === 'cc_payment_reserve' || s === 'transaction_import_cc_reserve') {
    return OPERATION_TYPE.CC_RESERVE_TRANSFER;
  }
  if (s.includes('unassign')) return OPERATION_TYPE.ASSIGNMENT_REMOVED;
  if (s === 'legacy_reconciliation_backfill' || s === LEGACY_BACKFILL_V1) {
    return OPERATION_TYPE.LEGACY_RECONCILIATION_BACKFILL;
  }
  return OPERATION_TYPE.ASSIGNMENT_UPDATED;
}

module.exports = {
  OPERATION_TYPE,
  LEGACY_BACKFILL_V1,
  mapAuditSourceToOperationType,
};
