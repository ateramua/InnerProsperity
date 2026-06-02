/**
 * Ready to Assign — system income category (renderer).
 * Keep in sync with src/shared/readyToAssignCategory.cjs
 */

import { isTransferTransaction } from './transferPayeeUtils.jsx';

export const READY_TO_ASSIGN_CATEGORY_ID = 'inflow_ready_to_assign';
export const READY_TO_ASSIGN_LABEL = 'Ready to Assign';
export const READY_TO_ASSIGN_OPTION_LABEL = 'Ready to Assign';
export const READY_TO_ASSIGN_VALIDATION_MSG =
  'Ready to Assign is only available for income transactions.';

const RTA_SENTINELS = new Set([
  READY_TO_ASSIGN_CATEGORY_ID,
  'ready_to_assign',
  'system-ready-to-assign',
]);

export function isReadyToAssignSentinel(value) {
  if (value == null || value === '') return false;
  return RTA_SENTINELS.has(String(value));
}

export function isIncomeTransaction(tx) {
  if (!tx) return false;
  if (isTransferTransaction(tx)) return false;
  if (tx.direction === 'inflow') return true;
  if (tx.direction === 'outflow') return false;
  const amount = Number(tx.amount);
  return Number.isFinite(amount) && amount > 0;
}

export function isOutflowTransaction(tx) {
  if (!tx) return false;
  if (isTransferTransaction(tx)) return false;
  if (tx.direction === 'outflow') return true;
  if (tx.direction === 'inflow') return false;
  const amount = Number(tx.amount);
  return Number.isFinite(amount) && amount < 0;
}

export function normalizeCategoryIdForStorage(categoryId, { isIncome } = {}) {
  if (!isReadyToAssignSentinel(categoryId)) {
    if (categoryId === '' || categoryId == null) return null;
    return categoryId;
  }
  if (!isIncome) return categoryId;
  return null;
}

export function categorySelectValueForTransaction(tx) {
  if (!tx || isTransferTransaction(tx)) return '';
  const id = tx.category_id ?? tx.categoryId;
  if (id != null && id !== '') {
    return isReadyToAssignSentinel(id) ? READY_TO_ASSIGN_CATEGORY_ID : String(id);
  }
  if (isIncomeTransaction(tx)) return READY_TO_ASSIGN_CATEGORY_ID;
  return '';
}

function isCategoryArchived(cat) {
  const a = cat?.archived;
  return a === true || a === 1 || a === '1' || a === 'true';
}

export function buildCategoryDropdownOptions(categories, { isIncome, includeReadyToAssign = true } = {}) {
  const opts = [];
  if (isIncome && includeReadyToAssign) {
    opts.push({
      id: READY_TO_ASSIGN_CATEGORY_ID,
      name: READY_TO_ASSIGN_OPTION_LABEL,
      system: true,
    });
  }
  for (const cat of categories || []) {
    if (!cat?.id || cat.id === '') continue;
    if (cat.is_system === 1 || cat.is_system === true) continue;
    if (isCategoryArchived(cat)) continue;
    const type = String(cat.type || '').toLowerCase();
    if (isIncome && type === 'expense') continue;
    opts.push(cat);
  }
  return opts;
}

export function buildIncomeCategoryOptions(categories, options = {}) {
  return buildCategoryDropdownOptions(categories, { isIncome: true, ...options });
}

export function validateReadyToAssignSelection(categoryId, { isIncome, isTransfer } = {}) {
  if (!isReadyToAssignSentinel(categoryId)) return { ok: true };
  if (isTransfer) return { ok: false, message: READY_TO_ASSIGN_VALIDATION_MSG };
  if (!isIncome) return { ok: false, message: READY_TO_ASSIGN_VALIDATION_MSG };
  return { ok: true };
}

export function resolveReadyToAssignDisplayName(categoryId) {
  return isReadyToAssignSentinel(categoryId) ? READY_TO_ASSIGN_LABEL : null;
}
