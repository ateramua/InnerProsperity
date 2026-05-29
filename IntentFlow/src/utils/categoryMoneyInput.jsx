/**
 * Shared parsing/formatting for category money fields (assigned, goal target).
 * Uses string inputs in the UI to avoid number-input quirks (0 clearing, step validation).
 */

export const sameCategoryId = (a, b) => {
  if (a == null || b == null) return false;
  return String(a) === String(b);
};

export const parseMoneyInput = (raw) => {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return 0;
  const normalized = trimmed.replace(/,/g, '');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : NaN;
};

export const formatMoneyInput = (amount) => {
  if (amount === null || amount === undefined) return '';
  return String(amount);
};

export const mapGoalTargetFromDb = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
