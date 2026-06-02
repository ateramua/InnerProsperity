/**
 * Merge API/update payloads into an in-memory transaction row (register views).
 */
import {
  isReadyToAssignSentinel,
  READY_TO_ASSIGN_LABEL,
} from './readyToAssignCategory.jsx';

export function normalizeCategoryId(value) {
  if (isReadyToAssignSentinel(value)) return null;
  if (value === '' || value == null) return null;
  return value;
}

export function applyTransactionPatch(existing, patch, { categories = [] } = {}) {
  if (!existing || !patch) return existing;

  const hasCategoryChange =
    Object.prototype.hasOwnProperty.call(patch, 'category_id') ||
    Object.prototype.hasOwnProperty.call(patch, 'categoryId');

  let categoryId = existing.category_id;
  if (hasCategoryChange) {
    categoryId = normalizeCategoryId(patch.category_id ?? patch.categoryId);
  }

  const cat = categoryId
    ? (categories || []).find((c) => String(c.id) === String(categoryId))
    : null;

  const amount = Number(patch.amount ?? existing.amount);
  const categoryName = hasCategoryChange
    ? cat?.name ??
      patch.category_name ??
      patch.categoryName ??
      (isReadyToAssignSentinel(patch.category_id ?? patch.categoryId) ||
      (categoryId == null && Number.isFinite(amount) && amount > 0)
        ? READY_TO_ASSIGN_LABEL
        : categoryId
          ? existing.category_name
          : null)
    : patch.category_name ?? patch.categoryName ?? existing.category_name ?? existing.categoryName;

  const next = {
    ...existing,
    ...patch,
    category_id: categoryId,
    categoryId,
    category_name: categoryName,
    categoryName,
  };

  if (hasCategoryChange) {
    next.mapping_status = categoryId ? 'categorized' : 'uncategorized';
    next.suggested_category_id = patch.suggested_category_id ?? null;
    next.suggested_category_source = patch.suggested_category_source ?? null;
    next.suggested_category_confidence = patch.suggested_category_confidence ?? null;
  }

  if (patch.cleared !== undefined) {
    next.is_cleared = patch.cleared ? 1 : 0;
  }
  if (patch.is_cleared !== undefined) {
    next.is_cleared = patch.is_cleared;
  }

  return next;
}
