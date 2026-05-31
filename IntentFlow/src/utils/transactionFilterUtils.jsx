/**
 * Search, filter, and recent-range helpers for transaction lists.
 */

export const RECENT_RANGE_OPTIONS = [
  { id: '7', label: 'Last 7 Days', days: 7 },
  { id: '30', label: 'Last 30 Days', days: 30 },
  { id: '90', label: 'Last 90 Days', days: 90 },
  { id: 'all', label: 'All Transactions', days: null },
];

export const TRANSACTION_TYPE_OPTIONS = [
  { id: '', label: 'All types' },
  { id: 'inflow', label: 'Inflow' },
  { id: 'outflow', label: 'Outflow' },
];

export const TRANSACTION_STATUS_OPTIONS = [
  { id: '', label: 'All statuses' },
  { id: 'cleared', label: 'Cleared' },
  { id: 'uncleared', label: 'Uncleared' },
];

export const DEFAULT_TRANSACTION_FILTERS = Object.freeze({
  search: '',
  recentRange: 'all',
  dateFrom: '',
  dateTo: '',
  accountId: '',
  categoryId: '',
  payee: '',
  transactionType: '',
  status: '',
});

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function categoryNameForTx(tx, categoryNameById) {
  if (!tx?.category_id) {
    return Number(tx?.amount) > 0 ? 'ready to assign' : '';
  }
  return categoryNameById.get(tx.category_id) || 'uncategorized';
}

function isCleared(tx) {
  return tx?.cleared === 1 || tx?.cleared === true || tx?.is_cleared === 1;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function recentCutoffDate(recentRange) {
  const option = RECENT_RANGE_OPTIONS.find((o) => o.id === recentRange);
  if (!option?.days) return null;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return addDays(`${yyyy}-${mm}-${dd}`, -option.days);
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
  ];
  return fields.some((field) => norm(field).includes(q));
}

/**
 * @param {object[]} transactions
 * @param {object} filters
 * @param {{ categories?: object[], fixedAccountId?: string|null }} [opts]
 */
export function filterTransactions(transactions, filters, opts = {}) {
  const f = { ...DEFAULT_TRANSACTION_FILTERS, ...(filters || {}) };
  const categoryNameById = new Map(
    (opts.categories || [])
      .filter((c) => c?.id)
      .map((c) => [c.id, c.name || ''])
  );
  const cutoff = recentCutoffDate(f.recentRange);

  return (transactions || []).filter((tx) => {
    if (tx?.is_deleted === 1 || tx?.is_deleted === true) return false;

    if (!matchesSearch(tx, f.search, categoryNameById)) return false;

    const txDate = String(tx?.date || '').slice(0, 10);
    if (cutoff && txDate && txDate < cutoff) return false;
    if (f.dateFrom && txDate && txDate < f.dateFrom) return false;
    if (f.dateTo && txDate && txDate > f.dateTo) return false;

    const accountFilter = f.accountId || opts.fixedAccountId || '';
    if (accountFilter && String(tx.account_id) !== String(accountFilter)) return false;

    if (f.categoryId) {
      if (f.categoryId === 'ready_to_assign') {
        if (tx.category_id != null && tx.category_id !== '') return false;
        if (Number(tx.amount) <= 0) return false;
      } else if (String(tx.category_id) !== String(f.categoryId)) {
        return false;
      }
    }

    if (f.payee && !norm(getPayee(tx)).includes(norm(f.payee))) return false;

    if (f.transactionType === 'inflow' && !(Number(tx.amount) > 0)) return false;
    if (f.transactionType === 'outflow' && !(Number(tx.amount) < 0)) return false;

    if (f.status === 'cleared' && !isCleared(tx)) return false;
    if (f.status === 'uncleared' && isCleared(tx)) return false;

    return true;
  });
}

function getPayee(tx) {
  return tx?.payee || tx?.description || '';
}

export function countActiveFilters(filters, { hideAccountFilter = false } = {}) {
  const f = filters || {};
  let count = 0;
  if (f.dateFrom || f.dateTo) count += 1;
  if (!hideAccountFilter && f.accountId) count += 1;
  if (f.categoryId) count += 1;
  if (f.payee) count += 1;
  if (f.transactionType) count += 1;
  if (f.status) count += 1;
  return count;
}
