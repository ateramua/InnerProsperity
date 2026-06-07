import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
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
import TransactionSplitModal from './transactions/TransactionSplitModal.jsx';
import RegisterTransactionActions, {
  canSplitRegisterTransaction,
} from './transactions/RegisterTransactionActions.jsx';
import RegisterPayeeExtras from './transactions/RegisterPayeeExtras.jsx';
import ActivityDrilldownBanner from './transactions/ActivityDrilldownBanner.jsx';
import useScrollToTransactionFocus from '../hooks/useScrollToTransactionFocus.jsx';
import useTransactionPayees, { invalidateTransactionPayeesCache } from '../hooks/useTransactionPayees.jsx';
import { TransactionCategorySelectOptions } from './transactions/TransactionCategorySelectOptions.jsx';
import {
  categorySelectValueForTransaction,
  getTransactionEditAmountMagnitude,
  getTransactionEditType,
  isReadyToAssignSentinel,
  normalizeCategoryIdForStorage,
  READY_TO_ASSIGN_CATEGORY_ID,
  READY_TO_ASSIGN_VALIDATION_MSG,
  validateReadyToAssignSelection,
} from '../utils/readyToAssignCategory.jsx';
import {
  countSelectedInList,
  normalizeTransactionId,
  pruneTransactionSelection,
} from '../utils/transactionSelectionUtils.jsx';

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
  onReload,
  showAccountColumn = true,
  hideAccountFilter = false,
  multiAccountFilter = false,
  onNavigateToAccount,
  enablePagination = false,
  defaultPageSize = 25,
  enableBulkSelection = false,
  enableVirtualScroll = false,
  enableInlineEdit = false,
  activityDrilldown = null,
  activityDrilldownHighlightIds = null,
  activityDrilldownIdsLoading = false,
  activityDrilldownBannerLabel = '',
  activityDrilldownFocusId = null,
  activityDrilldownFocusLabel = '',
  activityDrilldownConfirmedIds = null,
  onActivityDrilldownBack,
  onClearActivityDrilldown,
  activityDrilldownEmptyMessage = null,
}) => {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [sort, setSort] = useState(DEFAULT_TRANSACTION_SORT);
  const [filters, setFilters] = useState(() =>
    activityDrilldown?.initialFilters
      ? { ...activityDrilldown.initialFilters }
      : { ...DEFAULT_TRANSACTION_FILTERS }
  );
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [categorizationSummary, setCategorizationSummary] = useState(null);
  const [splitTransaction, setSplitTransaction] = useState(null);
  const [pairingTransfers, setPairingTransfers] = useState(false);
  const [retrainingMl, setRetrainingMl] = useState(false);
  const scrollRef = useRef(null);
  const scrollRestoreRef = useRef(null);
  const tableScrollSnapshotRef = useRef(0);
  const [virtRange, setVirtRange] = useState({ start: 0, end: 60 });
  const { payees: registerPayees, loading: payeesLoading } = useTransactionPayees(null);

  useEffect(() => {
    invalidateTransactionPayeesCache();
  }, []);

  const highlightIdSet = useMemo(() => {
    if (!activityDrilldownHighlightIds) return null;
    if (activityDrilldownHighlightIds instanceof Set) return activityDrilldownHighlightIds;
    return new Set([...activityDrilldownHighlightIds].map(String));
  }, [activityDrilldownHighlightIds]);

  const drilldownFiltersKeyRef = useRef('');

  useEffect(() => {
    if (!activityDrilldown?.initialFilters) {
      drilldownFiltersKeyRef.current = '';
      return;
    }
    const key = JSON.stringify(activityDrilldown.initialFilters);
    if (drilldownFiltersKeyRef.current === key) return;
    drilldownFiltersKeyRef.current = key;
    setFilters({ ...activityDrilldown.initialFilters });
    setSearchInput('');
    setPage(1);
  }, [activityDrilldown?.initialFilters]);

  const filtersForQuery = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  const activeTransactions = useMemo(
    () => (transactions || []).filter((tx) => tx?.is_deleted !== 1 && tx?.is_deleted !== true),
    [transactions]
  );

  const confirmedActivityIdSet = useMemo(() => {
    if (!activityDrilldownConfirmedIds?.length) return null;
    return new Set(activityDrilldownConfirmedIds.map(String));
  }, [activityDrilldownConfirmedIds]);

  const useExactActivityFilter =
    Boolean(activityDrilldown) &&
    !activityDrilldownIdsLoading &&
    confirmedActivityIdSet &&
    confirmedActivityIdSet.size > 0;

  const filtered = useMemo(
    () =>
      filterTransactions(activeTransactions, filtersForQuery, {
        categories,
        accounts,
        includeTransactionIds: confirmedActivityIdSet
          ? [...confirmedActivityIdSet]
          : highlightIdSet?.size
            ? [...highlightIdSet]
            : undefined,
        activityDrilldownOnly: useExactActivityFilter,
      }),
    [
      activeTransactions,
      filtersForQuery,
      categories,
      accounts,
      highlightIdSet,
      confirmedActivityIdSet,
      useExactActivityFilter,
      activityDrilldown,
    ]
  );

  const sortedTransactions = useMemo(
    () => sortTransactions(filtered, sort, { categories }),
    [filtered, sort, categories]
  );

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / pageSize) || 1);
  const safePage = Math.min(page, totalPages);

  const useVirtual =
    enableVirtualScroll &&
    !activityDrilldown &&
    sortedTransactions.length >= VIRTUAL_THRESHOLD &&
    !editingId;

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
    let cancelled = false;
    (async () => {
      if (!window.electronAPI?.getUncategorizedSummary) return;
      try {
        const res = await window.electronAPI.getUncategorizedSummary();
        if (!cancelled && res?.success) setCategorizationSummary(res.data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transactions?.length]);

  useEffect(() => {
    if (!window.electronAPI?.retrainCategoryMl) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await window.electronAPI.getCategoryMlModelStatus?.();
        if (cancelled || !statusRes?.success) return;
        if (statusRes.data?.ready && !statusRes.data?.trained) {
          await window.electronAPI.retrainCategoryMl();
        }
      } catch {
        /* ignore background ML train */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filtersForQuery, sort, pageSize]);

  useEffect(() => {
    if (!activityDrilldown || !activityDrilldownFocusId) return;
    const idx = sortedTransactions.findIndex(
      (t) => String(t.id) === String(activityDrilldownFocusId)
    );
    if (idx < 0) return;
    if (enablePagination && pageSize > 0) {
      const targetPage = Math.floor(idx / pageSize) + 1;
      if (targetPage !== safePage) {
        setPage(targetPage);
      }
    }
  }, [
    activityDrilldown,
    activityDrilldownFocusId,
    sortedTransactions,
    enablePagination,
    pageSize,
    safePage,
  ]);

  const displayRowIds = useMemo(
    () => displayTransactions.map((tx) => String(tx.id)),
    [displayTransactions]
  );

  useScrollToTransactionFocus({
    containerRef: scrollRef,
    focusTransactionId: activityDrilldownFocusId,
    active: Boolean(activityDrilldown),
    ready: !activityDrilldownIdsLoading && Boolean(activityDrilldownFocusId),
    displayRowIds,
  });

  useEffect(() => {
    const el = scrollRef.current;
    return () => {
      if (el) tableScrollSnapshotRef.current = el.scrollTop;
    };
  });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const saved = scrollRestoreRef.current;
    if (saved) {
      scrollRestoreRef.current = null;
      const restore = () => {
        if (saved.containerTop != null) {
          el.scrollTop = saved.containerTop;
        }
        if (typeof window !== 'undefined' && saved.windowY != null) {
          window.scrollTo(0, saved.windowY);
        }
      };
      restore();
      requestAnimationFrame(restore);
      return;
    }

    if (activityDrilldown && activityDrilldownFocusId) {
      return;
    }

    if (tableScrollSnapshotRef.current > 0) {
      el.scrollTop = tableScrollSnapshotRef.current;
    }
  }, [transactions, activityDrilldown, activityDrilldownFocusId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleEdit = (transaction) => {
    setEditingId(transaction.id);
    setEditForm({
      date: transaction.date,
      payee: transaction.payee || transaction.description || '',
      categoryId: categorySelectValueForTransaction(transaction),
      amount: getTransactionEditAmountMagnitude(transaction),
      type: getTransactionEditType(transaction),
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
    const isIncome = editForm.type === 'inflow';
    const rtaCheck = validateReadyToAssignSelection(editForm.categoryId, {
      isIncome,
      isTransfer: false,
    });
    if (!rtaCheck.ok) {
      alert(rtaCheck.message || READY_TO_ASSIGN_VALIDATION_MSG);
      return;
    }
    const storedCategoryId = normalizeCategoryIdForStorage(editForm.categoryId, { isIncome });
    const apiCategoryId = isReadyToAssignSentinel(editForm.categoryId)
      ? READY_TO_ASSIGN_CATEGORY_ID
      : storedCategoryId;
    const amountFields = { amount: Math.abs(amountMag), direction: editForm.type };
    const updateData = {
      date: editForm.date,
      payee: editForm.payee,
      description: editForm.payee,
      ...amountFields,
      category_id: apiCategoryId,
      categoryId: apiCategoryId,
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
    const key = normalizeTransactionId(id);
    if (!key) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    setSelectedIds((prev) => {
      const pruned = pruneTransactionSelection(prev, activeTransactions);
      if (pruned.size === prev.size) {
        let unchanged = true;
        for (const entry of prev) {
          if (!pruned.has(entry)) {
            unchanged = false;
            break;
          }
        }
        if (unchanged) return prev;
      }
      return pruned;
    });
  }, [activeTransactions]);

  const filteredTransactionIds = useMemo(
    () =>
      sortedTransactions
        .map((t) => normalizeTransactionId(t.id))
        .filter(Boolean),
    [sortedTransactions],
  );

  const allFilteredSelected =
    filteredTransactionIds.length > 0 &&
    filteredTransactionIds.every((entry) => selectedIds.has(entry));

  const someFilteredSelected =
    filteredTransactionIds.some((entry) => selectedIds.has(entry)) && !allFilteredSelected;

  const effectiveSelectedCount = useMemo(
    () => countSelectedInList(selectedIds, activeTransactions),
    [selectedIds, activeTransactions],
  );

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const ids = sortedTransactions
        .map((t) => normalizeTransactionId(t.id))
        .filter(Boolean);
      const allOn = ids.length > 0 && ids.every((entry) => prev.has(entry));
      const next = new Set(prev);
      if (allOn) ids.forEach((entry) => next.delete(entry));
      else ids.forEach((entry) => next.add(entry));
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

  const captureScrollPosition = () => {
    scrollRestoreRef.current = {
      containerTop: scrollRef.current?.scrollTop ?? null,
      windowY: typeof window !== 'undefined' ? window.scrollY : 0,
    };
  };

  const handleInlineUpdate = async (id, updates) => {
    if (!onUpdateTransaction) return;
    captureScrollPosition();
    const result = await onUpdateTransaction(id, updates);
    if (result?.success === false) {
      scrollRestoreRef.current = null;
      alert(result?.error || 'Could not save changes');
    }
  };

  const isInlineEditDisabled = (tx) => tx?.is_system === 1;

  const isCategoryInlineDisabled = (tx) => tx?.is_system === 1;

  const isPayeeInlineDisabled = (tx) => tx?.is_system === 1;

  const canSplitTransaction = canSplitRegisterTransaction;

  const handleSplitSaved = async () => {
    setSplitTransaction(null);
    if (onReload) {
      await onReload({ quiet: true });
    }
  };

  const handleRetrainMl = async () => {
    if (!window.electronAPI?.retrainCategoryMl) return;
    setRetrainingMl(true);
    try {
      const res = await window.electronAPI.retrainCategoryMl();
      if (res?.success === false) {
        alert(res.error || 'ML retrain failed');
        return;
      }
      const data = res?.data;
      if (data?.trained) {
        alert(
          `ML model updated (${data.sampleCount} samples, ${data.categoryCount} categories).`
        );
        if (onReload) await onReload({ quiet: true });
      } else {
        alert(
          data?.reason === 'insufficient_samples'
            ? `Need at least 12 categorized transactions (found ${data.sampleCount || 0}).`
            : 'Could not train ML model yet.'
        );
      }
    } finally {
      setRetrainingMl(false);
    }
  };

  const handlePairTransfers = async () => {
    if (!window.electronAPI?.pairTransferTransactions) return;
    setPairingTransfers(true);
    try {
      const res = await window.electronAPI.pairTransferTransactions();
      if (res?.success === false) {
        alert(res.error || 'Transfer scan failed');
        return;
      }
      const n = res?.data?.pairsLinked ?? 0;
      if (n > 0) {
        alert(`Linked ${n} transfer pair(s) across accounts.`);
        if (onReload) await onReload({ quiet: true });
      } else {
        alert('No new transfer pairs found in the last 90 days.');
      }
    } finally {
      setPairingTransfers(false);
    }
  };

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
          onChange={(e) => {
            const next = e.target.value;
            const check = validateReadyToAssignSelection(next, {
              isIncome: editForm.type === 'inflow',
              isTransfer: false,
            });
            if (!check.ok) {
              alert(check.message || READY_TO_ASSIGN_VALIDATION_MSG);
              return;
            }
            setEditForm({ ...editForm, categoryId: next });
          }}
          style={editStyles.select}
        >
          <TransactionCategorySelectOptions
            categories={categories}
            isIncome={editForm.type === 'inflow'}
            emptyLabel="Select category"
          />
        </select>
      </td>
      <td style={editStyles.td}>
        <input
          type="number"
          value={editForm.type === 'outflow' ? editForm.amount || '' : ''}
          onChange={(e) =>
            setEditForm({ ...editForm, type: 'outflow', amount: e.target.value })
          }
          style={editStyles.input}
          step="0.01"
          min="0"
          placeholder="0.00"
        />
      </td>
      <td style={editStyles.td}>
        <input
          type="number"
          value={editForm.type === 'inflow' ? editForm.amount || '' : ''}
          onChange={(e) =>
            setEditForm({ ...editForm, type: 'inflow', amount: e.target.value })
          }
          style={editStyles.input}
          step="0.01"
          min="0"
          placeholder="0.00"
        />
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

  const tableScrollStyle =
    enablePagination || useVirtual
      ? {
          flex: '1 1 auto',
          minHeight: 0,
          maxHeight: 'min(70vh, calc(100dvh - 14rem))',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }
      : undefined;

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <TransactionSplitModal
        open={!!splitTransaction}
        transaction={splitTransaction}
        categories={categories}
        onClose={() => setSplitTransaction(null)}
        onSaved={handleSplitSaved}
      />
      <div
        style={{
          background: '#1F2937',
          borderRadius: '0.75rem',
          overflow: 'hidden',
          border: '1px solid #374151',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          flex: '1 1 auto',
        }}
      >
        {activityDrilldown && (
          <ActivityDrilldownBanner
            label={activityDrilldownBannerLabel}
            matchCount={confirmedActivityIdSet?.size ?? highlightIdSet?.size ?? sortedTransactions.length}
            focusLabel={activityDrilldownFocusLabel}
            loading={activityDrilldownIdsLoading}
            onBackToBudget={onActivityDrilldownBack}
            onClearFilters={onClearActivityDrilldown}
          />
        )}
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
          categorizationSummary={categorizationSummary}
          extraActions={
            <>
              {window.electronAPI?.retrainCategoryMl && (
                <button
                  type="button"
                  style={bulkBarStyles.btn}
                  disabled={retrainingMl}
                  onClick={handleRetrainMl}
                  title="Retrain on-device category ML from your categorized history"
                >
                  {retrainingMl ? 'Training ML…' : 'Retrain ML'}
                </button>
              )}
              {window.electronAPI?.pairTransferTransactions && (
                <button
                  type="button"
                  style={bulkBarStyles.btn}
                  disabled={pairingTransfers}
                  onClick={handlePairTransfers}
                  title="Find matching opposite transactions across accounts"
                >
                  {pairingTransfers ? 'Scanning…' : 'Link transfers'}
                </button>
              )}
              {enableBulkSelection && sortedTransactions.length > 0 ? (
                <button
                  type="button"
                  style={bulkBarStyles.btn}
                  onClick={selectAllFiltered}
                  title="Select all transactions matching current filters"
                >
                  Select all ({sortedTransactions.length})
                </button>
              ) : null}
            </>
          }
        />

        {enableBulkSelection && effectiveSelectedCount > 0 && (
          <div style={bulkBarStyles.bar}>
            <span style={{ color: '#93C5FD', fontWeight: 600 }}>
              {effectiveSelectedCount} selected{bulkBusy ? ' — saving…' : ''}
            </span>
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              style={{ ...editStyles.select, width: 'auto', minWidth: '160px' }}
            >
              <option value="">Bulk category…</option>
              <option value={READY_TO_ASSIGN_CATEGORY_ID}>Ready to Assign (income)</option>
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

        <div ref={scrollRef} style={tableScrollStyle}>
          <TransactionTable
            key="transactions-table"
            transactions={displayTransactions}
            virtualPaddingTop={virtualPaddingTop}
            virtualPaddingBottom={virtualPaddingBottom}
            enableInlineEdit={enableInlineEdit}
            onInlineUpdate={enableInlineEdit ? handleInlineUpdate : undefined}
            isInlineEditDisabled={isInlineEditDisabled}
            isCategoryInlineDisabled={isCategoryInlineDisabled}
            isPayeeInlineDisabled={isPayeeInlineDisabled}
            registerPayees={enableInlineEdit ? registerPayees : null}
            registerPayeesLoading={payeesLoading}
            emptyMessage={
              useVirtual && sortedTransactions.length > 0
                ? ''
                : activityDrilldownEmptyMessage ||
                  (activityDrilldown && !activityDrilldownIdsLoading
                    ? 'No transactions found for this category in the selected month.'
                    : 'No transactions match your filters')
            }
            isRowHighlighted={
              highlightIdSet?.size
                ? (tx) => highlightIdSet.has(String(tx.id))
                : undefined
            }
            focusedTransactionId={activityDrilldown ? activityDrilldownFocusId : null}
            categories={categories}
            sort={sort}
            onSortChange={setSort}
            showAccountColumn={showAccountColumn}
            onAccountClick={onNavigateToAccount}
            showCheckbox={enableBulkSelection}
            selectedIds={selectedIds}
            onToggleSelect={(txId) => toggleSelect(txId)}
            onSelectAll={toggleSelectAllFiltered}
            allSelected={allFilteredSelected}
            someSelected={someFilteredSelected}
            editingId={editingId}
            renderEditRow={renderEditRow}
            renderPayeeExtra={(tx) => <RegisterPayeeExtras transaction={tx} />}
            renderActions={(tx) => (
              <RegisterTransactionActions
                transaction={tx}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleCleared={handleToggleCleared}
                onSplit={setSplitTransaction}
              />
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
