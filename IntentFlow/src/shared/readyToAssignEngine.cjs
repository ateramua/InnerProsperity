/**
 * Global Ready to Assign — shared pool across all budget months.
 */

function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function normalizeMonthKey(monthKey) {
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

function computeGlobalBudgetSummary(rows, currentMonthKey, totalCash) {
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

function computeReadyToAssign(totalCash, totalAssigned) {
  return roundMoney(Number(totalCash) - Number(totalAssigned));
}

module.exports = {
  roundMoney,
  normalizeMonthKey,
  computeGlobalBudgetSummary,
  computeReadyToAssign,
};
