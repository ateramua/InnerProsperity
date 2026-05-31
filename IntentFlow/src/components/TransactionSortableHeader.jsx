import React from 'react';
import { getNextSortState, sortIndicator } from '../utils/transactionSortUtils.jsx';

const sortBtnBase = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  padding: 0,
  font: 'inherit',
  fontWeight: 600,
  textAlign: 'left',
};

/**
 * Clickable column headers for flex-layout transaction tables.
 * @param {{ sort: object, onSortChange: (s: object) => void, columns: { key: string, label: string, style?: object }[], leading?: React.ReactNode }}
 */
export default function TransactionSortableHeader({
  sort,
  onSortChange,
  columns,
  leading = null,
  rowStyle = {},
}) {
  const handleClick = (key) => {
    onSortChange(getNextSortState(sort, key));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', ...rowStyle }}>
      {leading}
      {columns.map((col) => (
        <button
          key={col.key}
          type="button"
          style={{ ...sortBtnBase, ...col.style }}
          onClick={() => handleClick(col.key)}
          title={`Sort by ${col.label}`}
        >
          {col.label}
          {sortIndicator(sort, col.key)}
        </button>
      ))}
    </div>
  );
}
