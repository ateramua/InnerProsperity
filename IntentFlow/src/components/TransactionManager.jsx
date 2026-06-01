import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import useDebouncedValue from '../hooks/useDebouncedValue.jsx';
import PlaidTxnBadge from './PlaidTxnBadge';
import {
  DEFAULT_TRANSACTION_SORT,
  sortTransactions,
} from '../utils/transactionSortUtils.jsx';
import {
  DEFAULT_TRANSACTION_FILTERS,
  filterTransactions,
} from '../utils/transactionFilterUtils.jsx';
import TransactionToolbar from './transactions/TransactionToolbar.jsx';
import TransactionTable from './transactions/TransactionTable.jsx';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const VIRTUAL_ROW_HEIGHT = 52;
const VIRTUAL_THRESHOLD = 100;
const VIRTUAL_OVERSCAN = 12;

const editStyles = {
  input: {
    width: '100%',
    padding: '0.4rem',
    background: '#111827',
    border: '1px solid #10B981',
    borderRadius: '0.375rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  select: {
    width: '100%',
    padding: '0.4rem',
    background: '#111827',
    border: '1px solid #10B981',
    borderRadius: '0.375rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  td: {
    padding: '0.75rem 1rem',
    background: 'rgba(16, 185, 129, 0.08)',
    borderBottom: '1px solid #374151',
  },
  actionBtn: {
    padding: '0.25rem 0.5rem',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.75rem',
    marginRight: '0.35rem',
  },
};

const bulkBarStyles = {
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    alignItems: 'center',
    padding: '0.65rem 1rem',
    background: 'rgba(37, 99, 235, 0.12)',
    borderBottom: '1px solid #374151',
  },
  btn: {
    padding: '0.35rem 0.75rem',
    borderRadius: '0.375rem',
    border: '1px solid #475569',
    background: '#1F2937',
    color: '#E5E7EB',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
  danger: {
    background: '#7F1D1D',
    borderColor: '#B91C1C',
  },
  pagination: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    borderTop: '1px solid #374151',
    background: '#0f172a',
    fontSize: '0.8125rem',
    color: '#9CA3AF',
  },
};

const TransactionManager = ({
  transactions,
  categories,
  accounts,
  onUpdateTransaction,
  onDeleteTransaction,
  onToggleCleared,
  onBulkDelete,
  onBulkUpdate,
  showAccountColumn = true,
  hideAccountFilter = false,
  multiAccountFilter = false,
  onNavigateToAccount,
  enablePagination = false,
  defaultPageSize = 25,
  enableBulkSelection = false,
  enableVirtualScroll = false,
  enableInlineEdit = false,
}) => {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [sort, setSort] = useState(DEFAULT_TRANSACTION_SORT);
  const [filters, setFilters] = useState({ ...DEFAULT_TRANSACTION_FILTERS });
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const scrollRef = useRef(null);
  const [virtRange, setVirtRange] = useState({ start: 0, end: 60 });

  const filtersForQuery = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  const activeTransactions = useMemo(
    () => (transactions || []).filter((tx) => tx?.is_deleted !== 1 && tx?.is_deleted !== true),
    [transactions]
  );

  const filtered = useMemo(
    () => filterTransactions(activeTransactions, filtersForQuery, { categories, accounts }),
    [activeTransactions, filtersForQuery, categories, accounts]
  );

  const sortedTransactions = useMemo(
    () => sortTransactions(filtered, sort, { categories }),
    [filtered, sort, categories]
  );

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / pageSize) || 1);
  const safePage = Math.min(page, totalPages);

  const useVirtual =
    enableVirtualScroll && sortedTransactions.length >= VIRTUAL_THRESHOLD && !editingId;

  const paginatedTransactions = useMemo(() => {
    if (!enablePagination || useVirtual) return sortedTransactions;
    const start = (safePage - 1) * pageSize;
    return sortedTransactions.slice(start, start + pageSize);
  }, [sortedTransactions, enablePagination, useVirtual, safePage, pageSize]);

  const updateVirtRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    const viewH = el.clientHeight || 600;
    const start = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
    const end = Math.min(
      sortedTransactions.length,
      Math.ceil((scrollTop + viewH) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN
    );
    setVirtRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end }
    );
  }, [sortedTransactions.length]);

  useEffect(() => {
    if (!useVirtual) return undefined;
    updateVirtRange();
    const el = scrollRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', updateVirtRange, { passive: true });
    window.addEventListener('resize', updateVirtRange);
    return () => {
      el.removeEventListener('scroll', updateVirtRange);
      window.removeEventListener('resize', updateVirtRange);
    };
  }, [useVirtual, updateVirtRange, sortedTransactions.length]);

  useEffect(() => {
    if (useVirtual && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setVirtRange({ start: 0, end: 60 });
    }
  }, [useVirtual, filtersForQuery, sort]);

  const virtualSlice = useMemo(() => {
    if (!useVirtual) return sortedTransactions;
    return sortedTransactions.slice(virtRange.start, virtRange.end);
  }, [useVirtual, sortedTransactions, virtRange.start, virtRange.end]);

  const displayTransactions = useVirtual
    ? virtualSlice
    : enablePagination
      ? paginatedTransactions
      : sortedTransactions;

  const virtualPaddingTop = useVirtual ? virtRange.start * VIRTUAL_ROW_HEIGHT : 0;
  const virtualPaddingBottom = useVirtual
    ? Math.max(0, sortedTransactions.length - virtRange.end) * VIRTUAL_ROW_HEIGHT
    : 0;

  useEffect(() => {
    setPage(1);
  }, [filtersForQuery, sort, pageSize, transactions?.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleEdit = (transaction) => {
    setEditingId(transaction.id);
    setEditForm({
      date: transaction.date,
      payee: transaction.payee || transaction.description || '',
      categoryId: transaction.category_id || '',
      amount: Math.abs(transaction.amount),
      type: transaction.amount < 0 ? 'outflow' : 'inflow',
      memo: transaction.memo || '',
      cleared: transaction.is_cleared === 1 || transaction.cleared === 1,
      flagged: transaction.is_flagged === 1 || transaction.is_flagged === true,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const amountMag = parseFloat(editForm.amount);
    if (!Number.isFinite(amountMag) || amountMag === 0) {
      alert('Please enter a valid amount');
      return;
    }
    const signedAmount = editForm.type === 'outflow' ? -Math.abs(amountMag) : Math.abs(amountMag);
    const updateData = {
      date: editForm.date,
      payee: editForm.payee,
      description: editForm.payee,
      amount: signedAmount,
      category_id:
        editForm.categoryId === 'inflow_ready_to_assign' ? null : editForm.categoryId || null,
      memo: editForm.memo || null,
      cleared: editForm.cleared ? 1 : 0,
      is_cleared: editForm.cleared ? 1 : 0,
      is_flagged: editForm.flagged ? 1 : 0,
    };
    if (onUpdateTransaction) {
      const result = await onUpdateTransaction(editingId, updateData);
      if (result?.success) {
        setEditingId(null);
        setEditForm({});
      }
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      const result = await onDeleteTransaction(id);
      if (!result || !result.success) {
        alert('Error deleting transaction');
      }
    }
  };

  const handleToggleCleared = async (id, currentStatus) => {
    const result = await onToggleCleared(id, currentStatus ? 0 : 1);
    if (!result || !result.success) {
      alert('Error toggling cleared status');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllOnPage = () => {
    const ids = displayTransactions.map((t) => t.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const runBulk = async (action, payload = {}) => {
    const ids = [...selectedIds];
    if (!ids.length) {
      alert('Select one or more transactions first.');
      return;
    }
    if (!onBulkUpdate) return;
    setBulkBusy(true);
    try {
      const result = await onBulkUpdate(action, ids, payload);
      if (result?.success === false) {
        alert(result?.error || 'Bulk update failed');
        return;
      }
      if (result?.data?.skipped > 0) {
        alert(
          `Updated ${result.data.updated} transaction(s). ${result.data.skipped} could not be changed (system or bank rules).`
        );
      }
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(sortedTransactions.map((t) => t.id)));
  };

  const handleInlineUpdate = async (id, updates) => {
    if (!onUpdateTransaction) return;
    const result = await onUpdateTransaction(id, updates);
    if (result?.success === false) {
      alert(result?.error || 'Could not save changes');
    }
  };

  const isInlineEditDisabled = (tx) => tx?.is_system === 1;

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} selected transaction(s)?`)) return;
    if (onBulkDelete) {
      const result = await onBulkDelete([...selectedIds]);
      if (result?.success !== false) setSelectedIds(new Set());
      else alert(result?.error || 'Bulk delete failed');
    }
  };

  const renderEditRow = (tx) => (
    <tr key={`edit-${tx.id}`}>
      {enableBulkSelection && <td style={editStyles.td} />}
      <td style={editStyles.td}>
        <input
          type="date"
          value={editForm.date || ''}
          onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
          style={editStyles.input}
        />
      </td>
      {showAccountColumn && (
        <td style={editStyles.td}>{tx.account_name || '—'}</td>
      )}
      <td style={editStyles.td}>
        <input
          type="text"
          value={editForm.payee || ''}
          onChange={(e) => setEditForm({ ...editForm, payee: e.target.value })}
          style={editStyles.input}
          placeholder="Payee"
        />
        <input
          type="text"
          value={editForm.memo || ''}
          onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
          style={{ ...editStyles.input, marginTop: '0.35rem' }}
          placeholder="Memo"
        />
      </td>
      <td style={editStyles.td}>
        <select
          value={editForm.categoryId || ''}
          onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
          style={editStyles.select}
        >
          <option value="">Select category</option>
          {(categories || []).map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </td>
      <td style={editStyles.td}>
        {editForm.type === 'outflow' ? (
          <input
            type="number"
            value={editForm.amount || ''}
            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
            style={editStyles.input}
            step="0.01"
            min="0"
          />
        ) : null}
      </td>
      <td style={editStyles.td}>
        {editForm.type === 'inflow' ? (
          <input
            type="number"
            value={editForm.amount || ''}
            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
            style={editStyles.input}
            step="0.01"
            min="0"
          />
        ) : null}
        <select
          value={editForm.type || 'outflow'}
          onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
          style={{ ...editStyles.select, marginTop: editForm.type === 'inflow' ? 0 : '0.35rem' }}
        >
          <option value="outflow">Outflow</option>
          <option value="inflow">Inflow</option>
        </select>
      </td>
      <td style={editStyles.td}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
          <input
            type="checkbox"
            checked={editForm.cleared || false}
            onChange={(e) => setEditForm({ ...editForm, cleared: e.target.checked })}
          />
          Cleared
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', marginTop: '0.35rem' }}>
          <input
            type="checkbox"
            checked={editForm.flagged || false}
            onChange={(e) => setEditForm({ ...editForm, flagged: e.target.checked })}
          />
          Flagged
        </label>
        <button
          type="button"
          style={{ ...editStyles.actionBtn, background: '#10B981', color: 'white' }}
          onClick={handleSaveEdit}
        >
          Save
        </button>
        <button
          type="button"
          style={{ ...editStyles.actionBtn, background: '#6B7280', color: 'white' }}
          onClick={() => setEditingId(null)}
        >
          Cancel
        </button>
      </td>
    </tr>
  );

  const rangeStart =
    sortedTransactions.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, sortedTransactions.length);

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          background: '#1F2937',
          borderRadius: '0.75rem',
          overflow: 'hidden',
          border: '1px solid #374151',
        }}
      >
        <TransactionToolbar
          filters={filters}
          onFiltersChange={setFilters}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          categories={categories}
          accounts={accounts}
          hideAccountFilter={hideAccountFilter}
          multiAccountFilter={multiAccountFilter}
          resultCount={sortedTransactions.length}
          totalCount={activeTransactions.length}
          extraActions={
            enableBulkSelection && sortedTransactions.length > 0 ? (
              <button
                type="button"
                style={bulkBarStyles.btn}
                onClick={selectAllFiltered}
                title="Select all transactions matching current filters"
              >
                Select all ({sortedTransactions.length})
              </button>
            ) : null
          }
        />

        {enableBulkSelection && selectedIds.size > 0 && (
          <div style={bulkBarStyles.bar}>
            <span style={{ color: '#93C5FD', fontWeight: 600 }}>
              {selectedIds.size} selected{bulkBusy ? ' — saving…' : ''}
            </span>
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              style={{ ...editStyles.select, width: 'auto', minWidth: '160px' }}
            >
              <option value="">Bulk category…</option>
              {(categories || []).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              style={bulkBarStyles.btn}
              disabled={bulkBusy}
              onClick={() =>
                bulkCategoryId &&
                runBulk('categorize', { category_id: bulkCategoryId })
              }
            >
              Apply category
            </button>
            <button
              type="button"
              style={bulkBarStyles.btn}
              onClick={() => runBulk('clear', { is_cleared: 1, cleared: 1 })}
            >
              Mark cleared
            </button>
            <button
              type="button"
              style={bulkBarStyles.btn}
              onClick={() => runBulk('unclear', { is_cleared: 0, cleared: 0 })}
            >
              Mark uncleared
            </button>
            <button
              type="button"
              style={bulkBarStyles.btn}
              onClick={() => runBulk('reconcile', { is_cleared: 2, is_reconciled: 1 })}
            >
              Mark reconciled
            </button>
            <button
              type="button"
              style={bulkBarStyles.btn}
              onClick={() => runBulk('approve', { is_cleared: 1, cleared: 1 })}
            >
              Approve (clear)
            </button>
            <button
              type="button"
              style={bulkBarStyles.btn}
              onClick={() => runBulk('flag', { is_flagged: 1 })}
            >
              Flag
            </button>
            <button
              type="button"
              style={bulkBarStyles.btn}
              onClick={() => runBulk('unflag', { is_flagged: 0 })}
            >
              Unflag
            </button>
            <button
              type="button"
              style={{ ...bulkBarStyles.btn, ...bulkBarStyles.danger }}
              onClick={handleBulkDelete}
              disabled={bulkBusy}
            >
              Delete selected
            </button>
            <button
              type="button"
              style={bulkBarStyles.btn}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </button>
          </div>
        )}

        <div
          ref={scrollRef}
          style={{
            maxHeight: enablePagination || useVirtual ? 'min(70vh, 720px)' : undefined,
            overflowY: enablePagination || useVirtual ? 'auto' : undefined,
          }}
        >
          <TransactionTable
            transactions={displayTransactions}
            virtualPaddingTop={virtualPaddingTop}
            virtualPaddingBottom={virtualPaddingBottom}
            enableInlineEdit={enableInlineEdit}
            onInlineUpdate={enableInlineEdit ? handleInlineUpdate : undefined}
            isInlineEditDisabled={isInlineEditDisabled}
            emptyMessage={
              useVirtual && sortedTransactions.length > 0
                ? ''
                : 'No transactions match your filters'
            }
            categories={categories}
            sort={sort}
            onSortChange={setSort}
            showAccountColumn={showAccountColumn}
            onAccountClick={onNavigateToAccount}
            showCheckbox={enableBulkSelection}
            selectedIds={selectedIds}
            onToggleSelect={(txId) => toggleSelect(txId)}
            onSelectAll={selectAllOnPage}
            allSelected={
              displayTransactions.length > 0 &&
              displayTransactions.every((t) => selectedIds.has(t.id))
            }
            editingId={editingId}
            renderEditRow={renderEditRow}
            renderPayeeExtra={(tx) => (
              <>
                {(tx.is_flagged === 1 || tx.is_flagged === true) && (
                  <span style={{ marginLeft: '0.35rem' }} title="Flagged">
                    🚩
                  </span>
                )}
                <PlaidTxnBadge transaction={tx} />
                {tx.is_transfer === 1 && (
                  <span style={{ marginLeft: '0.35rem', fontSize: '0.7rem', color: '#93C5FD' }}>
                    Transfer
                  </span>
                )}
              </>
            )}
            renderActions={(tx) => (
              <>
                <button
                  type="button"
                  onClick={() => handleEdit(tx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(tx.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.5rem' }}
                  title="Delete"
                >
                  🗑️
                </button>
                <input
                  type="checkbox"
                  checked={tx.is_cleared === 1 || tx.cleared === 1}
                  onChange={() =>
                    handleToggleCleared(tx.id, tx.is_cleared === 1 || tx.cleared === 1)
                  }
                  title="Cleared"
                  style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }}
                />
              </>
            )}
          />
        </div>

        {enablePagination && sortedTransactions.length > 0 && !useVirtual && (
          <div style={bulkBarStyles.pagination}>
            <span>
              {rangeStart}–{rangeEnd} of {sortedTransactions.length} (filtered)
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                Per page
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  style={editStyles.select}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                style={bulkBarStyles.btn}
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                style={bulkBarStyles.btn}
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {useVirtual && sortedTransactions.length > 0 && (
          <div style={bulkBarStyles.pagination}>
            <span>
              Virtual scroll: {sortedTransactions.length.toLocaleString()} transaction(s) — scroll to
              load rows
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionManager;
