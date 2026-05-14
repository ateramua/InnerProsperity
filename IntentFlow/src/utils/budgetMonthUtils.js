/**
 * Local-calendar month keys (YYYY-MM-01) shared by the budget UI.
 * CommonJS so Next (package "type":"commonjs") parses this file reliably.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** First day of the month for a Date (or date-like), local time. */
function formatBudgetMonthKey(date) {
  const d = date instanceof Date ? date : date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) {
    const n = new Date();
    return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-01`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function roundMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Parse YYYY-MM-01 (or YYYY-MM-DD) to a local Date at noon on the 1st. */
function monthKeyToLocalDate(monthKey) {
  if (!monthKey || typeof monthKey !== 'string') return new Date();
  const y = parseInt(monthKey.slice(0, 4), 10);
  const m = parseInt(monthKey.slice(5, 7), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return new Date();
  return new Date(y, m - 1, 1, 12, 0, 0, 0);
}

module.exports = {
  formatBudgetMonthKey,
  roundMoney,
  monthKeyToLocalDate,
};
