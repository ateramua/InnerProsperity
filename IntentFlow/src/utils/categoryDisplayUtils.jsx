/**
 * Resolve category labels for transaction rows (register tables).
 */

import { isIncomeTransaction } from './readyToAssignCategory.jsx';
import { isTransferTransaction } from './transferPayeeUtils.jsx';

export function buildCategoryByIdMap(categories) {
  const map = new Map();
  for (const c of categories || []) {
    if (c?.id != null && c.id !== '') {
      map.set(String(c.id), c);
    }
  }
  return map;
}

export function resolveTransactionCategoryName(tx, categoryById) {
  if (!tx) return null;
  if (isTransferTransaction(tx)) return null;
  const stored = tx.category_name || tx.categoryName;
  if (stored) return stored;
  const id = tx.category_id ?? tx.categoryId;
  if (id == null || id === '') {
    return isIncomeTransaction(tx) ? 'Ready to Assign' : null;
  }
  return categoryById?.get(String(id))?.name ?? null;
}

export function enrichTransactionsWithCategoryNames(transactions, categories) {
  const categoryById = buildCategoryByIdMap(categories);
  return (transactions || []).map((tx) => {
    const name = resolveTransactionCategoryName(tx, categoryById);
    if (!name) return tx;
    return {
      ...tx,
      category_name: name,
      categoryName: name,
    };
  });
}
