/**
 * Shared labels and formatting for transaction tables.
 */

import { resolveTransactionCategoryName } from './categoryDisplayUtils.jsx';
import { isReadyToAssignSentinel, READY_TO_ASSIGN_LABEL } from './readyToAssignCategory.jsx';
import { resolveTransactionDisplayColumns } from './accountBalanceEngine.jsx';

export function formatTransactionCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(amount) || 0));
}

export function getTransactionCategoryLabel(tx, category, categoryById) {
  if (!tx) return '—';
  if (tx.isLoanPayment) return '🏦 Loan Transfer';
  if (tx.isCreditCardPayment) return '💳 Credit Card Transfer';
  if (tx.is_transfer === 1) return '🔄 Account Transfer';
  if (tx.is_split_parent === 1) return 'Split';
  const resolvedName = resolveTransactionCategoryName(tx, categoryById);
  if (resolvedName) return resolvedName;
  if (category?.name) return category.name;
  if (
    (tx.mapping_status === 'needs_review' || tx.suggested_category_id) &&
    categoryById &&
    tx.suggested_category_id
  ) {
    if (isReadyToAssignSentinel(tx.suggested_category_id)) {
      const prefix = tx.suggested_category_source === 'ml' ? 'ML: ' : '';
      return `${prefix}${READY_TO_ASSIGN_LABEL} (suggested)`;
    }
    const suggested = categoryById.get(String(tx.suggested_category_id));
    if (suggested?.name) {
      const prefix = tx.suggested_category_source === 'ml' ? 'ML: ' : '';
      const conf = Number(tx.suggested_category_confidence);
      const pct =
        tx.suggested_category_source === 'ml' && Number.isFinite(conf) && conf > 0
          ? ` ${Math.round(conf * 100)}%`
          : '';
      return `${prefix}${suggested.name} (suggested${pct})`;
    }
  }
  const categoryId = tx.category_id ?? tx.categoryId;
  if (Number(tx.amount) > 0 && !categoryId) return 'Ready to Assign';
  if (!categoryId) return 'Uncategorized';
  return 'Uncategorized';
}

export function getTransactionOutflow(tx) {
  const { outflow } = resolveTransactionDisplayColumns(tx);
  return outflow > 0 ? formatTransactionCurrency(outflow) : '';
}

export function getTransactionInflow(tx) {
  const { inflow } = resolveTransactionDisplayColumns(tx);
  return inflow > 0 ? formatTransactionCurrency(inflow) : '';
}

export function getTransactionPayee(tx) {
  return tx?.payee || tx?.description || '—';
}
