/**
 * YNAB-inspired account balance engine.
 * Credit cards: balance is sum of transaction impacts (negative = debt).
 * Direction + positive amount is preferred; legacy signed amounts remain supported.
 */

const { CREDIT_OPENING_BALANCE_TYPE } = require('../shared/openingBalanceConstants.cjs');

const CREDIT_TYPES = new Set(['credit', 'credit_card', 'loan']);

function isDeleted(tx) {
  return tx?.is_deleted === 1 || tx?.is_deleted === true;
}

function isCleared(tx) {
  const c = tx?.is_cleared ?? tx?.cleared;
  return c === 1 || c === 2 || c === true;
}

function isReconciled(tx) {
  return tx?.is_reconciled === 1 || tx?.is_reconciled === true || tx?.is_cleared === 2;
}

function isSystemTransaction(tx) {
  return tx?.is_system === 1 || tx?.is_system === true;
}

function isCreditCardAccountType(type) {
  return CREDIT_TYPES.has(String(type || '').toLowerCase());
}

function isStartingBalanceTransaction(tx) {
  if (!tx || isDeleted(tx)) return false;
  if (String(tx.transaction_type || '') === CREDIT_OPENING_BALANCE_TYPE) return true;
  const payee = String(tx.payee || '').trim().toLowerCase();
  const description = String(tx.description || '').trim().toLowerCase();
  return (
    isSystemTransaction(tx) &&
    (payee === 'starting balance' || description === 'starting balance')
  );
}

/**
 * YNAB rule: one register row is exclusively inflow OR outflow (never both columns).
 * Returns non-negative magnitudes; at most one side is non-zero.
 */
function resolveTransactionDisplayColumns(tx) {
  if (!tx || isDeleted(tx)) {
    return { inflow: 0, outflow: 0 };
  }
  if (isStartingBalanceTransaction(tx)) {
    return { inflow: Math.abs(Number(tx.amount) || 0), outflow: 0 };
  }
  if (tx.direction === 'inflow') {
    return { inflow: Math.abs(Number(tx.amount) || 0), outflow: 0 };
  }
  if (tx.direction === 'outflow') {
    return { inflow: 0, outflow: Math.abs(Number(tx.amount) || 0) };
  }
  const amount = Number(tx.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return { inflow: 0, outflow: 0 };
  }
  if (amount < 0) {
    return { inflow: 0, outflow: Math.abs(amount) };
  }
  return { inflow: amount, outflow: 0 };
}

function transactionShowsDualLedgerColumns(tx) {
  const { inflow, outflow } = resolveTransactionDisplayColumns(tx);
  return inflow > 0 && outflow > 0;
}

/**
 * Normalize persisted ledger fields: direction + positive magnitude, or legacy signed amount.
 */
function normalizeTransactionLedgerFields(amount, direction = null) {
  if (direction === 'inflow' || direction === 'outflow') {
    return { amount: Math.abs(Number(amount) || 0), direction };
  }
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    return { amount: 0, direction: null };
  }
  const mag = Math.abs(n);
  if (n < 0) return { amount: mag, direction: 'outflow' };
  if (n > 0) return { amount: mag, direction: 'inflow' };
  return { amount: 0, direction: null };
}

/**
 * Reject direction-based rows that would render in both register columns.
 */
function validateExclusiveLedgerColumns({ amount, direction }) {
  if (direction !== 'inflow' && direction !== 'outflow') {
    return { valid: true };
  }
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    return {
      valid: false,
      code: 'INVALID_LEDGER_AMOUNT',
      message: 'Transaction amount must be a finite number',
    };
  }
  if (n < 0) {
    return {
      valid: false,
      code: 'DUAL_COLUMN_LEDGER_VIOLATION',
      message:
        'A transaction cannot be both inflow and outflow. Use direction with a positive amount magnitude.',
    };
  }
  return { valid: true };
}

function assertExclusiveLedgerColumns(fields) {
  const check = validateExclusiveLedgerColumns(fields);
  if (!check.valid) {
    const err = new Error(check.message);
    err.code = check.code;
    throw err;
  }
  return normalizeTransactionLedgerFields(fields.amount, fields.direction);
}

/**
 * Derive direction + positive magnitude from a transaction row.
 */
function getTransactionAmountAndDirection(tx) {
  if (tx?.direction === 'inflow' || tx?.direction === 'outflow') {
    return {
      amount: Math.abs(Number(tx.amount) || 0),
      direction: tx.direction,
    };
  }
  const amt = Number(tx?.amount) || 0;
  if (amt >= 0) return { amount: Math.abs(amt), direction: 'inflow' };
  return { amount: Math.abs(amt), direction: 'outflow' };
}

/**
 * Signed ledger impact for one transaction.
 * Legacy rows without direction: signed amount is the impact.
 */
function calculateTransactionImpact(tx, accountType) {
  if (!tx || isDeleted(tx)) return 0;

  if (tx.direction !== 'inflow' && tx.direction !== 'outflow') {
    const amt = Number(tx.amount);
    return Number.isFinite(amt) ? amt : 0;
  }

  const { amount, direction } = getTransactionAmountAndDirection(tx);
  if (amount === 0) return 0;

  const isCredit = isCreditCardAccountType(accountType);
  if (isCredit) {
    if (direction === 'outflow') {
      // Spending increases debt (balance moves more negative).
      return -amount;
    }
    // Inflow: payment reduces debt (+impact); opening debt is special (inflow display, negative impact).
    if (isStartingBalanceTransaction(tx)) {
      return -amount;
    }
    return amount;
  }
  return direction === 'inflow' ? amount : -amount;
}

/**
 * Whether the account already has a system starting-balance transaction.
 */
function hasSystemStartingTransaction(transactions) {
  return (transactions || []).some(
    (tx) => !isDeleted(tx) && isStartingBalanceTransaction(tx)
  );
}

function getInitialBalanceBase(account, transactions) {
  const mag = Math.abs(Number(account?.initial_balance) || 0);
  if (mag === 0) return 0;
  if (hasSystemStartingTransaction(transactions)) return 0;
  if (isCreditCardAccountType(account?.type)) return -mag;
  return mag;
}

/**
 * Compute three-tier balances from account metadata + transactions.
 */
function computeAccountBalances(account, transactions) {
  const active = (transactions || []).filter((tx) => !isDeleted(tx));
  const accountType = account?.type;

  let workingSum = 0;
  let clearedSum = 0;
  let unclearedSum = 0;

  for (const tx of active) {
    const impact = calculateTransactionImpact(tx, accountType);
    workingSum += impact;
    if (isCleared(tx)) clearedSum += impact;
    else unclearedSum += impact;
  }

  const base = getInitialBalanceBase(account, active);

  return {
    initial_balance: Number(account?.initial_balance) || 0,
    working_balance: base + workingSum,
    cleared_balance: base + clearedSum,
    uncleared_balance: unclearedSum,
    transaction_sum: workingSum,
    current_balance: base + workingSum,
  };
}

/**
 * Running balance after each transaction (ascending date order).
 */
function compareTransactionsChronologically(a, b) {
  const da = String(a?.date || '');
  const db = String(b?.date || '');
  if (da !== db) return da.localeCompare(db);

  const ca = String(a?.created_at || '');
  const cb = String(b?.created_at || '');
  if (ca !== cb) return ca.localeCompare(cb);

  const aId = Number(a?.id);
  const bId = Number(b?.id);
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
    return aId - bId;
  }
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), undefined, { numeric: true });
}

function computeTransactionsWithRunningBalance(account, transactions) {
  const active = (transactions || [])
    .filter((tx) => !isDeleted(tx))
    .slice()
    .sort(compareTransactionsChronologically);

  let running = getInitialBalanceBase(account, active);

  const withBalance = active.map((tx) => {
    running += calculateTransactionImpact(tx, account?.type);
    return { ...tx, running_balance: running };
  });

  return withBalance.reverse();
}

/**
 * Ledger fields for a new starting-balance system transaction.
 * Credit opening debt: inflow column (positive magnitude), negative balance impact.
 */
function buildStartingBalanceTransactionFields(accountType, initialBalanceAmount) {
  const mag = Math.abs(Number(initialBalanceAmount) || 0);
  if (mag === 0) {
    return { amount: 0, direction: 'inflow', signedAmount: 0 };
  }
  const signedAmount = isCreditCardAccountType(accountType) ? -mag : mag;
  return {
    amount: mag,
    direction: 'inflow',
    signedAmount,
  };
}

/**
 * @deprecated Prefer buildStartingBalanceTransactionFields for new rows.
 */
function signedStartingBalanceAmount(accountType, initialBalanceAmount) {
  return buildStartingBalanceTransactionFields(accountType, initialBalanceAmount).signedAmount;
}

/**
 * Sum of inflow/outflow magnitudes for invariant checks (credit-aware impacts).
 */
function sumTransactionImpacts(transactions, accountType) {
  return (transactions || [])
    .filter((tx) => !isDeleted(tx))
    .reduce((sum, tx) => sum + calculateTransactionImpact(tx, accountType), 0);
}

/**
 * I3 — balance must equal initial base + sum(transaction impacts).
 */
function validateAccountLedgerInvariant(account, transactions, { tolerance = 0.01 } = {}) {
  const active = (transactions || []).filter((tx) => !isDeleted(tx));
  const computed = computeAccountBalances(account, active);
  const base = getInitialBalanceBase(account, active);
  const impactSum = sumTransactionImpacts(active, account?.type);
  const expected = base + impactSum;
  const delta = Math.abs(computed.working_balance - expected);
  return {
    valid: delta <= tolerance,
    working_balance: computed.working_balance,
    expected,
    delta,
    impact_sum: impactSum,
    initial_base: base,
  };
}

/**
 * Validate whether a transaction would drive a non-credit account negative.
 */
function validateTransactionForAccountType(transaction, accountType, currentWorkingBalance) {
  if (isCreditCardAccountType(accountType)) {
    return { valid: true };
  }
  const impact = calculateTransactionImpact(transaction, accountType);
  const next = (Number(currentWorkingBalance) || 0) + impact;
  if (next < -0.005) {
    return {
      valid: false,
      warning: 'This transaction would make your account negative',
    };
  }
  return { valid: true };
}

module.exports = {
  isDeleted,
  isCleared,
  isReconciled,
  isSystemTransaction,
  isStartingBalanceTransaction,
  isCreditCardAccountType,
  resolveTransactionDisplayColumns,
  transactionShowsDualLedgerColumns,
  normalizeTransactionLedgerFields,
  validateExclusiveLedgerColumns,
  assertExclusiveLedgerColumns,
  getTransactionAmountAndDirection,
  calculateTransactionImpact,
  hasSystemStartingTransaction,
  getInitialBalanceBase,
  computeAccountBalances,
  computeTransactionsWithRunningBalance,
  buildStartingBalanceTransactionFields,
  signedStartingBalanceAmount,
  sumTransactionImpacts,
  validateAccountLedgerInvariant,
  validateTransactionForAccountType,
};
