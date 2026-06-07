/**
 * Credit card purchase → payment category reserve (FR-12).
 * YNAB-style: funded card spending increases payment-category assigned (reserve)
 * without moving Ready to Assign. Card payments are transfers; payment-category
 * available drops via cardPayments activity, not assigned reduction.
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

/**
 * Compute funded reserve for a credit-card purchase, refund, or recategorization.
 * @returns {{ nextReserved: number, creditReserveDelta: number, unfundedAmount: number }}
 */
function computeCreditCardReserveState({
  accountType,
  amount,
  categoryId,
  envelopeAvailable,
  previousReserved,
}) {
  const prev = Number(previousReserved) || 0;
  if (accountType !== 'credit') {
    return { nextReserved: prev, creditReserveDelta: 0, unfundedAmount: 0 };
  }

  if (!categoryId) {
    return { nextReserved: 0, creditReserveDelta: -prev, unfundedAmount: 0 };
  }

  const nAmount = Number(amount) || 0;

  if (nAmount < 0) {
    const spend = Math.abs(nAmount);
    const backed = Math.min(spend, Math.max(0, Number(envelopeAvailable) || 0));
    const nextReserved = backed;
    return {
      nextReserved,
      creditReserveDelta: nextReserved - prev,
      unfundedAmount: Math.max(0, spend - backed),
    };
  }

  if (nAmount > 0) {
    const refund = Math.abs(nAmount);
    const release = Math.min(refund, prev);
    const nextReserved = Math.max(0, prev - release);
    return {
      nextReserved,
      creditReserveDelta: nextReserved - prev,
      unfundedAmount: 0,
    };
  }

  return { nextReserved: prev, creditReserveDelta: 0, unfundedAmount: 0 };
}

/** @deprecated Use computeCreditCardReserveState */
function computeReserveDelta(params) {
  return computeCreditCardReserveState(params).creditReserveDelta;
}

async function applyCreditCardPaymentReserveDelta(db, { userId, accountId, date, delta, userIntentAssignment }) {
  const nDelta = Number(delta) || 0;
  if (!userId || !accountId || !Number.isFinite(nDelta) || nDelta === 0) return;
  if (userIntentAssignment !== true) return;

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
    nextAssigned,
    {
      auditSource: 'cc_payment_reserve',
      userIntentAssignment: true,
      // Internal envelope move — must not debit/credit Ready to Assign pool.
      skipPoolAdjustment: true,
    }
  );
}

/**
 * Recompute payment-category available from assigned + cardPayments (no assigned/RTA change).
 * Call after checking→credit card payment transfers.
 */
async function refreshCreditCardPaymentCategoryEnvelope(db, { userId, accountId, date, userIntentAssignment }) {
  if (userIntentAssignment !== true) return;
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
  await monthlyBudgetService.applyMonthBudgetedAmount(
    db,
    userId,
    paymentCategory.id,
    monthKey,
    assigned,
    {
      auditSource: 'cc_payment_reserve',
      userIntentAssignment: true,
      skipPoolAdjustment: true,
      skipAudit: true,
    }
  );
}

/**
 * Release reserve when a categorized credit-card purchase/refund is deleted.
 */
async function releaseReserveForDeletedTransaction(db, { userId, transactionRow }) {
  if (!transactionRow || !userId) return;
  const reserved = Number(transactionRow.cc_payment_reserved) || 0;
  if (reserved === 0) return;
  if (transactionRow.is_transfer === 1 || transactionRow.is_transfer === true) return;
  if (transactionRow.account_type !== 'credit') return;

  await applyCreditCardPaymentReserveDelta(db, {
    userId,
    accountId: transactionRow.account_id,
    date: transactionRow.date,
    delta: -reserved,
    userIntentAssignment: true,
  });
}

module.exports = {
  getCategoryMonthEnvelope,
  computeReserveDelta,
  computeCreditCardReserveState,
  applyCreditCardPaymentReserveDelta,
  refreshCreditCardPaymentCategoryEnvelope,
  releaseReserveForDeletedTransaction,
};
