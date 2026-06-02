/**
 * Ready to Assign — system income category (stored as category_id = null in DB).
 */

const READY_TO_ASSIGN_CATEGORY_ID = 'inflow_ready_to_assign';
const READY_TO_ASSIGN_LABEL = 'Ready to Assign';
const READY_TO_ASSIGN_OPTION_LABEL = 'Ready to Assign';
const READY_TO_ASSIGN_VALIDATION_MSG =
  'Ready to Assign is only available for income transactions.';

const RTA_SENTINELS = new Set([
  READY_TO_ASSIGN_CATEGORY_ID,
  'ready_to_assign',
  'system-ready-to-assign',
]);

function isReadyToAssignSentinel(value) {
  if (value == null || value === '') return false;
  return RTA_SENTINELS.has(String(value));
}

function isTransferLike(tx) {
  if (!tx) return false;
  if (tx.is_transfer === 1 || tx.is_transfer === true) return true;
  const payee = String(tx.payee || tx.description || '').trim();
  return payee.startsWith('Transfer:');
}

function isIncomeTransaction(tx) {
  if (!tx) return false;
  if (isTransferLike(tx)) return false;
  if (tx.direction === 'inflow') return true;
  if (tx.direction === 'outflow') return false;
  const amount = Number(tx.amount);
  return Number.isFinite(amount) && amount > 0;
}

function isOutflowTransaction(tx) {
  if (!tx) return false;
  if (isTransferLike(tx)) return false;
  if (tx.direction === 'outflow') return true;
  if (tx.direction === 'inflow') return false;
  const amount = Number(tx.amount);
  return Number.isFinite(amount) && amount < 0;
}

function normalizeCategoryIdForStorage(categoryId, { isIncome } = {}) {
  if (!isReadyToAssignSentinel(categoryId)) {
    if (categoryId === '' || categoryId == null) return null;
    return categoryId;
  }
  if (!isIncome) return categoryId;
  return null;
}

function categorySelectValueForTransaction(tx) {
  if (!tx || isTransferLike(tx)) return '';
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

function buildCategoryDropdownOptions(categories, { isIncome, includeReadyToAssign = true } = {}) {
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

function buildIncomeCategoryOptions(categories, options = {}) {
  return buildCategoryDropdownOptions(categories, { isIncome: true, ...options });
}

function validateReadyToAssignSelection(categoryId, { isIncome, isTransfer } = {}) {
  if (!isReadyToAssignSentinel(categoryId)) return { ok: true };
  if (isTransfer) return { ok: false, message: READY_TO_ASSIGN_VALIDATION_MSG };
  if (!isIncome) return { ok: false, message: READY_TO_ASSIGN_VALIDATION_MSG };
  return { ok: true };
}

function resolveReadyToAssignDisplayName(categoryId) {
  return isReadyToAssignSentinel(categoryId) ? READY_TO_ASSIGN_LABEL : null;
}

function learnRuleCategoryId(storedCategoryId, tx, rawCategoryId) {
  if (storedCategoryId) return storedCategoryId;
  if (isReadyToAssignSentinel(rawCategoryId)) return READY_TO_ASSIGN_CATEGORY_ID;
  return null;
}

module.exports = {
  READY_TO_ASSIGN_CATEGORY_ID,
  READY_TO_ASSIGN_LABEL,
  READY_TO_ASSIGN_OPTION_LABEL,
  READY_TO_ASSIGN_VALIDATION_MSG,
  isReadyToAssignSentinel,
  isIncomeTransaction,
  isOutflowTransaction,
  normalizeCategoryIdForStorage,
  categorySelectValueForTransaction,
  buildCategoryDropdownOptions,
  buildIncomeCategoryOptions,
  validateReadyToAssignSelection,
  resolveReadyToAssignDisplayName,
  learnRuleCategoryId,
};
