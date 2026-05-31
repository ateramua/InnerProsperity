/**
 * Shared labels and formatting for transaction tables.
 */

export function formatTransactionCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(amount) || 0));
}

export function getTransactionCategoryLabel(tx, category) {
  if (!tx) return '—';
  if (tx.isLoanPayment) return '🏦 Loan Transfer';
  if (tx.isCreditCardPayment) return '💳 Credit Card Transfer';
  if (tx.is_transfer === 1) return '🔄 Account Transfer';
  if (category?.name) return category.name;
  if (Number(tx.amount) > 0 && !tx.category_id) return 'Ready to Assign';
  if (!tx.category_id) return '—';
  return 'Uncategorized';
}

export function getTransactionOutflow(tx) {
  if (tx?.direction === 'outflow') {
    return formatTransactionCurrency(tx.amount);
  }
  const amount = Number(tx?.amount);
  return Number.isFinite(amount) && amount < 0 ? formatTransactionCurrency(amount) : '';
}

export function getTransactionInflow(tx) {
  if (tx?.direction === 'inflow') {
    return formatTransactionCurrency(tx.amount);
  }
  const amount = Number(tx?.amount);
  return Number.isFinite(amount) && amount > 0 ? formatTransactionCurrency(amount) : '';
}

export function getTransactionPayee(tx) {
  return tx?.payee || tx?.description || '—';
}
