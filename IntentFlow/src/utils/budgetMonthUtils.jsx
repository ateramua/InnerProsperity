/**
 * Local-calendar month keys (YYYY-MM-01) shared by the budget UI.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** First day of the month for a Date (or date-like), local time. */
export function formatBudgetMonthKey(date) {
  const d = date instanceof Date ? date : date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) {
    const n = new Date();
    return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-01`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

export function roundMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Parse YYYY-MM-01 (or YYYY-MM-DD) to a local Date at noon on the 1st. */
export function monthKeyToLocalDate(monthKey) {
  if (!monthKey || typeof monthKey !== 'string') return new Date();
  const y = parseInt(monthKey.slice(0, 4), 10);
  const m = parseInt(monthKey.slice(5, 7), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return new Date();
  return new Date(y, m - 1, 1, 12, 0, 0, 0);
}

/** Normalize DB/ISO dates for HTML date inputs (YYYY-MM-DD). */
export function formatDateForInput(value) {
  if (value === undefined || value === null || value === '') return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Parse timestamps from SQLite (UTC `datetime('now')` has no timezone suffix).
 * Without a `Z`, JS treats "YYYY-MM-DD HH:MM:SS" as local time and shifts the calendar day.
 * @param {string | number | Date | null | undefined} value
 * @returns {Date}
 */
export function parseStoredUtcTimestamp(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }
  if (value === undefined || value === null || value === '') return new Date();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);

  const s = String(value).trim();
  if (!s) return new Date();
  if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) {
    const d = new Date(s.replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * @param {string | number | Date | null | undefined} value
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function formatStoredTimestampLocalDate(value, options) {
  return parseStoredUtcTimestamp(value).toLocaleDateString(undefined, options);
}

/** Human-readable label for a budget month key (e.g. "June 2026"). */
export function formatBudgetMonthLabel(monthKey) {
  return monthKeyToLocalDate(monthKey).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });
}

export function compareBudgetMonthKeys(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

/** Inclusive calendar range for a budget month key (YYYY-MM-01). */
export function dateRangeForBudgetMonthKey(monthKey) {
  const d = monthKeyToLocalDate(monthKey);
  const y = d.getFullYear();
  const m = d.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const from = `${y}-${pad(m + 1)}-01`;
  const last = new Date(y, m + 1, 0);
  const to = `${y}-${pad(m + 1)}-${pad(last.getDate())}`;
  return { from, to };
}

/** Inclusive range of YYYY-MM-01 keys from min through max. */
export function enumerateBudgetMonthKeys(minMonthKey, maxMonthKey) {
  const min = formatBudgetMonthKey(monthKeyToLocalDate(minMonthKey));
  const max = formatBudgetMonthKey(monthKeyToLocalDate(maxMonthKey));
  if (compareBudgetMonthKeys(min, max) > 0) return [min];

  const keys = [];
  let cursor = monthKeyToLocalDate(min);
  const end = monthKeyToLocalDate(max);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(formatBudgetMonthKey(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12, 0, 0, 0);
  }
  return keys;
}
