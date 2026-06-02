/**
 * Credit card purchase → payment category reserve (FR-12).
 */

const monthlyBudgetService = require('../budget/monthlyBudgetService.cjs');
const {
  ensureCreditCardPaymentCategoryForAccount,
} = require('../accounts/creditCardPaymentCategoryService.cjs');

async function getCategoryMonthEnvelope(db, userId, categoryId, date) {
  const monthKey = monthlyBudgetService.toLocalMonthKey(date || new Date());
  await monthlyBudgetService.getBudgetMonthSnapshot(db, userId, monthKey);
  const row = await db.get(
    `SELECT budgeted_amount, available_amount
     FROM monthly_budgets
     WHERE category_id = ? AND month = ?`,
    [categoryId, monthKey]
  );
  if (row) {
    return {
      monthKey,
      assigned: Number(row.budgeted_amount) || 0,
      available: Number(row.available_amount) || 0,
    };
  }
  const cat = await db.get(
    `SELECT assigned, available FROM categories
     WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
    [categoryId, userId]
  );
  return {
    monthKey,
    assigned: Number(cat?.assigned) || 0,
    available: Number(cat?.available) || 0,
  };
}

async function applyCreditCardPaymentReserveDelta(db, { userId, accountId, date, delta }) {
  const nDelta = Number(delta) || 0;
  if (!userId || !accountId || !Number.isFinite(nDelta) || nDelta === 0) return;

  const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [
    accountId,
    userId,
  ]);
  if (!account || account.type !== 'credit') return;

  const paymentCategory = await ensureCreditCardPaymentCategoryForAccount(db, account);
  if (!paymentCategory) return;

  const { monthKey, assigned } = await getCategoryMonthEnvelope(
    db,
    userId,
    paymentCategory.id,
    date || new Date()
  );
  const nextAssigned = Math.max(0, assigned + nDelta);
  await monthlyBudgetService.applyMonthBudgetedAmount(
    db,
    userId,
    paymentCategory.id,
    monthKey,
    nextAssigned
  );
}

/**
 * Compute reserve delta when categorizing a credit-card expense/income.
 */
function computeReserveDelta({ accountType, amount, categoryId, envelopeAvailable, previousReserved }) {
  if (accountType !== 'credit') return 0;
  const prev = Number(previousReserved) || 0;

  if (!categoryId) {
    return prev !== 0 ? -prev : 0;
  }

  if (amount < 0) {
    const spend = Math.abs(amount);
    const backed = Math.min(spend, Math.max(0, Number(envelopeAvailable) || 0));
    return backed - prev;
  }

  if (amount > 0) {
    const release = -Math.abs(amount);
    return release - prev;
  }

  return 0;
}

module.exports = {
  getCategoryMonthEnvelope,
  computeReserveDelta,
  applyCreditCardPaymentReserveDelta,
};
