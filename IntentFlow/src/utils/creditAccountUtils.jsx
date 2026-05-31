/**
 * Credit card account helpers — permanent delete + shared UI messaging.
 *
 * Listing UI: Credit Card Manager only ({@link loadCreditCardsViaApi}).
 * Sidebar must not enumerate credit accounts — see sidebarAccountUtils.cjs.
 */
import { normalizeAccountId } from './cashAccountUtils.jsx';

export {
  resolveDisplayAccountType,
  formatAccountTypeLabel,
} from './accountTypeUtils.cjs';

import { resolveDisplayAccountType } from './accountTypeUtils.cjs';

export function isCreditAccountType(account) {
  return resolveDisplayAccountType(account) === 'credit';
}

export function filterCreditAccounts(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((account) => account && isCreditAccountType(account));
}

export async function loadCreditCardsViaApi() {
  if (!window.electronAPI?.getCurrentUser || !window.electronAPI?.getAccountsSummary) {
    return { success: false, error: 'Account service is not available', data: [] };
  }
  const userResult = await window.electronAPI.getCurrentUser();
  if (!userResult?.success || !userResult?.data?.id) {
    return { success: false, error: 'Please log in to view credit cards', data: [] };
  }
  const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
  if (!accountsResult?.success) {
    return {
      success: false,
      error: accountsResult?.error || 'Failed to load credit cards',
      data: [],
    };
  }
  return {
    success: true,
    data: filterCreditAccounts(accountsResult.data || []),
  };
}

export function getCreditAccountDeleteConfirmMessage(account) {
  const name = account?.name || 'this credit card';
  const plaidSynced = String(account?.source || 'manual').toLowerCase() === 'plaid';
  if (plaidSynced) {
    return (
      `Permanently delete "${name}"?\n\n` +
      `This removes the card from IntentFlow, deletes its transactions, and stops Plaid from re-adding it. ` +
      `Your bank connection stays active for other accounts at this institution. This cannot be undone.`
    );
  }
  return (
    `Permanently delete "${name}"?\n\n` +
    `This removes the credit card and all of its transactions from IntentFlow. This cannot be undone.`
  );
}

export async function permanentlyDeleteCreditAccountViaApi(accountOrId) {
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
  // Dedicated channel when available; accounts:delete routes credit → permanent delete in main.
  const deleteFn =
    window.electronAPI.permanentlyDeleteCreditAccount ||
    window.electronAPI.deleteAccount;
  if (!deleteFn) {
    return { success: false, error: 'Account delete is not available' };
  }

  return deleteFn(id, userId);
}

export function formatCreditDeleteError(result) {
  if (!result) return 'Unknown error';
  return result.error || 'Delete failed';
}
