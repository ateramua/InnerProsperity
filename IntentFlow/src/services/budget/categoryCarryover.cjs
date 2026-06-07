/**
 * Per-category month rollover carryover rules.
 * carryover_mode: 'carry' (default) | 'reset'
 */

function resolveCategoryCarryover(category, prevMonthAvailable) {
  const mode = String(category?.carryover_mode || 'carry').trim().toLowerCase();
  const prev = Number(prevMonthAvailable) || 0;
  if (mode === 'reset') return 0;
  return prev;
}

module.exports = {
  resolveCategoryCarryover,
};
