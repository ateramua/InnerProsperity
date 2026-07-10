/**
 * Shared SQL fragments for which transactions count toward budget category activity.
 * Cleared/reconciled only; soft-deleted rows are excluded.
 */

/** Active (non-deleted) transaction rows. */
const SQL_TX_NOT_DELETED = 'IFNULL(t.is_deleted, 0) = 0';

/**
 * Only transactions on active accounts count toward budget activity (matches the
 * consolidated transaction register, which hides inactive/archived accounts).
 * Requires `accounts a` joined on `t.account_id`.
 */
const SQL_TX_ACTIVE_ACCOUNT =
  "(IFNULL(a.is_active, 1) != 0 AND IFNULL(a.account_status, 'active') = 'active')";

/**
 * Cleared for budget activity: matches register "cleared" semantics.
 * Pending/uncleared (is_cleared = 0) do not affect envelope activity until posted.
 */
const SQL_TX_CLEARED_FOR_BUDGET =
  '(IFNULL(t.is_cleared, 0) = 1 OR IFNULL(t.is_cleared, 0) = 2 OR IFNULL(t.is_reconciled, 0) = 1)';

const SQL_BUDGET_ACTIVITY_WHERE = `${SQL_TX_NOT_DELETED} AND ${SQL_TX_CLEARED_FOR_BUDGET} AND ${SQL_TX_ACTIVE_ACCOUNT}`;

/**
 * Spending magnitude for envelope activity (outflows). Honors direction + positive
 * amount rows (register convention) and legacy signed amounts.
 */
const SQL_TX_SPENDING_MAGNITUDE = `
  CASE
    WHEN IFNULL(t.is_transfer, 0) = 1 THEN 0
    WHEN t.direction = 'outflow' THEN ABS(t.amount)
    WHEN t.direction = 'inflow' THEN 0
    WHEN t.amount < 0 THEN ABS(t.amount)
    ELSE 0
  END`;

/**
 * Inflow/refund magnitude for envelope activity. Honors direction + positive amount rows.
 */
const SQL_TX_INFLOW_MAGNITUDE = `
  CASE
    WHEN IFNULL(t.is_transfer, 0) = 1 THEN 0
    WHEN t.direction = 'inflow' THEN ABS(t.amount)
    WHEN t.direction = 'outflow' THEN 0
    WHEN t.amount > 0 THEN t.amount
    ELSE 0
  END`;

/** Split-line spending uses parent direction when present. */
const SQL_SPLIT_SPENDING_MAGNITUDE = `
  CASE
    WHEN IFNULL(t.is_transfer, 0) = 1 THEN 0
    WHEN t.direction = 'outflow' THEN ts.amount
    WHEN t.direction = 'inflow' THEN 0
    WHEN t.amount < 0 THEN ts.amount
    ELSE 0
  END`;

const SQL_SPLIT_INFLOW_MAGNITUDE = `
  CASE
    WHEN IFNULL(t.is_transfer, 0) = 1 THEN 0
    WHEN t.direction = 'inflow' THEN ts.amount
    WHEN t.direction = 'outflow' THEN 0
    WHEN t.amount > 0 THEN ts.amount
    ELSE 0
  END`;

module.exports = {
  SQL_TX_NOT_DELETED,
  SQL_TX_ACTIVE_ACCOUNT,
  SQL_TX_CLEARED_FOR_BUDGET,
  SQL_BUDGET_ACTIVITY_WHERE,
  SQL_TX_SPENDING_MAGNITUDE,
  SQL_TX_INFLOW_MAGNITUDE,
  SQL_SPLIT_SPENDING_MAGNITUDE,
  SQL_SPLIT_INFLOW_MAGNITUDE,
};
