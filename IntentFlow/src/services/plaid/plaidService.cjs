/**
 * Central Plaid client + helpers for IntentFlow (Electron main process).
 */
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

/** Plaid "development" uses the production API host with limited real-bank access. */
function resolvePlaidBasePath(env) {
  const normalized = String(env || 'sandbox').toLowerCase();
  if (normalized === 'development') {
    return PlaidEnvironments.production;
  }
  return PlaidEnvironments[normalized];
}

/** Human-readable message from Plaid API / axios errors. */
function formatPlaidApiError(error) {
  const data = error?.response?.data;
  if (data?.error_message) return String(data.error_message);
  if (data?.display_message) return String(data.display_message);
  return error?.message || 'Plaid request failed';
}

/** Products for /link/token/create — default transactions only until liabilities is approved in Dashboard. */
function getLinkTokenProducts() {
  const raw = process.env.PLAID_LINK_PRODUCTS || 'transactions';
  return [...new Set(raw.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean))];
}

function buildAccountFiltersForProducts(products) {
  const list = Array.isArray(products) ? products : [];
  const filters = {};
  const includesTransactions = list.includes('transactions');
  const includesLiabilities = list.includes('liabilities');

  if (includesTransactions || includesLiabilities) {
    filters.depository = {
      account_subtypes: ['checking', 'savings', 'money market', 'cd'],
    };
    filters.credit = {
      account_subtypes: ['credit card'],
    };
  }

  if (includesLiabilities) {
    filters.loan = {
      account_subtypes: ['mortgage', 'student', 'auto', 'personal', 'home equity'],
    };
  }

  return Object.keys(filters).length ? filters : undefined;
}

/** Strip tokens / account numbers from log messages. */
function redactPlaidLogMessage(message) {
  if (message == null) return '';
  let s = String(message);
  s = s.replace(/access[_-]?token['":\s]*[\w-]+/gi, 'access_token=[REDACTED]');
  s = s.replace(/\b\d{8,}\b/g, '[REDACTED]');
  return s;
}

function getPlaidConfig() {
  const env = process.env.PLAID_ENV || 'sandbox';
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const enabledFlag = process.env.PLAID_ENABLED;
  const enabled = enabledFlag === undefined || enabledFlag === '' || enabledFlag === 'true';
  const basePath = resolvePlaidBasePath(env);
  const configured = enabled && Boolean(clientId && secret && basePath);
  return { env, clientId, secret, configured, enabled, basePath };
}

function createPlaidClient() {
  const { env, clientId, secret, configured, basePath } = getPlaidConfig();
  if (!configured) {
    throw new Error(
      'Plaid is not configured. Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV (sandbox, development, or production) in your environment.'
    );
  }
  const configuration = new Configuration({
    basePath: basePath || resolvePlaidBasePath(env),
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });
  return new PlaidApi(configuration);
}

/** App convention: outflows negative, inflows positive (see monthlyBudgetService). */
function plaidAmountToAppAmount(plaidAmount) {
  if (plaidAmount == null || Number.isNaN(Number(plaidAmount))) return 0;
  return -Number(plaidAmount);
}

/**
 * Normalize Plaid account balance for internal storage.
 * Liabilities (credit, loan): negative in app. Assets: positive.
 */
function plaidBalanceToAppBalance(plaidAccount, rawBalance) {
  const value = Number(rawBalance) || 0;
  const type = String(plaidAccount?.type || '').toLowerCase();
  const subtype = normalizePlaidSubtype(plaidAccount?.subtype);
  if (type === 'credit' || type === 'loan' || isCreditLikeSubtype(subtype) || isLoanLikeSubtype(subtype)) {
    return value > 0 ? -Math.abs(value) : value;
  }
  return Math.abs(value);
}

function extractPlaidRawBalance(plaidAccount) {
  const balances = plaidAccount?.balances || {};
  const type = String(plaidAccount?.type || '').toLowerCase();
  if (type === 'credit' || type === 'loan') {
    if (balances.current != null) return balances.current;
    if (balances.available != null) return balances.available;
    return 0;
  }
  if (balances.current != null) return balances.current;
  if (balances.available != null) return balances.available;
  return 0;
}

function normalizePlaidSubtype(subtype) {
  return String(subtype || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
}

function isCreditLikeSubtype(subtype) {
  return (
    subtype === 'credit card' ||
    subtype === 'charge card' ||
    subtype === 'paypal' ||
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

function mapPlaidTypeToInternal(plaidAccount) {
  const type = String(plaidAccount?.type || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
  const subtype = normalizePlaidSubtype(plaidAccount?.subtype);

  if (type === 'credit' || isCreditLikeSubtype(subtype)) {
    return 'credit';
  }
  if (type === 'loan' || isLoanLikeSubtype(subtype)) {
    return 'loan';
  }
  if (type === 'depository' || isDepositoryLikeSubtype(subtype)) {
    if (subtype === 'savings' || subtype === 'money market' || subtype === 'cd') {
      return 'savings';
    }
    return 'checking';
  }
  if (type === 'credit card' || type === 'charge card') {
    return 'credit';
  }
  return 'other';
}

function mapInternalAccountTypeCategory(internalType) {
  if (internalType === 'credit') return 'credit';
  if (internalType === 'loan') return 'loan';
  return 'budget';
}

/** Category key for plaid_category_mappings (PFC preferred). */
function getPlaidCategoryKey(plaidTx) {
  const pfc = plaidTx.personal_finance_category;
  if (pfc?.primary) {
    return pfc.detailed ? `${pfc.primary}:${pfc.detailed}` : pfc.primary;
  }
  if (Array.isArray(plaidTx.category) && plaidTx.category.length) {
    return plaidTx.category.join(' > ');
  }
  if (typeof plaidTx.category === 'string' && plaidTx.category) {
    return plaidTx.category;
  }
  return null;
}

function buildAccountDisplayName(plaidAccount, institutionName) {
  const base = plaidAccount.name || plaidAccount.official_name || 'Account';
  const mask = plaidAccount.mask ? ` •••• ${plaidAccount.mask}` : '';
  if (institutionName) {
    return `${institutionName} — ${base}${mask}`;
  }
  return `${base}${mask}`;
}

function accountFingerprint(institutionId, plaidAccount) {
  const mask = plaidAccount.mask || '';
  const type = plaidAccount.type || '';
  const subtype = plaidAccount.subtype || '';
  return `${institutionId || 'unknown'}|${type}|${subtype}|${mask}`;
}

/** Plaid personal_finance_category or legacy category hints for transfers. */
function isPlaidTransferTransaction(plaidTx) {
  const primary = plaidTx?.personal_finance_category?.primary;
  if (primary === 'TRANSFER_IN' || primary === 'TRANSFER_OUT') return true;
  const detailed = plaidTx?.personal_finance_category?.detailed || '';
  if (detailed.includes('TRANSFER')) return true;
  if (plaidTx?.transaction_code === 'transfer') return true;
  return false;
}

function sanitizeLinkedItemRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    institution_id: row.institution_id,
    institution_name: row.institution_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_sync: row.last_sync,
    status: row.status || 'active',
    last_error: row.last_error || null,
    consent_expires_at: row.consent_expires_at || null,
  };
}

/** Default Link account filters — user still picks accounts via account_selection. */
const DEFAULT_ACCOUNT_FILTERS = {
  depository: {
    account_subtypes: ['checking', 'savings', 'money market', 'cd'],
  },
  credit: {
    account_subtypes: ['credit card'],
  },
  loan: {
    account_subtypes: ['mortgage', 'student', 'auto', 'personal', 'home equity'],
  },
};

/**
 * Build /link/token/create body for new or update Link sessions.
 * @param {string} clientUserId
 * @param {{ accessToken?: string, accountFilters?: object }} [options]
 */
function buildLinkTokenCreatePayload(clientUserId, options = {}) {
  const { env } = getPlaidConfig();
  const products = options.products || getLinkTokenProducts();
  const payload = {
    user: { client_user_id: String(clientUserId) },
    client_name: 'IntentFlow',
    products,
    country_codes: ['US'],
    language: 'en',
  };

  const accountFilters =
    options.accountFilters === null
      ? undefined
      : options.accountFilters || buildAccountFiltersForProducts(products);
  if (accountFilters) {
    payload.account_filters = accountFilters;
  }

  if (options.accessToken) {
    payload.access_token = options.accessToken;
  }

  const redirectUri = process.env.PLAID_REDIRECT_URI;
  if ((env === 'production' || env === 'development') && redirectUri) {
    payload.redirect_uri = redirectUri;
  }

  return payload;
}

module.exports = {
  getPlaidConfig,
  formatPlaidApiError,
  getLinkTokenProducts,
  buildAccountFiltersForProducts,
  redactPlaidLogMessage,
  createPlaidClient,
  plaidAmountToAppAmount,
  plaidBalanceToAppBalance,
  mapPlaidTypeToInternal,
  mapInternalAccountTypeCategory,
  extractPlaidRawBalance,
  normalizePlaidSubtype,
  isCreditLikeSubtype,
  isLoanLikeSubtype,
  getPlaidCategoryKey,
  buildAccountDisplayName,
  accountFingerprint,
  isPlaidTransferTransaction,
  sanitizeLinkedItemRow,
  buildLinkTokenCreatePayload,
  DEFAULT_ACCOUNT_FILTERS,
};
