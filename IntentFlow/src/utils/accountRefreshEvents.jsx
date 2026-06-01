/**
 * Keeps Cash Accounts, Linked Banks, and All Accounts register in sync after account changes.
 */

export const ACCOUNTS_UPDATED_EVENT = 'accounts-updated';
export const ACCOUNTS_CHANGED_EVENT = 'accounts-changed';

/** Notify all views that account metadata changed (create, delete, Plaid link, type change). */
export function notifyAccountsChanged(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACCOUNTS_UPDATED_EVENT, { detail }));
  window.dispatchEvent(new Event(ACCOUNTS_CHANGED_EVENT));
}

/**
 * Subscribe to account list changes (window events + Electron IPC when available).
 * @param {() => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribeAccountsChanged(callback) {
  if (typeof window === 'undefined') return () => {};

  const handler = () => callback();
  window.addEventListener(ACCOUNTS_UPDATED_EVENT, handler);
  window.addEventListener(ACCOUNTS_CHANGED_EVENT, handler);
  const unsubIpc = window.electronAPI?.onAccountsUpdated?.(handler);

  return () => {
    window.removeEventListener(ACCOUNTS_UPDATED_EVENT, handler);
    window.removeEventListener(ACCOUNTS_CHANGED_EVENT, handler);
    if (typeof unsubIpc === 'function') unsubIpc();
  };
}
