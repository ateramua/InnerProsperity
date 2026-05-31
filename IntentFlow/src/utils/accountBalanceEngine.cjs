/**
 * YNAB-inspired account balance engine.
 * Supports legacy signed amounts and optional direction + positive amount fields.
 */

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
    return direction === 'outflow' ? amount : -amount;
  }
  return direction === 'inflow' ? amount : -amount;
}

/**
 * Whether the account already has a system starting-balance transaction.
 */
function hasSystemStartingTransaction(transactions) {
  return (transactions || []).some(
    (tx) => !isDeleted(tx) && isSystemTransaction(tx)
  );
}

/**
 * Compute three-tier balances from account metadata + transactions.
 */
function computeAccountBalances(account, transactions) {
  const initialBalance = Number(account?.initial_balance) || 0;
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

  const includeInitial = !hasSystemStartingTransaction(active);
  const base = includeInitial ? initialBalance : 0;

  return {
    initial_balance: initialBalance,
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
function computeTransactionsWithRunningBalance(account, transactions) {
  const initialBalance = Number(account?.initial_balance) || 0;
  const active = (transactions || [])
    .filter((tx) => !isDeleted(tx))
    .slice()
    .sort((a, b) => {
      const da = String(a.date || '');
      const db = String(b.date || '');
      if (da !== db) return da.localeCompare(db);
      const ca = String(a.created_at || a.id || '');
      const cb = String(b.created_at || b.id || '');
      return ca.localeCompare(cb);
    });

  const includeInitial = !hasSystemStartingTransaction(active);
  let running = includeInitial ? initialBalance : 0;

  const withBalance = active.map((tx) => {
    running += calculateTransactionImpact(tx, account?.type);
    return { ...tx, running_balance: running };
  });

  return withBalance.reverse();
}

/**
 * Build signed amount for a starting-balance system transaction.
 */
function signedStartingBalanceAmount(accountType, initialBalanceAmount) {
  const mag = Math.abs(Number(initialBalanceAmount) || 0);
  if (mag === 0) return 0;
  if (isCreditCardAccountType(accountType)) {
    return -mag;
  }
  return mag;
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
  isCreditCardAccountType,
  getTransactionAmountAndDirection,
  calculateTransactionImpact,
  hasSystemStartingTransaction,
  computeAccountBalances,
  computeTransactionsWithRunningBalance,
  signedStartingBalanceAmount,
  validateTransactionForAccountType,
};
