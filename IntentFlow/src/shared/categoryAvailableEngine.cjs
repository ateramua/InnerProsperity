/**
 * Envelope budgeting: derived Available balance per category.
 * Authoritative inputs: carryover, assignments, transactions, adjustments.
 * Available is a calculated output (cached on monthly_budgets / categories).
 */

const {
  SQL_BUDGET_ACTIVITY_WHERE,
  SQL_TX_CLEARED_FOR_BUDGET,
  SQL_TX_SPENDING_MAGNITUDE,
  SQL_TX_INFLOW_MAGNITUDE,
  SQL_SPLIT_SPENDING_MAGNITUDE,
  SQL_SPLIT_INFLOW_MAGNITUDE,
} = require('./categoryActivitySql.cjs');

function roundMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * @typedef {object} TransactionTotals
 * @property {number} spending - Outflows (positive)
 * @property {number} inflows - Refunds / inflows (positive)
 * @property {number} activity - Net spending for Activity column (spending - inflows)
 * @property {number} cardPayments - Payments to linked credit card (positive)
 * @property {number} adjustments - Manual reconciliation deltas (positive/negative)
 */

/**
 * Compute Available from envelope components.
 * @param {object} params
 * @param {number} params.previousAvailable
 * @param {number} params.assigned
 * @param {TransactionTotals} params.totals
 * @param {boolean} [params.isCreditCardPaymentCategory]
 */
function computeCategoryAvailable(params) {
  const previousAvailable = roundMoney(params.previousAvailable);
  const assigned = roundMoney(params.assigned);
  const totals = params.totals || {};
  const spending = roundMoney(totals.spending);
  const inflows = roundMoney(totals.inflows);
  const adjustments = roundMoney(totals.adjustments);
  const cardPayments = roundMoney(totals.cardPayments);

  if (params.isCreditCardPaymentCategory) {
    // Reserved cash + manual assignments − payments made (not purchase activity on spending cats).
    const available = roundMoney(
      previousAvailable + assigned - cardPayments + adjustments,
    );
    return {
      available,
      activity: cardPayments,
      spending: 0,
      inflows: 0,
      adjustments,
      cardPayments,
    };
  }

  const activity = roundMoney(spending - inflows);
  const available = roundMoney(
    previousAvailable + assigned - spending + inflows + adjustments,
  );

  return {
    available,
    activity,
    spending,
    inflows,
    adjustments,
    cardPayments: 0,
  };
}

/**
 * @param {number} available
 * @param {object} [opts]
 * @param {boolean} [opts.isCreditCardPaymentCategory]
 * @param {boolean} [opts.hadCreditOverspending]
 */
function classifyOverspending(available, opts = {}) {
  if (available >= -0.005) {
    return { overspent: false, overspending_type: null };
  }
  if (opts.hadCreditOverspending && !opts.isCreditCardPaymentCategory) {
    return { overspent: true, overspending_type: 'credit' };
  }
  return { overspent: true, overspending_type: 'cash' };
}

/**
 * Standard category transaction rollup for a calendar month (YYYY-MM).
 * Transfers are excluded from activity. Outflows increase spending; inflows reduce net activity.
 * @param {import('sqlite').Database} db
 */
async function getCategoryTransactionTotals(db, userId, categoryId, monthYm, options = {}) {
  const ym = monthYm.length >= 7 ? monthYm.slice(0, 7) : monthYm;
  const row = await db.get(
    `
    SELECT
      COALESCE(SUM(spending), 0) AS spending,
      COALESCE(SUM(inflows), 0) AS inflows
    FROM (
      SELECT
        ${SQL_TX_SPENDING_MAGNITUDE} AS spending,
        ${SQL_TX_INFLOW_MAGNITUDE} AS inflows
      FROM transactions t
      INNER JOIN accounts a ON CAST(a.id AS TEXT) = CAST(t.account_id AS TEXT)
      WHERE t.user_id = ?
        AND CAST(t.category_id AS TEXT) = CAST(? AS TEXT)
        AND strftime('%Y-%m', t.date) = ?
        AND ${SQL_BUDGET_ACTIVITY_WHERE}
      UNION ALL
      SELECT
        ${SQL_SPLIT_SPENDING_MAGNITUDE} AS spending,
        ${SQL_SPLIT_INFLOW_MAGNITUDE} AS inflows
      FROM transaction_splits ts
      INNER JOIN transactions t ON CAST(t.id AS TEXT) = CAST(ts.transaction_id AS TEXT)
      INNER JOIN accounts a ON CAST(a.id AS TEXT) = CAST(t.account_id AS TEXT)
      WHERE ts.user_id = ?
        AND CAST(ts.category_id AS TEXT) = CAST(? AS TEXT)
        AND strftime('%Y-%m', t.date) = ?
        AND IFNULL(t.is_transfer, 0) = 0
        AND ${SQL_BUDGET_ACTIVITY_WHERE}
    )
  `,
    [userId, categoryId, ym, userId, categoryId, ym],
  );

  let cardPayments = 0;
  if (options.linkedAccountId) {
    const payRow = await db.get(
      `
      SELECT COALESCE(SUM(ABS(t.amount)), 0) AS payments
      FROM transactions t
      INNER JOIN accounts a ON CAST(a.id AS TEXT) = CAST(t.account_id AS TEXT)
      WHERE t.user_id = ?
        AND CAST(a.id AS TEXT) = CAST(? AS TEXT)
        AND lower(IFNULL(a.type, '')) IN ('credit', 'credit card', 'charge card')
        AND strftime('%Y-%m', t.date) = ?
        AND IFNULL(t.is_deleted, 0) = 0
        AND IFNULL(a.is_active, 1) != 0
        AND IFNULL(a.account_status, 'active') = 'active'
        AND t.amount > 0
        AND (
          IFNULL(t.is_transfer, 0) = 1
          OR (
            CAST(t.category_id AS TEXT) = CAST(? AS TEXT)
            AND ${SQL_TX_CLEARED_FOR_BUDGET}
          )
        )
    `,
      [userId, options.linkedAccountId, ym, categoryId],
    );
    cardPayments = Number(payRow?.payments) || 0;
  }

  const spending = Number(row?.spending) || 0;
  const inflows = Number(row?.inflows) || 0;

  return {
    spending,
    inflows,
    activity: roundMoney(spending - inflows),
    cardPayments: roundMoney(cardPayments),
    adjustments: roundMoney(options.adjustments || 0),
  };
}

/**
 * Detect unfunded credit-card purchases against this spending category in the month.
 * @param {import('sqlite').Database} db
 */
async function getCreditOverspendingFlag(db, userId, categoryId, monthYm) {
  const ym = monthYm.length >= 7 ? monthYm.slice(0, 7) : monthYm;
  const row = await db.get(
    `
    SELECT COUNT(*) AS cnt
    FROM transactions t
    INNER JOIN accounts a ON CAST(a.id AS TEXT) = CAST(t.account_id AS TEXT)
    WHERE t.user_id = ?
      AND CAST(t.category_id AS TEXT) = CAST(? AS TEXT)
      AND a.type = 'credit'
      AND t.amount < 0
      AND IFNULL(t.is_transfer, 0) = 0
      AND strftime('%Y-%m', t.date) = ?
      AND ${SQL_BUDGET_ACTIVITY_WHERE}
  `,
    [userId, categoryId, ym],
  );
  return (Number(row?.cnt) || 0) > 0;
}

/**
 * Full envelope row for one category/month.
 */
async function buildCategoryEnvelopeRow(db, userId, category, context) {
  const {
    monthKey,
    previousAvailable,
    budgeted,
    isCurrentCalendarMonth,
  } = context;

  const ym = monthKey.slice(0, 7);
  const isCcPayment = category.is_credit_card_payment_category === 1;

  const totals = await getCategoryTransactionTotals(db, userId, category.id, ym, {
    linkedAccountId: isCcPayment ? category.linked_account_id : null,
    adjustments: 0,
  });

  const envelope = computeCategoryAvailable({
    previousAvailable,
    assigned: budgeted,
    totals,
    isCreditCardPaymentCategory: isCcPayment,
  });

  let hadCreditOverspending = false;
  if (!isCcPayment) {
    hadCreditOverspending = await getCreditOverspendingFlag(db, userId, category.id, ym);
    if (envelope.available < 0 && hadCreditOverspending) {
      // Credit-backed spend can drive negative available on spending categories.
    }
  }

  const { overspent, overspending_type } = classifyOverspending(envelope.available, {
    isCreditCardPaymentCategory: isCcPayment,
    hadCreditOverspending: hadCreditOverspending && envelope.available < 0,
  });

  return {
    assigned: budgeted,
    activity: envelope.activity,
    available: envelope.available,
    previous_available: previousAvailable,
    spending: envelope.spending,
    inflows: envelope.inflows,
    adjustments: envelope.adjustments,
    card_payments: envelope.cardPayments,
    overspent,
    overspending_type,
    is_current_month: isCurrentCalendarMonth,
  };
}

module.exports = {
  roundMoney,
  computeCategoryAvailable,
  classifyOverspending,
  getCategoryTransactionTotals,
  getCreditOverspendingFlag,
  buildCategoryEnvelopeRow,
};
