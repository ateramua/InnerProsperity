import React from 'react';
import {
  buildCategoryDropdownOptions,
  isReadyToAssignSentinel,
  READY_TO_ASSIGN_LABEL,
} from '../../utils/readyToAssignCategory.jsx';

/**
 * Category <option> list for transaction forms and register edits.
 * @param {boolean} isIncome — show Ready to Assign first when true
 */
export function TransactionCategorySelectOptions({
  categories = [],
  isIncome = false,
  emptyLabel = 'Uncategorized',
  emptyValue = '',
  suggestedId = null,
  suggestedSource = null,
}) {
  const opts = buildCategoryDropdownOptions(categories, { isIncome });
  const suggestedPreselect = suggestedId && suggestedSource === 'rule';
  const suggestedLabel = isReadyToAssignSentinel(suggestedId)
    ? READY_TO_ASSIGN_LABEL
    : (categories || []).find((c) => String(c.id) === String(suggestedId))?.name;

  return (
    <>
      {emptyLabel != null && <option value={emptyValue}>{emptyLabel}</option>}
      {opts.map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
          {suggestedPreselect && String(cat.id) === String(suggestedId) ? ' (Suggested)' : ''}
        </option>
      ))}
      {suggestedPreselect &&
        suggestedLabel &&
        !opts.some((c) => String(c.id) === String(suggestedId)) && (
          <option value={suggestedId}>{suggestedLabel} (Suggested)</option>
        )}
    </>
  );
}
