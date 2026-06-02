import React from 'react';
import { isValidActivityAmount } from '../../utils/activityDrilldownUtils.jsx';

const btnClass =
  'font-inherit text-inherit underline decoration-dotted underline-offset-4 hover:text-[#93C5FD] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 rounded-sm cursor-pointer';

/**
 * Clickable Activity cell on the Prosperity Map budget table.
 */
export default function ActivityDrilldownCell({ activity, categoryId, categoryName, monthKey, onDrillDown }) {
  const amount = Number(activity) || 0;
  const clickable = Boolean(onDrillDown && categoryId && monthKey && isValidActivityAmount(activity));

  if (!clickable) {
    return <span>{formatCurrency(amount)}</span>;
  }

  return (
    <button
      type="button"
      className={btnClass}
      title="View transactions for this activity"
      aria-label={`View transactions for ${categoryName || 'category'} activity`}
      onClick={() =>
        onDrillDown({
          categoryId,
          categoryName,
          month: monthKey,
          activityAmount: amount,
        })
      }
    >
      {formatCurrency(amount)}
    </button>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number(value) || 0
  );
}
