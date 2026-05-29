/**
 * Loan account helpers — permanent delete + shared UI messaging.
 */
import { normalizeAccountId } from './cashAccountUtils.jsx';
import { resolveDisplayAccountType } from './creditAccountUtils.jsx';

export function isLoanAccountType(account) {
  return resolveDisplayAccountType(account) === 'loan';
}

export function filterLoanAccounts(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((account) => account && isLoanAccountType(account));
}

export async function loadLoansViaApi() {
  if (!window.electronAPI?.getCurrentUser || !window.electronAPI?.getAccountsSummary) {
    return { success: false, error: 'Account service is not available', data: [] };
  }
  const userResult = await window.electronAPI.getCurrentUser();
  if (!userResult?.success || !userResult?.data?.id) {
    return { success: false, error: 'Please log in to view loans', data: [] };
  }
  const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
  if (!accountsResult?.success) {
    return {
      success: false,
      error: accountsResult?.error || 'Failed to load loans',
      data: [],
    };
  }
  return {
    success: true,
    data: filterLoanAccounts(accountsResult.data || []),
  };
}

export function getLoanAccountDeleteConfirmMessage(account) {
  const name = account?.name || 'this loan';
  const plaidSynced = String(account?.source || 'manual').toLowerCase() === 'plaid';
  if (plaidSynced) {
    return (
      `Permanently delete "${name}"?\n\n` +
      `This removes the loan from IntentFlow, deletes its transactions, and stops Plaid from re-adding it. ` +
      `Your bank connection stays active for other accounts at this institution. This cannot be undone.`
    );
  }
  return (
    `Permanently delete "${name}"?\n\n` +
    `This removes the loan and all of its transactions from IntentFlow. This cannot be undone.`
  );
}

export async function permanentlyDeleteLoanAccountViaApi(accountOrId) {
  const id = normalizeAccountId(
    typeof accountOrId === 'string' ? accountOrId : accountOrId?.id
  );
  if (!id) {
    return { success: false, error: 'Invalid account id' };
  }
  if (!window.electronAPI?.getCurrentUser) {
    return { success: false, error: 'Account service is not available' };
  }

  const userResult = await window.electronAPI.getCurrentUser();
  if (!userResult?.success || !userResult?.data?.id) {
    return { success: false, error: 'You must be logged in' };
  }

  const userId = userResult.data.id;
  const deleteFn =
    window.electronAPI.permanentlyDeleteLoanAccount ||
    window.electronAPI.deleteAccount;
  if (!deleteFn) {
    return { success: false, error: 'Account delete is not available' };
  }

  return deleteFn(id, userId);
}

export function formatLoanDeleteError(result) {
  if (!result) return 'Unknown error';
  return result.error || 'Delete failed';
}
