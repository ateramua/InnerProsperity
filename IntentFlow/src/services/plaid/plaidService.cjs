/**
 * Central Plaid client + helpers for IntentFlow (Electron main process).
 */
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

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
  const configured = enabled && Boolean(clientId && secret && PlaidEnvironments[env]);
  return { env, clientId, secret, configured, enabled };
}

function createPlaidClient() {
  const { env, clientId, secret, configured } = getPlaidConfig();
  if (!configured) {
    throw new Error(
      'Plaid is not configured. Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV in your environment.'
    );
  }
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
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
  const type = plaidAccount?.type;
  if (type === 'credit' || type === 'loan') {
    return value > 0 ? -Math.abs(value) : value;
  }
  return Math.abs(value);
}

function mapPlaidTypeToInternal(plaidAccount) {
  if (plaidAccount.type === 'depository') {
    return plaidAccount.subtype === 'savings' ? 'savings' : 'checking';
  }
  if (plaidAccount.type === 'credit') return 'credit';
  if (plaidAccount.type === 'loan') return 'loan';
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
  const payload = {
    user: { client_user_id: String(clientUserId) },
    client_name: 'IntentFlow',
    products: ['transactions', 'liabilities'],
    country_codes: ['US'],
    language: 'en',
    account_filters: options.accountFilters || DEFAULT_ACCOUNT_FILTERS,
  };

  if (!options.accessToken) {
    payload.account_selection = { enabled: true };
  }

  if (options.accessToken) {
    payload.access_token = options.accessToken;
  }

  const redirectUri = process.env.PLAID_REDIRECT_URI;
  if (env === 'production' && redirectUri) {
    payload.redirect_uri = redirectUri;
  }

  return payload;
}

module.exports = {
  getPlaidConfig,
  redactPlaidLogMessage,
  createPlaidClient,
  plaidAmountToAppAmount,
  plaidBalanceToAppBalance,
  mapPlaidTypeToInternal,
  mapInternalAccountTypeCategory,
  getPlaidCategoryKey,
  buildAccountDisplayName,
  accountFingerprint,
  isPlaidTransferTransaction,
  sanitizeLinkedItemRow,
  buildLinkTokenCreatePayload,
  DEFAULT_ACCOUNT_FILTERS,
};
