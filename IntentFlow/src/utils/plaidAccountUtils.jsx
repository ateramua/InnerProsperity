/** True when UI should show bank-linked badge / manage connection. */
export function isPlaidLinkedAccount(account) {
  if (!account) return false;
  if (account.plaid_linked) return true;
  return String(account.source || 'manual').toLowerCase() === 'plaid';
}

/** True when balance/metadata is actively synced from Plaid. */
export function isPlaidSyncedAccount(account) {
  if (!account) return false;
  return String(account.source || 'manual').toLowerCase() === 'plaid';
}

export { isCashAccountType, isSavingsType, isCheckingType } from './cashAccountUtils';

/** Account still has a row in plaid_accounts (can unlink without removing the bank item). */
export function hasPlaidAccountBridge(account) {
  return Boolean(account?.plaid_linked);
}

/** Fields that must not be edited locally for Plaid-linked accounts. */
export const PLAID_SYNCED_ACCOUNT_FIELDS = [
  'balance',
  'cleared_balance',
  'working_balance',
  'credit_limit',
  'limit',
  'original_balance',
  'name',
  'type',
  'account_type_category',
  'institution',
  'external_mask',
];
