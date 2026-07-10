/**
 * Shared constants for credit/cash opening balance ledger events.
 */

const STARTING_BALANCE_PAYEE = 'Starting Balance';
const STARTING_BALANCE_DESCRIPTION = 'Starting Balance';
const STARTING_BALANCE_MEMO = 'Opening Balance';

/** Plaid on-budget cash synthetic inflow (RTA-recognized). */
const OPENING_BALANCE_TYPE = 'OPENING_BALANCE';

/** Credit card register anchor — not budget-categorized, no RTA impact. */
const CREDIT_OPENING_BALANCE_TYPE = 'CREDIT_OPENING_BALANCE';

const OPENING_BALANCE_AUDIT_SOURCES = {
  MANUAL_ACCOUNT_CREATE: 'manual_account_create',
  PLAID_LINK: 'plaid_link',
  USER_EDIT: 'user_edit',
  HISTORICAL_IMPORT_RECONCILE: 'historical_import_reconcile',
  SYSTEM_REPAIR: 'system_repair',
};

module.exports = {
  STARTING_BALANCE_PAYEE,
  STARTING_BALANCE_DESCRIPTION,
  STARTING_BALANCE_MEMO,
  OPENING_BALANCE_TYPE,
  CREDIT_OPENING_BALANCE_TYPE,
  OPENING_BALANCE_AUDIT_SOURCES,
};
