/**
 * Activity → All Accounts transaction drill-down (navigation payload + filters).
 */

import { dateRangeForBudgetMonthKey, formatBudgetMonthLabel } from './budgetMonthUtils.jsx';
import { DEFAULT_TRANSACTION_FILTERS } from './transactionFilterUtils.jsx';
import { DEFAULT_TRANSACTION_SORT, sortTransactions } from './transactionSortUtils.jsx';
import { READY_TO_ASSIGN_CATEGORY_ID } from './readyToAssignCategory.jsx';

export const ACTIVITY_DRILLDOWN_STORAGE_KEY = 'intentflow.activityDrilldown.v1';
export const BUDGET_RETURN_MONTH_KEY = 'intentflow.budgetReturnMonth.v1';
export const FILTER_TYPE_ACTIVITY_DRILLDOWN = 'activity_drilldown';

export const READY_TO_ASSIGN_DRILLDOWN_ID = '__ready_to_assign__';

/** Survives React Strict Mode remount (sessionStorage is cleared on first read). */
let cachedDrilldownPayload = undefined;

/**
 * Read drill-down payload once per navigation (safe under Strict Mode double-mount).
 * @returns {ActivityDrilldownPayload|null}
 */
export function readActivityDrilldownPayload() {
  if (cachedDrilldownPayload !== undefined) {
    return cachedDrilldownPayload;
  }
  const parsed = peekActivityDrilldown();
  cachedDrilldownPayload = parsed || null;
  if (parsed) clearActivityDrilldown();
  return cachedDrilldownPayload;
}

export function resetActivityDrilldownCache() {
  cachedDrilldownPayload = undefined;
}

/**
 * @typedef {object} ActivityDrilldownPayload
 * @property {string} categoryId
 * @property {string} [categoryName]
 * @property {string} month - YYYY-MM-01
 * @property {string} filter_type
 * @property {string} [returnView]
 * @property {number} [activityAmount]
 */

export function isValidActivityAmount(value) {
  const n = Number(value);
  return Number.isFinite(n);
}

export function normalizeDrilldownCategoryId(categoryId) {
  const id = String(categoryId || '');
  if (id === READY_TO_ASSIGN_DRILLDOWN_ID) return READY_TO_ASSIGN_CATEGORY_ID;
  return id;
}

export function saveActivityDrilldown(payload) {
  if (typeof sessionStorage === 'undefined' || !payload?.categoryId || !payload?.month) return;
  resetActivityDrilldownCache();
  try {
    sessionStorage.setItem(
      ACTIVITY_DRILLDOWN_STORAGE_KEY,
      JSON.stringify({
        ...payload,
        filter_type: payload.filter_type || FILTER_TYPE_ACTIVITY_DRILLDOWN,
        at: Date.now(),
      })
    );
  } catch {
    /* ignore */
  }
}

/** @returns {ActivityDrilldownPayload|null} */
export function peekActivityDrilldown() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ACTIVITY_DRILLDOWN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.filter_type !== FILTER_TYPE_ACTIVITY_DRILLDOWN) return null;
    if (!parsed?.categoryId || !parsed?.month) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** @returns {ActivityDrilldownPayload|null} */
export function consumeActivityDrilldown() {
  const parsed = peekActivityDrilldown();
  if (!parsed) return null;
  clearActivityDrilldown();
  return parsed;
}

export function clearActivityDrilldown() {
  resetActivityDrilldownCache();
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(ACTIVITY_DRILLDOWN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function persistBudgetReturnMonth(monthKey) {
  if (typeof sessionStorage === 'undefined' || !monthKey) return;
  try {
    sessionStorage.setItem(BUDGET_RETURN_MONTH_KEY, String(monthKey));
  } catch {
    /* ignore */
  }
}

/** @returns {string|null} */
export function consumeBudgetReturnMonth() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const key = sessionStorage.getItem(BUDGET_RETURN_MONTH_KEY);
    sessionStorage.removeItem(BUDGET_RETURN_MONTH_KEY);
    return key || null;
  } catch {
    return null;
  }
}

/** @param {ActivityDrilldownPayload} payload */
export function filtersFromActivityDrilldown(payload) {
  const range = dateRangeForBudgetMonthKey(payload.month);
  const categoryId = normalizeDrilldownCategoryId(payload.categoryId);
  return {
    ...DEFAULT_TRANSACTION_FILTERS,
    recentRange: 'all',
    datePreset: '',
    dateFrom: range.from,
    dateTo: range.to,
    categoryId,
    categoryIds: categoryId ? [categoryId] : [],
  };
}

export function drilldownBannerLabel(payload, categories = []) {
  if (!payload) return '';
  const monthLabel = formatBudgetMonthLabel(payload.month);
  let name = payload.categoryName;
  if (!name && payload.categoryId === READY_TO_ASSIGN_DRILLDOWN_ID) {
    name = 'Ready to Assign';
  }
  if (!name && categories.length) {
    const cid = normalizeDrilldownCategoryId(payload.categoryId);
    const cat = categories.find((c) => String(c.id) === String(cid));
    name = cat?.name;
  }
  return `${name || 'Category'} · ${monthLabel}`;
}

/**
 * Save drill-down payload and open the All Accounts transactions view.
 * @param {(viewId: string) => void} [onNavigate]
 * @param {{ push?: (path: string) => void }} [router]
 */
export function navigateToActivityDrilldown(onNavigate, payload, router) {
  saveActivityDrilldown({
    ...payload,
    returnView: payload.returnView || 'propertyMap',
    filter_type: FILTER_TYPE_ACTIVITY_DRILLDOWN,
  });
  if (typeof onNavigate === 'function') {
    onNavigate('allAccounts');
    return;
  }
  if (router?.push) {
    router.push('/transactions');
  }
}

/** Client-side fallback when IPC is unavailable or returns no IDs. */
export function computeLocalActivityTransactionIds(transactions, categoryId, monthKey) {
  const range = dateRangeForBudgetMonthKey(monthKey);
  const normalizedCat = normalizeDrilldownCategoryId(categoryId);
  const isRta =
    normalizedCat === READY_TO_ASSIGN_CATEGORY_ID ||
    categoryId === READY_TO_ASSIGN_DRILLDOWN_ID;

  return (transactions || [])
    .filter((tx) => {
      if (tx?.is_deleted === 1 || tx?.is_deleted === true) return false;
      if (tx?.is_transfer === 1) return false;
      const txDate = String(tx?.date || '').slice(0, 10);
      if (!txDate || txDate < range.from || txDate > range.to) return false;

      if (isRta) {
        return (tx.category_id == null || tx.category_id === '') && Number(tx.amount) > 0;
      }

      if (String(tx.category_id) === String(normalizedCat)) return true;
      return false;
    })
    .map((tx) => String(tx.id));
}

export function mergeActivityTransactionIds(...lists) {
  const merged = new Set();
  for (const list of lists) {
    for (const id of list || []) {
      if (id != null && id !== '') merged.add(String(id));
    }
  }
  return [...merged];
}

/** IDs from highlight set that exist in the loaded register. */
export function confirmActivityIdsInRegister(transactions, highlightIds) {
  if (!highlightIds?.length || !transactions?.length) return [];
  const idSet = new Set(highlightIds.map(String));
  return transactions
    .filter(
      (tx) =>
        idSet.has(String(tx.id)) &&
        tx?.is_deleted !== 1 &&
        tx?.is_deleted !== true
    )
    .map((tx) => String(tx.id));
}

/**
 * Primary row to scroll/focus: most recent activity transaction (default date desc).
 */
export function pickPrimaryActivityFocusId(transactions, highlightIds, categories = []) {
  const confirmed = confirmActivityIdsInRegister(transactions, highlightIds);
  if (!confirmed.length) return null;
  const idSet = new Set(confirmed);
  const matches = (transactions || []).filter((tx) => idSet.has(String(tx.id)));
  const sorted = sortTransactions(matches, DEFAULT_TRANSACTION_SORT, { categories });
  return sorted[0] ? String(sorted[0].id) : null;
}

export function formatActivityFocusPayee(transactions, focusId) {
  if (!focusId) return '';
  const tx = (transactions || []).find((t) => String(t.id) === String(focusId));
  if (!tx) return '';
  return tx.payee || tx.description || 'Transaction';
}

export async function fetchActivityDrilldownTransactionIds(categoryId, monthKey, transactions = []) {
  const localIds = computeLocalActivityTransactionIds(transactions, categoryId, monthKey);
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  if (!api?.getCategoryActivityTransactionIds) return localIds;
  try {
    const userResult = await api.getCurrentUser?.();
    const userId = userResult?.data?.id;
    if (!userId) return localIds;
    const res = await api.getCategoryActivityTransactionIds(
      userId,
      normalizeDrilldownCategoryId(categoryId),
      monthKey
    );
    if (!res?.success || !Array.isArray(res.data?.transaction_ids)) return localIds;
    const apiIds = res.data.transaction_ids.map(String);
    return mergeActivityTransactionIds(apiIds, localIds);
  } catch {
    return localIds;
  }
}
