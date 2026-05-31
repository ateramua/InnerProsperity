/**
 * Account Detail register balance — delegates to the balance engine.
 */

import {
  computeAccountBalances,
  calculateTransactionImpact,
} from './accountBalanceEngine.jsx';

export function isPlaidLinkedAccount(account) {
  if (!account) return false;
  if (account.balance_locked === true || account.balance_locked === 1) return false;
  if (account.sync_enabled === false || account.sync_enabled === 0) return false;
  return (
    Boolean(account.plaid_linked) ||
    String(account.source || '').toLowerCase() === 'plaid'
  );
}

/** Sum active transaction impacts for the register total. */
export function computeRegisterBalanceFromTransactions(transactions, accountType = null) {
  if (!Array.isArray(transactions)) return 0;
  if (accountType) {
    const balances = computeAccountBalances({ type: accountType, initial_balance: 0 }, transactions);
    return balances.working_balance;
  }
  return transactions.reduce((sum, tx) => {
    if (tx?.is_deleted === 1 || tx?.is_deleted === true) return sum;
    const amount = Number(tx?.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

/**
 * Compute three-tier balances for an account from its transactions.
 */
export function computeRegisterBalances(account, transactions) {
  return computeAccountBalances(account, transactions);
}

/**
 * Balance to show on Account Detail (header, alerts, available credit).
 */
export function getAccountDetailDisplayBalance(account, allTransactions, registerBalance = null) {
  if (!account) return 0;
  if (registerBalance != null && Number.isFinite(Number(registerBalance))) {
    return Number(registerBalance);
  }
  if (Array.isArray(allTransactions) && allTransactions.length > 0) {
    const balances = computeAccountBalances(account, allTransactions);
    return balances.working_balance;
  }
  return Number(account.working_balance ?? account.balance) || 0;
}

/** Merge register balance into account object for local UI state only. */
export function withRegisterDisplayBalance(account, registerBalance) {
  if (!account || registerBalance == null || !Number.isFinite(Number(registerBalance))) {
    return account;
  }
  const bal = Number(registerBalance);
  if (isPlaidLinkedAccount(account)) {
    return { ...account, working_balance: bal };
  }
  return { ...account, balance: bal, working_balance: bal };
}

export { calculateTransactionImpact };
