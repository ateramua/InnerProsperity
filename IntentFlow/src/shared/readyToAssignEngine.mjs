/**
 * Global Ready to Assign — shared pool across all budget months.
 * RTA = total cash − Σ assigned amounts (all months).
 */

export function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/**
 * @param {string} monthKey YYYY-MM-DD (first of month)
 */
export function normalizeMonthKey(monthKey) {
  const s = String(monthKey || '').trim();
  const match = s.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-01`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * @param {Array<{ month: string, category_id?: string, categoryId?: string, category_name?: string, categoryName?: string, budgeted_amount?: number, assignedAmount?: number }>} rows
 * @param {string} currentMonthKey Calendar current month (anchor for "future")
 * @param {number} totalCash
 */
export function computeGlobalBudgetSummary(rows, currentMonthKey, totalCash) {
  const anchor = normalizeMonthKey(currentMonthKey);
  let totalAssigned = 0;
  let futureAssigned = 0;
  const futureBreakdown = [];

  for (const row of rows || []) {
    const amount = roundMoney(
      row.budgeted_amount ?? row.assignedAmount ?? row.assigned ?? 0,
    );
    if (amount <= 0) continue;

    const month = normalizeMonthKey(row.month);
    const categoryId = row.category_id ?? row.categoryId;
    const categoryName = row.category_name ?? row.categoryName ?? 'Category';

    totalAssigned += amount;
    if (month > anchor) {
      futureAssigned += amount;
      futureBreakdown.push({
        monthKey: month,
        categoryId,
        categoryName,
        assignedAmount: amount,
      });
    }
  }

  totalAssigned = roundMoney(totalAssigned);
  futureAssigned = roundMoney(futureAssigned);
  const cash = roundMoney(totalCash);
  const readyToAssign = roundMoney(cash - totalAssigned);

  futureBreakdown.sort((a, b) => {
    if (a.monthKey !== b.monthKey) return a.monthKey.localeCompare(b.monthKey);
    return String(a.categoryName || '').localeCompare(String(b.categoryName || ''));
  });

  return {
    currentMonthKey: anchor,
    totalCash: cash,
    totalAssigned,
    futureAssigned,
    readyToAssign,
    futureBreakdown,
  };
}

/**
 * @param {number} totalCash
 * @param {number} totalAssigned
 */
export function computeReadyToAssign(totalCash, totalAssigned) {
  return roundMoney(Number(totalCash) - Number(totalAssigned));
}
