/**
 * Main-process helpers for budget cash totals (mirrors renderer cashAccountUtils.jsx).
 */

function normalizeAccountType(type) {
  return String(type ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
}

function isCashAccountType(account) {
  if (!account) return false;
  const t = normalizeAccountType(account.type);
  if (t === 'checking' || t === 'savings') return true;
  const savingsLike = ['money market', 'money_market', 'cd'];
  return savingsLike.includes(t);
}

function isAccountActive(account) {
  if (!account) return false;
  return account.is_active !== 0 && account.is_active !== false;
}

/** Hidden accounts remain in budget cash totals but are omitted from default UI lists. */
function isAccountHidden(account) {
  if (!account) return false;
  return account.is_hidden === 1 || account.is_hidden === true || account.is_hidden === '1';
}

function isOnBudgetCashAccount(account) {
  if (!account || !isCashAccountType(account)) return false;
  const category = String(account.account_type_category || 'budget').toLowerCase();
  if (category === 'tracking' || category === 'loan') return false;
  if (account.on_budget === 0 || account.on_budget === '0' || account.on_budget === false) {
    return false;
  }
  return true;
}

/**
 * accountService.getAccountsSummary returns a bare array; IPC wraps { success, data }.
 * @param {unknown} summary
 * @returns {object[]}
 */
function normalizeAccountsListFromSummary(summary) {
  if (!summary) return [];
  if (Array.isArray(summary)) return summary;
  if (summary && typeof summary === 'object' && Array.isArray(summary.data)) {
    return summary.data;
  }
  return [];
}

function getBudgetCashBalanceForAccount(account) {
  if (!account || !isCashAccountType(account)) return 0;
  const linked =
    account.plaid_linked === true ||
    account.plaid_account_id ||
    account.plaid_item_id;
  const reg = account.register_balance;
  if (linked && reg != null && Number.isFinite(Number(reg))) {
    return Number(reg);
  }
  const working = account.working_balance;
  if (working != null && Number.isFinite(Number(working))) {
    return Number(working);
  }
  return Number(account.balance) || 0;
}

/** Sum on-budget active checking + savings for global Ready to Assign (includes hidden accounts). */
function sumTotalBudgetCashFromSummary(summary) {
  const accounts = normalizeAccountsListFromSummary(summary);
  return accounts.reduce((sum, acc) => {
    if (!acc || !isAccountActive(acc)) return sum;
    if (acc.archived === 1 || acc.archived === true || acc.archived === '1') return sum;
    if (!isOnBudgetCashAccount(acc)) return sum;
    return sum + getBudgetCashBalanceForAccount(acc);
  }, 0);
}

module.exports = {
  normalizeAccountsListFromSummary,
  sumTotalBudgetCashFromSummary,
  getBudgetCashBalanceForAccount,
  isAccountActive,
  isAccountHidden,
  isOnBudgetCashAccount,
};
