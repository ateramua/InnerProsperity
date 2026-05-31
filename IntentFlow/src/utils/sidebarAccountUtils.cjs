/**
 * Sidebar navigation policy — which accounts may appear as per-account rows in the nav.
 *
 * Credit cards (manual and Plaid) are listed only in Credit Card Manager, not under
 * the sidebar "Credit Cards" section (Dashboard / Planner / Add only).
 */

function normalizeType(type) {
  return String(type ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
}

function isCreditAccountType(account) {
  const stored = normalizeType(account?.type);
  if (stored === 'credit' || stored === 'credit card' || stored === 'charge card') {
    return true;
  }
  const plaidType = normalizeType(account?.plaid_account_type);
  const plaidSubtype = normalizeType(account?.plaid_account_subtype);
  if (plaidType === 'credit' || plaidSubtype === 'credit card' || plaidSubtype === 'charge card') {
    return true;
  }
  return false;
}

/** Account types that must never render as sidebar account rows. */
const SIDEBAR_EXCLUDED_ACCOUNT_TYPES = Object.freeze(['credit', 'loan']);

/**
 * @param {object} account
 * @returns {boolean} true if this account may appear as a sidebar sub-item row
 */
function shouldShowAccountInSidebar(account) {
  if (!account) return false;
  if (isCreditAccountType(account)) return false;
  if (normalizeType(account?.type) === 'loan') return false;
  // Checking/savings use Cash Accounts / All Accounts views, not sidebar rows.
  const t = normalizeType(account?.type);
  if (t === 'checking' || t === 'savings') return false;
  return false;
}

function filterAccountsForSidebarEntries(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((account) => shouldShowAccountInSidebar(account));
}

module.exports = {
  SIDEBAR_EXCLUDED_ACCOUNT_TYPES,
  shouldShowAccountInSidebar,
  filterAccountsForSidebarEntries,
  isCreditAccountType,
};
