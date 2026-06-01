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
  return Number(account.balance) || 0;
}

/** Sum on-budget active checking + savings for global Ready to Assign. */
function sumTotalBudgetCashFromSummary(summary) {
  const accounts = normalizeAccountsListFromSummary(summary);
  return accounts.reduce((sum, acc) => {
    if (!acc || !isAccountActive(acc)) return sum;
    if (acc.archived === 1 || acc.archived === true || acc.archived === '1') return sum;
    if (acc.on_budget === 0 || acc.on_budget === '0' || acc.on_budget === false) return sum;
    if (!isCashAccountType(acc)) return sum;
    return sum + getBudgetCashBalanceForAccount(acc);
  }, 0);
}

module.exports = {
  normalizeAccountsListFromSummary,
  sumTotalBudgetCashFromSummary,
  getBudgetCashBalanceForAccount,
};
