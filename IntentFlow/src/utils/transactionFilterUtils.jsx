/**
 * Search, filter, and recent-range helpers for transaction lists.
 */

export const RECENT_RANGE_OPTIONS = [
  { id: '7', label: 'Last 7 Days', days: 7 },
  { id: '30', label: 'Last 30 Days', days: 30 },
  { id: '90', label: 'Last 90 Days', days: 90 },
  { id: '180', label: 'Last 6 Months', days: 180 },
  { id: 'all', label: 'All Transactions', days: null },
];

export const DATE_PRESET_OPTIONS = [
  { id: '', label: 'Custom / none' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'last30', label: 'Last 30 Days' },
  { id: 'last90', label: 'Last 90 Days' },
  { id: 'thisYear', label: 'This Year' },
];

export const TRANSACTION_TYPE_OPTIONS = [
  { id: '', label: 'All types' },
  { id: 'inflow', label: 'Income (inflow)' },
  { id: 'outflow', label: 'Expense (outflow)' },
  { id: 'transfer', label: 'Transfer' },
];

export const TRANSACTION_STATUS_OPTIONS = [
  { id: '', label: 'All statuses' },
  { id: 'cleared', label: 'Cleared' },
  { id: 'uncleared', label: 'Uncleared' },
  { id: 'reconciled', label: 'Reconciled' },
  { id: 'flagged', label: 'Flagged' },
];

/** FR-11: filter by categorization state */
export const CATEGORIZATION_FILTER_OPTIONS = [
  { id: '', label: 'All categorization' },
  { id: 'uncategorized', label: 'Uncategorized' },
  { id: 'categorized', label: 'Categorized' },
  { id: 'needs_review', label: 'Needs review' },
];

export const DEFAULT_TRANSACTION_FILTERS = Object.freeze({
  search: '',
  recentRange: 'all',
  dateFrom: '',
  dateTo: '',
  datePreset: '',
  accountId: '',
  accountIds: [],
  categoryId: '',
  categoryIds: [],
  payee: '',
  transactionType: '',
  status: '',
  categorizationStatus: '',
});

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function categoryNameForTx(tx, categoryNameById) {
  if (tx?.is_transfer === 1) return 'transfer';
  if (!tx?.category_id) {
    return Number(tx?.amount) > 0 ? 'ready to assign' : '';
  }
  return categoryNameById.get(tx.category_id) || 'uncategorized';
}

export function isCleared(tx) {
  const c = tx?.cleared ?? tx?.is_cleared;
  return c === 1 || c === 2 || c === true;
}

export function isReconciled(tx) {
  return tx?.is_reconciled === 1 || tx?.is_reconciled === true || tx?.is_cleared === 2;
}

export function isUncleared(tx) {
  const c = tx?.cleared ?? tx?.is_cleared;
  return c === 0 || c === false || c == null;
}

export function isFlagged(tx) {
  return tx?.is_flagged === 1 || tx?.is_flagged === true;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function recentCutoffDate(recentRange) {
  const option = RECENT_RANGE_OPTIONS.find((o) => o.id === recentRange);
  if (!option?.days) return null;
  return addDays(todayIso(), -option.days);
}

/** @returns {{ from: string, to: string }|null} */
export function dateRangeForPreset(preset) {
  if (!preset) return null;
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const pad = (n) => String(n).padStart(2, '0');

  switch (preset) {
    case 'thisMonth': {
      const from = `${y}-${pad(m + 1)}-01`;
      const last = new Date(y, m + 1, 0);
      const to = `${y}-${pad(m + 1)}-${pad(last.getDate())}`;
      return { from, to };
    }
    case 'lastMonth': {
      const lm = m === 0 ? 11 : m - 1;
      const ly = m === 0 ? y - 1 : y;
      const from = `${ly}-${pad(lm + 1)}-01`;
      const last = new Date(ly, lm + 1, 0);
      const to = `${ly}-${pad(lm + 1)}-${pad(last.getDate())}`;
      return { from, to };
    }
    case 'last30':
      return { from: addDays(todayIso(), -30), to: todayIso() };
    case 'last90':
      return { from: addDays(todayIso(), -90), to: todayIso() };
    case 'thisYear':
      return { from: `${y}-01-01`, to: todayIso() };
    default:
      return null;
  }
}

function matchesSearch(tx, query, categoryNameById) {
  if (!query) return true;
  const q = norm(query);
  const amountStr = String(Math.abs(Number(tx?.amount) || 0));
  const fields = [
    tx?.payee,
    tx?.description,
    tx?.memo,
    categoryNameForTx(tx, categoryNameById),
    amountStr,
    tx?.amount,
    tx?.account_name,
    tx?.account_id,
  ];
  return fields.some((field) => norm(field).includes(q));
}

function resolveAccountIds(f, opts) {
  const ids = Array.isArray(f.accountIds) ? f.accountIds.filter(Boolean) : [];
  if (ids.length) return ids.map(String);
  if (f.accountId) return [String(f.accountId)];
  if (opts.fixedAccountId) return [String(opts.fixedAccountId)];
  return [];
}

function resolveCategoryIds(f) {
  const ids = Array.isArray(f.categoryIds) ? f.categoryIds.filter(Boolean) : [];
  if (ids.length) return ids.map(String);
  if (f.categoryId) return [String(f.categoryId)];
  return [];
}

/**
 * @param {object[]} transactions
 * @param {object} filters
 * @param {{ categories?: object[], fixedAccountId?: string|null, includeTransactionIds?: string[], activityDrilldownOnly?: boolean }} [opts]
 */
export function filterTransactions(transactions, filters, opts = {}) {
  const f = { ...DEFAULT_TRANSACTION_FILTERS, ...(filters || {}) };
  const categoryNameById = new Map(
    (opts.categories || [])
      .filter((c) => c?.id)
      .map((c) => [c.id, c.name || ''])
  );
  const cutoff = recentCutoffDate(f.recentRange);
  const presetRange = dateRangeForPreset(f.datePreset);
  const accountIds = resolveAccountIds(f, opts);
  const categoryIds = resolveCategoryIds(f);
  const includeIds = Array.isArray(opts.includeTransactionIds)
    ? new Set(opts.includeTransactionIds.map(String))
    : null;
  const activityDrilldownOnly = Boolean(opts.activityDrilldownOnly && includeIds?.size);

  return (transactions || []).filter((tx) => {
    if (tx?.is_deleted === 1 || tx?.is_deleted === true) return false;

    if (activityDrilldownOnly) {
      return includeIds.has(String(tx.id));
    }

    if (!matchesSearch(tx, f.search, categoryNameById)) return false;

    const txDate = String(tx?.date || '').slice(0, 10);
    if (cutoff && txDate && txDate < cutoff) return false;

    if (presetRange) {
      if (txDate && txDate < presetRange.from) return false;
      if (txDate && txDate > presetRange.to) return false;
    }
    if (f.dateFrom && txDate && txDate < f.dateFrom) return false;
    if (f.dateTo && txDate && txDate > f.dateTo) return false;

    if (accountIds.length && !accountIds.includes(String(tx.account_id))) return false;

    if (categoryIds.length) {
      const matches = categoryIds.some((cid) => {
        if (cid === 'ready_to_assign' || cid === 'inflow_ready_to_assign') {
          return (tx.category_id == null || tx.category_id === '') && Number(tx.amount) > 0;
        }
        return String(tx.category_id) === cid;
      });
      if (!matches) {
        if (includeIds?.has(String(tx.id))) {
          /* split parents and other activity contributors */
        } else {
          return false;
        }
      }
    }

    if (f.payee && !norm(getPayee(tx)).includes(norm(f.payee))) return false;

    if (f.transactionType === 'transfer' && tx.is_transfer !== 1) return false;
    if (f.transactionType === 'inflow' && !(Number(tx.amount) > 0 && tx.is_transfer !== 1)) {
      return false;
    }
    if (f.transactionType === 'outflow' && !(Number(tx.amount) < 0 && tx.is_transfer !== 1)) {
      return false;
    }

    if (f.status === 'cleared' && !isCleared(tx)) return false;
    if (f.status === 'uncleared' && !isUncleared(tx)) return false;
    if (f.status === 'reconciled' && !isReconciled(tx)) return false;
    if (f.status === 'flagged' && !isFlagged(tx)) return false;

    if (f.categorizationStatus === 'uncategorized') {
      if (tx.is_transfer === 1) return false;
      if (tx.is_split_parent === 1) return false;
      if (tx.category_id) return false;
      return true;
    }
    if (f.categorizationStatus === 'categorized') {
      if (tx.is_transfer === 1 || tx.is_split_parent === 1) return true;
      return !!(tx.category_id || tx.mapping_status === 'categorized');
    }
    if (f.categorizationStatus === 'needs_review') {
      return tx.mapping_status === 'needs_review' || !!tx.suggested_category_id;
    }

    return true;
  });
}

function getPayee(tx) {
  return tx?.payee || tx?.description || '';
}

export function countActiveFilters(filters, { hideAccountFilter = false } = {}) {
  const f = filters || {};
  let count = 0;
  if (f.dateFrom || f.dateTo || f.datePreset) count += 1;
  if (!hideAccountFilter && (f.accountId || (f.accountIds && f.accountIds.length))) count += 1;
  if (f.categoryId || (f.categoryIds && f.categoryIds.length)) count += 1;
  if (f.payee) count += 1;
  if (f.transactionType) count += 1;
  if (f.status) count += 1;
  if (f.categorizationStatus) count += 1;
  return count;
}
