/**
 * RTA ledger — Ready to Assign derived from auditable events, not administrative pool writes.
 *
 * RTA = Σ(RTA-affecting transaction credits) − Σ(assignment increases) + Σ(assignment decreases)
 *       − Σ(budget→tracking transfer outflows) [when tracked on transactions]
 */

const { roundMoney } = require('../../shared/readyToAssignEngine.cjs');

const ADMIN_SET_BLOCKED = 'RTA_ADMIN_SET_BLOCKED';

async function sumRtaTransactionCredits(db, userId) {
  const row = await db.get(
    `SELECT COALESCE(SUM(
       CASE
         WHEN IFNULL(t.is_deleted, 0) = 1 THEN 0
         WHEN t.transaction_type = 'OPENING_BALANCE' OR IFNULL(t.affects_rta, 0) = 1 THEN
           CASE
             WHEN t.direction = 'inflow' THEN ABS(COALESCE(t.amount, 0))
             WHEN t.direction = 'outflow' THEN -ABS(COALESCE(t.amount, 0))
             WHEN COALESCE(t.amount, 0) >= 0 THEN ABS(COALESCE(t.amount, 0))
             ELSE COALESCE(t.amount, 0)
           END
         WHEN (
           IFNULL(t.is_system, 0) = 1
           AND (
             LOWER(IFNULL(t.payee, '')) = 'starting balance'
             OR LOWER(IFNULL(t.description, '')) = 'starting balance'
           )
           AND a.id IS NOT NULL
         ) THEN ABS(COALESCE(t.amount, 0))
         ELSE 0
       END
     ), 0) AS net
     FROM transactions t
     LEFT JOIN accounts a ON CAST(a.id AS TEXT) = CAST(t.account_id AS TEXT)
     WHERE t.user_id = ?
       AND IFNULL(t.is_deleted, 0) = 0
       AND (
         t.transaction_type = 'OPENING_BALANCE'
         OR IFNULL(t.affects_rta, 0) = 1
         OR (
           IFNULL(t.is_system, 0) = 1
           AND (
             LOWER(IFNULL(t.payee, '')) = 'starting balance'
             OR LOWER(IFNULL(t.description, '')) = 'starting balance'
           )
           AND LOWER(IFNULL(a.type, '')) IN ('checking', 'savings')
           AND IFNULL(a.on_budget, 1) = 1
         )
       )`,
    [userId]
  );
  return roundMoney(Number(row?.net) || 0);
}

async function sumAssignmentPoolDeltas(db, userId) {
  const row = await db.get(
    `SELECT COALESCE(SUM(-amount_changed), 0) AS net
     FROM budget_assignment_audit
     WHERE user_id = ?`,
    [String(userId)]
  );
  return roundMoney(Number(row?.net) || 0);
}

/**
 * Derive RTA from ledger events (transactions + assignment audit).
 */
async function computeDerivedRta(db, userId) {
  if (!userId) return 0;
  const txNet = await sumRtaTransactionCredits(db, userId);
  const assignNet = await sumAssignmentPoolDeltas(db, userId);
  return roundMoney(txNet + assignNet);
}

async function isLedgerAuthorityEnabled(db, userId) {
  const row = await db.get(
    `SELECT rta_ledger_authority FROM user_budget_pool WHERE user_id = ?`,
    [userId]
  ).catch(() => null);
  if (!row) return false;
  return row?.rta_ledger_authority === 1 || row?.rta_ledger_authority === true;
}

/**
 * Sync persisted pool to ledger-derived balance (the only permitted full pool realignment).
 */
async function syncPoolFromLedger(db, userId, opts = {}) {
  const derived = await computeDerivedRta(db, userId);
  const readyToAssignPoolService = require('./readyToAssignPoolService.cjs');
  await readyToAssignPoolService.ensurePoolRow(db, userId);
  await db.run(
    `UPDATE user_budget_pool
     SET ready_to_assign_balance = ?,
         rta_ledger_authority = 1,
         pool_backfilled = 1,
         updated_at = datetime('now')
     WHERE user_id = ?`,
    [derived, userId]
  );
  return {
    readyToAssign: derived,
    synced: true,
    source: opts.source || 'ledger_sync',
  };
}

/**
 * Read RTA — uses ledger when authority flag is set, otherwise legacy pool row.
 */
async function getAuthoritativeRta(db, userId) {
  if (await isLedgerAuthorityEnabled(db, userId)) {
    return computeDerivedRta(db, userId);
  }
  const readyToAssignPoolService = require('./readyToAssignPoolService.cjs');
  return readyToAssignPoolService.getPoolBalance(db, userId);
}

function assertAdministrativeSetAllowed(opts = {}) {
  if (opts.allowAdministrative === true || opts.source === 'ledger_sync') {
    return;
  }
  if (process.env.INTENTFLOW_ALLOW_RTA_ADMIN_SET === '1') {
    return;
  }
  const err = new Error(
    'Direct RTA pool writes are disabled. Use ledger events (opening balance, assignments, income) ' +
      'or syncPoolFromLedger().'
  );
  err.code = ADMIN_SET_BLOCKED;
  throw err;
}

module.exports = {
  ADMIN_SET_BLOCKED,
  computeDerivedRta,
  sumRtaTransactionCredits,
  sumAssignmentPoolDeltas,
  syncPoolFromLedger,
  getAuthoritativeRta,
  isLedgerAuthorityEnabled,
  assertAdministrativeSetAllowed,
};
