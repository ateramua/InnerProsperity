/**
 * Canonical account type resolution for API + UI (manual and Plaid-linked).
 */

function normalizeAccountType(type) {
  return String(type ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
}

function isCreditLikeSubtype(subtype) {
  return (
    subtype === 'credit card' ||
    subtype === 'charge card' ||
    subtype.includes('credit card')
  );
}

function isLoanLikeSubtype(subtype) {
  return (
    subtype === 'mortgage' ||
    subtype === 'student' ||
    subtype === 'auto' ||
    subtype === 'personal' ||
    subtype === 'home equity' ||
    subtype.includes('loan')
  );
}

function isDepositoryLikeSubtype(subtype) {
  return (
    subtype === 'checking' ||
    subtype === 'savings' ||
    subtype === 'money market' ||
    subtype === 'cd' ||
    subtype === 'paypal' ||
    subtype === 'prepaid'
  );
}

/**
 * Resolve the IntentFlow account type used for routing and display.
 * Uses stored type, account_type_category, then Plaid metadata when present.
 */
function resolveDisplayAccountType(account) {
  if (!account) return 'other';

  const stored = normalizeAccountType(account.type);
  if (stored === 'credit' || stored === 'credit card' || stored === 'charge card') {
    return 'credit';
  }
  if (stored === 'loan') return 'loan';
  if (stored === 'checking' || stored === 'savings' || stored === 'investment') {
    return stored;
  }

  const plaidType = normalizeAccountType(account.plaid_account_type);
  const plaidSubtype = normalizeAccountType(account.plaid_account_subtype);

  if (plaidType === 'credit' || isCreditLikeSubtype(plaidSubtype)) {
    return 'credit';
  }
  if (plaidType === 'loan' || isLoanLikeSubtype(plaidSubtype)) {
    return 'loan';
  }
  if (plaidType === 'depository' || isDepositoryLikeSubtype(plaidSubtype)) {
    if (plaidSubtype === 'savings' || plaidSubtype === 'money market' || plaidSubtype === 'cd') {
      return 'savings';
    }
    return 'checking';
  }

  const category = normalizeAccountType(account.account_type_category);
  if (category === 'credit') return 'credit';
  if (category === 'loan') return 'loan';

  if (stored) return stored;
  return 'other';
}

const TYPE_LABELS = {
  checking: 'Checking',
  savings: 'Savings',
  credit: 'Credit Card',
  loan: 'Loan',
  investment: 'Investment',
  other: 'Other',
};

/** Canonical values stored in accounts.type (TEXT column). */
const ACCOUNT_TYPE_DEFINITIONS = Object.freeze([
  { value: 'checking', label: 'Checking Account', category: 'budget', group: 'cash' },
  { value: 'savings', label: 'Savings Account', category: 'budget', group: 'cash' },
  { value: 'credit', label: 'Credit Card', category: 'credit', group: 'other' },
  { value: 'loan', label: 'Loan', category: 'loan', group: 'other' },
  { value: 'investment', label: 'Investment', category: 'budget', group: 'other' },
  { value: 'other', label: 'Other', category: 'budget', group: 'other' },
]);

const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPE_DEFINITIONS.map((d) => d.value);

function formatAccountTypeLabel(type) {
  const key = resolveDisplayAccountType({ type });
  return TYPE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

/** Maps accounts.type → accounts.account_type_category */
function mapAccountTypeToCategory(type) {
  const t = normalizeAccountType(type);
  const def = ACCOUNT_TYPE_DEFINITIONS.find((d) => d.value === t);
  if (def) return def.category;
  if (t === 'credit') return 'credit';
  if (t === 'loan') return 'loan';
  return 'budget';
}

/** Normalize user/API input to a canonical accounts.type value. */
function coerceStoredAccountType(type) {
  const t = normalizeAccountType(type);
  if (ACCOUNT_TYPE_VALUES.includes(t)) return t;
  if (t === 'credit card' || t === 'charge card') return 'credit';
  return 'other';
}

/**
 * Options for Account Type select elements.
 * @param {{ cashOnly?: boolean }} opts — cashOnly: checking + savings only
 */
function getAccountTypeSelectOptions({ cashOnly = false } = {}) {
  const list = cashOnly
    ? ACCOUNT_TYPE_DEFINITIONS.filter((d) => d.group === 'cash')
    : ACCOUNT_TYPE_DEFINITIONS;
  return list.map((d) => ({ value: d.value, label: d.label, group: d.group }));
}

function isCashAccountTypeValue(type) {
  const t = coerceStoredAccountType(type);
  return t === 'checking' || t === 'savings';
}

module.exports = {
  normalizeAccountType,
  resolveDisplayAccountType,
  formatAccountTypeLabel,
  ACCOUNT_TYPE_DEFINITIONS,
  ACCOUNT_TYPE_VALUES,
  mapAccountTypeToCategory,
  coerceStoredAccountType,
  getAccountTypeSelectOptions,
  isCashAccountTypeValue,
};
