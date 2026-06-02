import React from 'react';

const btnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  fontSize: '1rem',
  lineHeight: 1,
};

export function canSplitRegisterTransaction(tx) {
  return (
    tx?.is_transfer !== 1 &&
    tx?.is_system !== 1 &&
    tx?.is_split_parent !== 1 &&
    Math.abs(Number(tx?.amount) || 0) > 0
  );
}

/**
 * Action column controls shared with All Accounts register (split, edit, delete, cleared).
 */
export default function RegisterTransactionActions({
  transaction,
  onEdit,
  onDelete,
  onToggleCleared,
  onSplit,
  showSplit = true,
  showEdit = true,
  showDelete = true,
  showCleared = true,
}) {
  const tx = transaction;
  const canSplit = showSplit && onSplit && canSplitRegisterTransaction(tx);
  const cleared = tx?.is_cleared === 1 || tx?.cleared === 1;

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'nowrap' }}
      onClick={(e) => e.stopPropagation()}
    >
      {canSplit && (
        <button
          type="button"
          onClick={() => onSplit(tx)}
          style={btnStyle}
          title="Split across categories"
          aria-label="Split transaction"
        >
          ⫽
        </button>
      )}
      {showEdit && onEdit && (
        <button
          type="button"
          onClick={() => onEdit(tx)}
          style={btnStyle}
          title="Edit"
          aria-label="Edit transaction"
        >
          ✏️
        </button>
      )}
      {showDelete && onDelete && (
        <button
          type="button"
          onClick={() => onDelete(tx.id)}
          style={btnStyle}
          title="Delete"
          aria-label="Delete transaction"
        >
          🗑️
        </button>
      )}
      {showCleared && onToggleCleared && (
        <input
          type="checkbox"
          checked={cleared}
          onChange={() => onToggleCleared(tx.id, cleared)}
          title="Cleared"
          aria-label="Mark cleared"
          style={{ marginLeft: '0.15rem', verticalAlign: 'middle', cursor: 'pointer' }}
        />
      )}
    </span>
  );
}
