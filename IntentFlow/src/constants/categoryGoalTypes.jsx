/** Stored `categories.target_type` values and UI labels for Goal Type dropdowns. */
export const CATEGORY_GOAL_TYPE_OPTIONS = [
  { value: 'balance', label: 'Target Category Balance' },
  { value: 'by_date', label: 'Target Category Balance by Date' },
  { value: 'monthly', label: 'Monthly Funding Goal' },
  { value: 'spending_target', label: 'Needed for Spending' },
];

/** Funding frequency for category goals (`categories.target_frequency`). */
export const CATEGORY_GOAL_FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Monthly', supported: true },
  { value: 'weekly', label: 'Weekly', supported: true },
  { value: 'every_2_weeks', label: 'Every 2 Weeks', supported: true },
  { value: 'twice_monthly', label: 'Twice Monthly', supported: true },
  { value: 'quarterly', label: 'Quarterly', supported: true },
  { value: 'yearly', label: 'Yearly', supported: true },
  { value: 'custom_dates', label: 'Custom Dates', supported: true },
];

const LABEL_BY_VALUE = Object.fromEntries(
  CATEGORY_GOAL_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

const FREQUENCY_LABEL_BY_VALUE = Object.fromEntries(
  CATEGORY_GOAL_FREQUENCY_OPTIONS.map((o) => [o.value, o.label]),
);

/** @param {string | null | undefined} targetType */
export function getCategoryGoalTypeLabel(targetType) {
  if (targetType === 'monthly_debt_payment') {
    return LABEL_BY_VALUE.monthly;
  }
  if (targetType === 'needed_for_spending') {
    return LABEL_BY_VALUE.spending_target;
  }
  return LABEL_BY_VALUE[targetType] || 'Other';
}

/** @param {string | null | undefined} targetFrequency */
export function getCategoryGoalFrequencyLabel(targetFrequency) {
  if (!targetFrequency) return FREQUENCY_LABEL_BY_VALUE.monthly;
  return FREQUENCY_LABEL_BY_VALUE[targetFrequency] || 'Monthly';
}

/** Map legacy or unknown values to a value present in the frequency dropdown. */
export function normalizeGoalFrequencyForSelect(targetFrequency) {
  if (CATEGORY_GOAL_FREQUENCY_OPTIONS.some((o) => o.value === targetFrequency)) {
    return targetFrequency;
  }
  return 'monthly';
}

/** Map legacy types to a value present in the dropdown. */
export function normalizeGoalTypeForSelect(targetType) {
  if (targetType === 'monthly_debt_payment') return 'monthly';
  if (targetType === 'needed_for_spending') return 'spending_target';
  if (CATEGORY_GOAL_TYPE_OPTIONS.some((o) => o.value === targetType)) return targetType;
  return 'monthly';
}
