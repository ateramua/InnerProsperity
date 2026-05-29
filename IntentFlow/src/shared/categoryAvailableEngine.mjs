/**
 * ESM export for renderer (Prosperity Map). Keep in sync with categoryAvailableEngine.cjs.
 */

export function roundMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function computeCategoryAvailable(params) {
  const previousAvailable = roundMoney(params.previousAvailable);
  const assigned = roundMoney(params.assigned);
  const totals = params.totals || {};
  const spending = roundMoney(totals.spending);
  const inflows = roundMoney(totals.inflows);
  const adjustments = roundMoney(totals.adjustments);
  const cardPayments = roundMoney(totals.cardPayments);

  if (params.isCreditCardPaymentCategory) {
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

export function classifyOverspending(available, opts = {}) {
  if (available >= -0.005) {
    return { overspent: false, overspending_type: null };
  }
  if (opts.hadCreditOverspending && !opts.isCreditCardPaymentCategory) {
    return { overspent: true, overspending_type: 'credit' };
  }
  return { overspent: true, overspending_type: 'cash' };
}

/** Derive display Available from snapshot fields (client-side refresh between IPC loads). */
export function deriveAvailableFromCategoryRow(cat) {
  const totals = {
    spending: Number(cat.spending) || 0,
    inflows: Number(cat.inflows) || 0,
    adjustments: Number(cat.adjustments) || 0,
    cardPayments: Number(cat.card_payments) || 0,
  };
  if (
    totals.spending === 0 &&
    totals.inflows === 0 &&
    totals.cardPayments === 0 &&
    cat.activity != null
  ) {
    const activity = Number(cat.activity) || 0;
    if (activity >= 0) totals.spending = activity;
    else totals.inflows = -activity;
  }
  return computeCategoryAvailable({
    previousAvailable: cat.previous_available ?? 0,
    assigned: cat.assigned ?? 0,
    totals,
    isCreditCardPaymentCategory:
      cat.is_credit_card_payment_category === 1 ||
      cat.is_credit_card_payment_category === true,
  });
}
