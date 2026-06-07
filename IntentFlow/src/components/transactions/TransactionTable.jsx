import React, { useEffect, useMemo, useRef } from 'react';
import { sortIndicator } from '../../utils/transactionSortUtils.jsx';
import { buildCategoryByIdMap } from '../../utils/categoryDisplayUtils.jsx';
import {
  formatTransactionCurrency,
  getTransactionCategoryLabel,
  getTransactionInflow,
  getTransactionOutflow,
  getTransactionPayee,
} from '../../utils/transactionDisplayUtils.jsx';
import { InlinePayeeField, InlineCategoryField } from './InlineTransactionFields.jsx';
import { isTransactionSelected, normalizeTransactionId } from '../../utils/transactionSelectionUtils.jsx';

const styles = {
  container: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '640px',
  },
  thead: {
    background: '#111827',
  },
  th: {
    padding: '0.75rem 1rem',
    textAlign: 'left',
    color: '#9CA3AF',
    fontWeight: 600,
    fontSize: '0.75rem',
    borderBottom: '1px solid #374151',
    whiteSpace: 'nowrap',
  },
  thRight: {
    textAlign: 'right',
  },
  sortBtn: {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    padding: 0,
    font: 'inherit',
    fontWeight: 600,
  },
  tr: {
    borderBottom: '1px solid #374151',
  },
  trClickable: {
    cursor: 'pointer',
  },
  trSelected: {
    background: 'rgba(59, 130, 246, 0.12)',
  },
  trHighlighted: {
    background: 'rgba(16, 185, 129, 0.14)',
    boxShadow: 'inset 3px 0 0 #10B981',
  },
  trFocused: {
    background: 'rgba(16, 185, 129, 0.24)',
    boxShadow: 'inset 4px 0 0 #34D399',
    outline: 'none',
  },
  td: {
    padding: '0.75rem 1rem',
    color: '#F3F4F6',
    fontSize: '0.875rem',
    verticalAlign: 'middle',
  },
  tdMuted: {
    color: '#9CA3AF',
  },
  tdOutflow: {
    color: '#F87171',
    textAlign: 'right',
    fontWeight: 600,
  },
  tdInflow: {
    color: '#4ADE80',
    textAlign: 'right',
    fontWeight: 600,
  },
  tdBalance: {
    color: '#E5E7EB',
    textAlign: 'right',
    fontWeight: 600,
  },
  tdActions: {
    whiteSpace: 'nowrap',
  },
  empty: {
    padding: '2rem 1rem',
    textAlign: 'center',
    color: '#9CA3AF',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
};

const BASE_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'payee', label: 'Payee' },
  { key: 'category', label: 'Category' },
  { key: 'outflow', label: 'Outflow', align: 'right' },
  { key: 'inflow', label: 'Inflow', align: 'right' },
];

function buildDisplayColumns(showAccountColumn) {
  if (!showAccountColumn) return BASE_COLUMNS;
  return [
    BASE_COLUMNS[0],
    { key: 'account', label: 'Account' },
    ...BASE_COLUMNS.slice(1),
  ];
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '—';
  const s = String(dateStr).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${Number(m)}/${Number(d)}/${y}`;
}

/**
 * Unified transaction table: Date | Payee | Category | Outflow | Inflow
 */
function TransactionTable({
  transactions = [],
  categories = [],
  sort,
  onSortChange,
  emptyMessage = 'No transactions found',
  showCheckbox = false,
  selectedIds = null,
  onToggleSelect,
  onSelectAll,
  allSelected = false,
  someSelected = false,
  onRowClick,
  isRowSelected,
  isRowHighlighted,
  focusedTransactionId = null,
  renderActions,
  renderLeadingCell,
  editingId = null,
  renderEditRow,
  formatDate = formatDisplayDate,
  showAccountColumn = false,
  onAccountClick,
  renderPayeeExtra,
  showRunningBalance = false,
  formatRunningBalance,
  virtualPaddingTop = 0,
  virtualPaddingBottom = 0,
  enableInlineEdit = false,
  onInlineUpdate,
  isInlineEditDisabled,
  isCategoryInlineDisabled,
  isPayeeInlineDisabled,
  registerPayees = null,
  registerPayeesLoading = false,
}) {
  const categoryById = useMemo(() => buildCategoryByIdMap(categories), [categories]);
  const displayColumns = buildDisplayColumns(showAccountColumn);
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = Boolean(someSelected);
    }
  }, [someSelected, allSelected]);

  const handleSort = (key) => {
    if (!onSortChange || !sort) return;
    const prev = sort;
    const nextDir = prev.key === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : key === 'date' ? 'desc' : 'asc';
    onSortChange({ key, dir: nextDir });
  };

  const colSpan =
    displayColumns.length +
    (showRunningBalance ? 1 : 0) +
    (showCheckbox ? 1 : 0) +
    (renderLeadingCell ? 1 : 0) +
    (renderActions ? 1 : 0);

  return (
    <div style={styles.container}>
      {focusedTransactionId ? (
        <style>{`
          @keyframes activityDrilldownFocusPulse {
            0%, 100% { box-shadow: inset 4px 0 0 #34D399, 0 0 0 2px rgba(52, 211, 153, 0.35); }
            50% { box-shadow: inset 4px 0 0 #34D399, 0 0 0 5px rgba(52, 211, 153, 0.5); }
          }
          tr[data-tx-focused="true"] {
            animation: activityDrilldownFocusPulse 1.4s ease-in-out 4;
          }
        `}</style>
      ) : null}
      <table style={styles.table}>
        <thead style={styles.thead}>
          <tr>
            {showCheckbox && (
              <th style={{ ...styles.th, width: '40px' }}>
                {onSelectAll ? (
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={onSelectAll}
                    style={styles.checkbox}
                    aria-label="Select all transactions matching filters"
                  />
                ) : null}
              </th>
            )}
            {renderLeadingCell ? <th style={{ ...styles.th, width: '40px' }} /> : null}
            {displayColumns.map((col) => (
              <th
                key={col.key}
                style={{
                  ...styles.th,
                  ...(col.align === 'right' ? styles.thRight : null),
                }}
              >
                {onSortChange ? (
                  <button
                    type="button"
                    style={styles.sortBtn}
                    onClick={() => handleSort(col.key)}
                    title={`Sort by ${col.label}`}
                  >
                    {col.label}
                    {sortIndicator(sort, col.key)}
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
            {showRunningBalance && (
              <th style={{ ...styles.th, ...styles.thRight }}>Balance</th>
            )}
            {renderActions ? (
              <th style={{ ...styles.th, textAlign: 'center' }}>Actions</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {virtualPaddingTop > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={colSpan} style={{ height: virtualPaddingTop, padding: 0, border: 'none' }} />
            </tr>
          ) : null}
          {transactions.length === 0 && virtualPaddingTop === 0 && virtualPaddingBottom === 0 ? (
            <tr>
              <td colSpan={colSpan} style={styles.empty}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            transactions.map((tx) => {
              if (editingId === tx.id && renderEditRow) {
                return (
                  <React.Fragment key={tx.id}>{renderEditRow(tx)}</React.Fragment>
                );
              }

              const category =
                tx.category_id != null && tx.category_id !== ''
                  ? categoryById.get(String(tx.category_id))
                  : undefined;
              const selected = isRowSelected
                ? isRowSelected(tx)
                : selectedIds instanceof Set
                  ? isTransactionSelected(selectedIds, tx.id)
                  : Array.isArray(selectedIds)
                    ? selectedIds.some((id) => normalizeTransactionId(id) === normalizeTransactionId(tx.id))
                    : false;
              const highlighted = isRowHighlighted ? isRowHighlighted(tx) : false;
              const focused =
                focusedTransactionId != null &&
                String(focusedTransactionId) === String(tx.id);

              return (
                <tr
                  key={tx.id}
                  data-tx-id={tx.id}
                  data-tx-focused={focused ? 'true' : undefined}
                  tabIndex={focused ? -1 : undefined}
                  aria-current={focused ? 'true' : undefined}
                  style={{
                    ...styles.tr,
                    ...(onRowClick ? styles.trClickable : null),
                    ...(selected ? styles.trSelected : null),
                    ...(highlighted && !focused ? styles.trHighlighted : null),
                    ...(focused ? styles.trFocused : null),
                  }}
                  onClick={onRowClick ? () => onRowClick(tx) : undefined}
                >
                  {showCheckbox && (
                    <td style={styles.td}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggleSelect?.(tx.id, tx);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={styles.checkbox}
                      />
                    </td>
                  )}
                  {renderLeadingCell ? (
                    <td style={styles.td}>{renderLeadingCell(tx)}</td>
                  ) : null}
                  {displayColumns.map((col) => {
                    if (col.key === 'date') {
                      return (
                        <td key="date" style={{ ...styles.td, ...styles.tdMuted }}>
                          {formatDate(tx.date)}
                        </td>
                      );
                    }
                    if (col.key === 'account') {
                      const accountLabel = tx.account_name || tx.account_id || '—';
                      return (
                        <td key="account" style={styles.td}>
                          {onAccountClick && tx.account_id ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onAccountClick(tx.account_id, tx);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#60A5FA',
                                cursor: 'pointer',
                                padding: 0,
                                font: 'inherit',
                                fontWeight: 600,
                                textAlign: 'left',
                                textDecoration: 'underline',
                              }}
                            >
                              {accountLabel}
                            </button>
                          ) : (
                            accountLabel
                          )}
                        </td>
                      );
                    }
                    if (col.key === 'payee') {
                      const payeeDisabled =
                        isPayeeInlineDisabled?.(tx) ?? isInlineEditDisabled?.(tx);
                      return (
                        <td key="payee" style={styles.td}>
                          {enableInlineEdit && onInlineUpdate ? (
                            <InlinePayeeField
                              transaction={tx}
                              onSave={onInlineUpdate}
                              disabled={payeeDisabled}
                              payees={registerPayees}
                              payeesLoading={registerPayeesLoading}
                            />
                          ) : (
                            getTransactionPayee(tx)
                          )}
                          {renderPayeeExtra ? renderPayeeExtra(tx) : null}
                        </td>
                      );
                    }
                    if (col.key === 'category') {
                      const categoryDisabled =
                        isCategoryInlineDisabled?.(tx) ?? isInlineEditDisabled?.(tx);
                      return (
                        <td key="category" style={{ ...styles.td, ...styles.tdMuted }}>
                          {enableInlineEdit && onInlineUpdate ? (
                            <InlineCategoryField
                              transaction={tx}
                              categories={categories}
                              onSave={onInlineUpdate}
                              disabled={categoryDisabled}
                            />
                          ) : (
                            tx.categoryName ||
                              getTransactionCategoryLabel(tx, category, categoryById)
                          )}
                        </td>
                      );
                    }
                    if (col.key === 'outflow') {
                      return (
                        <td key="outflow" style={{ ...styles.td, ...styles.tdOutflow }}>
                          {getTransactionOutflow(tx)}
                        </td>
                      );
                    }
                    if (col.key === 'inflow') {
                      return (
                        <td key="inflow" style={{ ...styles.td, ...styles.tdInflow }}>
                          {getTransactionInflow(tx)}
                        </td>
                      );
                    }
                    return null;
                  })}
                  {showRunningBalance && (
                    <td style={{ ...styles.td, ...styles.tdBalance }}>
                      {tx.running_balance != null
                        ? (formatRunningBalance
                            ? formatRunningBalance(tx.running_balance)
                            : formatTransactionCurrency(tx.running_balance))
                        : '—'}
                    </td>
                  )}
                  {renderActions ? (
                    <td style={{ ...styles.td, ...styles.tdActions }}>{renderActions(tx)}</td>
                  ) : null}
                </tr>
              );
            })
          )}
          {virtualPaddingBottom > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={colSpan} style={{ height: virtualPaddingBottom, padding: 0, border: 'none' }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default React.memo(TransactionTable);

export { formatDisplayDate as formatTransactionTableDate };
