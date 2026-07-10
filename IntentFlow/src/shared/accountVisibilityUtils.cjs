/**
 * Which accounts appear in UI account sections (checking/savings, credit, loan).
 * Archived accounts are intentionally hidden after merge/replace; all others are listed.
 */

function normalizeAccountStatus(account) {
  return String(account?.account_status || 'active').trim().toLowerCase();
}

function isAccountArchived(account) {
  return normalizeAccountStatus(account) === 'archived';
}

/** True when the account should appear in a UI account section. */
function isAccountListedInUi(account) {
  if (!account) return false;
  return !isAccountArchived(account);
}

function isAccountInactive(account) {
  if (!account) return false;
  return account.is_active === 0 || account.is_active === false;
}

/** SQL fragment — requires accounts alias `a`. */
const SQL_ACCOUNT_LISTED_IN_UI =
  "(IFNULL(a.account_status, 'active') != 'archived')";

function filterListedAccounts(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(isAccountListedInUi);
}

module.exports = {
  normalizeAccountStatus,
  isAccountArchived,
  isAccountListedInUi,
  isAccountInactive,
  SQL_ACCOUNT_LISTED_IN_UI,
  filterListedAccounts,
};
