/**
 * Shared checking/savings account helpers — single source of truth for Cash Accounts UI + delete.
 */

export const CASH_ACCOUNT_TYPES = Object.freeze(['checking', 'savings']);

/** Depository subtypes we treat as savings in the cash accounts view. */
export const SAVINGS_LIKE_TYPES = Object.freeze([
  'savings',
  'money market',
  'money_market',
  'cd',
]);

export function normalizeAccountType(type) {
  return String(type ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
}

export function isCheckingType(typeOrAccount) {
  const t = normalizeAccountType(
    typeof typeOrAccount === 'string' ? typeOrAccount : typeOrAccount?.type
  );
  return t === 'checking';
}

export function isSavingsType(typeOrAccount) {
  const t = normalizeAccountType(
    typeof typeOrAccount === 'string' ? typeOrAccount : typeOrAccount?.type
  );
  return t === 'savings' || SAVINGS_LIKE_TYPES.includes(t);
}

export function isCashAccountType(typeOrAccount) {
  return isCheckingType(typeOrAccount) || isSavingsType(typeOrAccount);
}

export function isAccountActive(account) {
  if (!account) return false;
  return account.is_active !== 0 && account.is_active !== false;
}

/** @deprecated Use isAccountActive */
export const isCashAccountActive = isAccountActive;

export function normalizeAccountId(id) {
  return id == null ? '' : String(id);
}

/** Active accounts only (excludes soft-deleted). */
export function filterActiveAccounts(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((a) => a && isAccountActive(a));
}

/** Active checking + savings (and savings-like types) for the cash accounts page. */
export function filterActiveCashAccounts(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((a) => a && isAccountActive(a) && isCashAccountType(a));
}

export function partitionCashAccounts(list) {
  const active = filterActiveCashAccounts(list);
  const checking = [];
  const savings = [];
  for (const account of active) {
    if (isCheckingType(account)) {
      checking.push(account);
    } else if (isSavingsType(account)) {
      savings.push(account);
    }
  }
  return { checking, savings, all: active };
}

export function getCashAccountDeleteConfirmMessage(accountName, account) {
  const plaidSynced =
    account && String(account.source || 'manual').toLowerCase() === 'plaid';
  if (plaidSynced) {
    return (
      `Remove "${accountName}" from your account list?\n\n` +
      `This stops syncing this account from Plaid. Your bank connection stays active for other accounts. Past transactions are kept.`
    );
  }
  return (
    `Are you sure you want to delete "${accountName}"?\n\n` +
    `The account will be removed from your list. Past transactions are kept.`
  );
}

/** Confirm text for any account type (All Accounts, modals, etc.). */
export function getAccountDeleteConfirmMessage(account) {
  if (!account) {
    return 'Remove this account from your list? Past transactions are kept.';
  }
  const name = account.name || 'this account';
  if (isCashAccountType(account)) {
    return getCashAccountDeleteConfirmMessage(name, account);
  }
  const plaidSynced = String(account.source || 'manual').toLowerCase() === 'plaid';
  if (plaidSynced) {
    return (
      `Remove "${name}" from your account list?\n\n` +
      `This account is linked via Plaid. Open Linked Banks to remove the bank connection, or hide manual accounts from Cash Accounts.`
    );
  }
  const type = normalizeAccountType(account.type);
  const typeLabel =
    type === 'credit'
      ? 'credit card'
      : type === 'loan'
        ? 'loan'
        : type === 'investment'
          ? 'investment'
          : 'account';
  return (
    `Remove "${name}" from your ${typeLabel} list?\n\n` +
    `The account will be hidden in the app. Past transactions are kept.`
  );
}

export function formatAccountDeleteError(result) {
  if (!result) return 'Unknown error';
  if (result.code === 'PLAID_ACCOUNT_DELETE_BLOCKED') {
    return 'This account is linked via Plaid. Use Linked Banks to manage the connection.';
  }
  return result.error || 'Delete failed';
}

/**
 * Unified soft-delete for any account type (same IPC as Cash Accounts).
 * @param {object|string} accountOrId — account row or id (object preferred for confirm copy)
 */
export async function deleteAccountViaApi(accountOrId) {
  const id = normalizeAccountId(
    typeof accountOrId === 'string' ? accountOrId : accountOrId?.id
  );
  if (!id) {
    return { success: false, error: 'Invalid account id' };
  }
  if (!window.electronAPI?.deleteAccount || !window.electronAPI?.getCurrentUser) {
    return { success: false, error: 'Account service is not available' };
  }

  const userResult = await window.electronAPI.getCurrentUser();
  if (!userResult?.success || !userResult?.data?.id) {
    return { success: false, error: 'You must be logged in' };
  }

  return window.electronAPI.deleteAccount(id, userResult.data.id);
}

/** Checking/savings delete — delegates to deleteAccountViaApi. */
export async function deleteCashAccountViaApi(account) {
  if (!isCashAccountType(account)) {
    return { success: false, error: 'Not a checking or savings account' };
  }
  return deleteAccountViaApi(account);
}

export async function loadAllAccountsViaApi() {
  if (!window.electronAPI?.getCurrentUser || !window.electronAPI?.getAccountsSummary) {
    return { success: false, error: 'Account service is not available', data: [] };
  }
  const userResult = await window.electronAPI.getCurrentUser();
  if (!userResult?.success || !userResult?.data?.id) {
    return { success: false, error: 'Please log in to view accounts', data: [] };
  }
  const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
  if (!accountsResult?.success) {
    return {
      success: false,
      error: accountsResult?.error || 'Failed to load accounts',
      data: [],
    };
  }
  return {
    success: true,
    data: filterActiveAccounts(accountsResult.data || []),
  };
}

export async function loadCashAccountsViaApi() {
  const result = await loadAllAccountsViaApi();
  if (!result.success) return result;
  return {
    success: true,
    data: filterActiveCashAccounts(result.data || []),
  };
}
