import React, { useState } from 'react';
import {
  RECENT_RANGE_OPTIONS,
  DATE_PRESET_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
  TRANSACTION_STATUS_OPTIONS,
  DEFAULT_TRANSACTION_FILTERS,
  countActiveFilters,
} from '../../utils/transactionFilterUtils.jsx';

const styles = {
  toolbar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    background: '#111827',
    borderBottom: '1px solid #374151',
    width: '100%',
    boxSizing: 'border-box',
  },
  toolbarRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
  },
  searchWrap: {
    flex: '1 1 220px',
    minWidth: '180px',
  },
  searchInput: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.375rem',
    border: '1px solid #374151',
    background: '#1F2937',
    color: 'white',
    fontSize: '0.875rem',
  },
  groupLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginRight: '0.25rem',
  },
  select: {
    padding: '0.5rem 0.65rem',
    borderRadius: '0.375rem',
    border: '1px solid #374151',
    background: '#1F2937',
    color: 'white',
    fontSize: '0.875rem',
  },
  filterButton: {
    padding: '0.5rem 0.85rem',
    borderRadius: '0.375rem',
    border: '1px solid #374151',
    background: '#1F2937',
    color: 'white',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
  filterButtonActive: {
    borderColor: '#2563EB',
    background: 'rgba(37, 99, 235, 0.15)',
  },
  filterPanel: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '0.75rem',
    padding: '0.75rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #374151',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  fieldLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    fontWeight: 500,
  },
  fieldInput: {
    padding: '0.45rem 0.55rem',
    borderRadius: '0.375rem',
    border: '1px solid #374151',
    background: '#1F2937',
    color: 'white',
    fontSize: '0.8125rem',
  },
  clearFilters: {
    padding: '0.45rem 0.75rem',
    borderRadius: '0.375rem',
    border: '1px solid #475569',
    background: 'transparent',
    color: '#CBD5E1',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    alignSelf: 'end',
  },
  resultMeta: {
    fontSize: '0.8125rem',
    color: '#9CA3AF',
  },
};

/**
 * @param {object} filters
 * @param {(next: object) => void} onFiltersChange
 * @param {object[]} [categories]
 * @param {object[]} [accounts]
 * @param {boolean} [hideAccountFilter]
 * @param {number} [resultCount]
 * @param {number} [totalCount]
 * @param {boolean} [multiAccountFilter]
 * @param {string} [searchValue] — controlled search (debounced upstream)
 * @param {(value: string) => void} [onSearchChange]
 * @param {React.ReactNode} [extraActions]
 */
export default function TransactionToolbar({
  filters,
  onFiltersChange,
  categories = [],
  accounts = [],
  hideAccountFilter = false,
  multiAccountFilter = false,
  resultCount,
  totalCount,
  searchValue,
  onSearchChange,
  extraActions,
}) {
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = countActiveFilters(filters, { hideAccountFilter });

  const setField = (key, value) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAdvancedFilters = () => {
    onFiltersChange({
      ...filters,
      dateFrom: '',
      dateTo: '',
      datePreset: '',
      accountId: hideAccountFilter ? '' : '',
      accountIds: [],
      categoryId: '',
      categoryIds: [],
      payee: '',
      transactionType: '',
      status: '',
    });
  };

  const toggleAccountFilter = (accountId) => {
    const id = String(accountId);
    const current = Array.isArray(filters.accountIds) ? [...filters.accountIds] : [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onFiltersChange({ ...filters, accountIds: next, accountId: '' });
  };

  const toggleCategoryFilter = (categoryId) => {
    const id = String(categoryId);
    const current = Array.isArray(filters.categoryIds) ? [...filters.categoryIds] : [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onFiltersChange({ ...filters, categoryIds: next, categoryId: '' });
  };

  return (
    <div style={styles.toolbar}>
      <div style={styles.toolbarRow}>
        <div style={styles.searchWrap}>
          <input
            type="search"
            placeholder="Search payee, category, account, memo, or amount…"
            value={searchValue !== undefined ? searchValue : filters.search || ''}
            onChange={(e) => {
              const v = e.target.value;
              if (onSearchChange) onSearchChange(v);
              else setField('search', v);
            }}
            style={styles.searchInput}
            aria-label="Search transactions"
          />
        </div>

        <button
          type="button"
          style={{
            ...styles.filterButton,
            ...(showFilters || activeFilterCount > 0 ? styles.filterButtonActive : null),
          }}
          onClick={() => setShowFilters((v) => !v)}
        >
          Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={styles.groupLabel}>Recent</span>
          <select
            value={filters.recentRange || 'all'}
            onChange={(e) => setField('recentRange', e.target.value)}
            style={styles.select}
            aria-label="Recent transactions range"
          >
            {RECENT_RANGE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {extraActions}
      </div>

      {showFilters && (
        <div style={styles.filterPanel}>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Date range preset</span>
            <select
              value={filters.datePreset || ''}
              onChange={(e) => setField('datePreset', e.target.value)}
              style={styles.fieldInput}
            >
              {DATE_PRESET_OPTIONS.map((opt) => (
                <option key={opt.id || 'custom'} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Date from</span>
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => setField('dateFrom', e.target.value)}
              style={styles.fieldInput}
            />
          </div>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Date to</span>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => setField('dateTo', e.target.value)}
              style={styles.fieldInput}
            />
          </div>
          {!hideAccountFilter && accounts.length > 0 && (
            <div style={{ ...styles.field, gridColumn: multiAccountFilter ? '1 / -1' : undefined }}>
              <span style={styles.fieldLabel}>
                {multiAccountFilter ? 'Accounts (select one or more)' : 'Account'}
              </span>
              {multiAccountFilter ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.35rem',
                    maxHeight: '120px',
                    overflowY: 'auto',
                  }}
                >
                  {accounts.map((acct) => {
                    const id = String(acct.id);
                    const selected = (filters.accountIds || []).includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleAccountFilter(id)}
                        style={{
                          padding: '0.3rem 0.55rem',
                          borderRadius: '0.375rem',
                          border: `1px solid ${selected ? '#2563EB' : '#374151'}`,
                          background: selected ? 'rgba(37, 99, 235, 0.2)' : '#1F2937',
                          color: '#E5E7EB',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        {acct.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <select
                  value={filters.accountId || ''}
                  onChange={(e) => setField('accountId', e.target.value)}
                  style={styles.fieldInput}
                >
                  <option value="">All accounts</option>
                  {accounts.map((acct) => (
                    <option key={acct.id} value={acct.id}>
                      {acct.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div style={{ ...styles.field, gridColumn: multiAccountFilter ? '1 / -1' : undefined }}>
            <span style={styles.fieldLabel}>
              {multiAccountFilter ? 'Categories (select one or more)' : 'Category'}
            </span>
            {multiAccountFilter ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.35rem',
                  maxHeight: '100px',
                  overflowY: 'auto',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleCategoryFilter('ready_to_assign')}
                  style={{
                    padding: '0.3rem 0.55rem',
                    borderRadius: '0.375rem',
                    border: `1px solid ${(filters.categoryIds || []).includes('ready_to_assign') ? '#2563EB' : '#374151'}`,
                    background: (filters.categoryIds || []).includes('ready_to_assign')
                      ? 'rgba(37, 99, 235, 0.2)'
                      : '#1F2937',
                    color: '#E5E7EB',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  Ready to Assign
                </button>
                {(categories || []).map((cat) => {
                  const id = String(cat.id);
                  const selected = (filters.categoryIds || []).includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleCategoryFilter(id)}
                      style={{
                        padding: '0.3rem 0.55rem',
                        borderRadius: '0.375rem',
                        border: `1px solid ${selected ? '#2563EB' : '#374151'}`,
                        background: selected ? 'rgba(37, 99, 235, 0.2)' : '#1F2937',
                        color: '#E5E7EB',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <select
                value={filters.categoryId || ''}
                onChange={(e) => setField('categoryId', e.target.value)}
                style={styles.fieldInput}
              >
                <option value="">All categories</option>
                <option value="ready_to_assign">Ready to Assign</option>
                {(categories || []).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Payee</span>
            <input
              type="text"
              value={filters.payee || ''}
              onChange={(e) => setField('payee', e.target.value)}
              placeholder="Contains…"
              style={styles.fieldInput}
            />
          </div>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Transaction type</span>
            <select
              value={filters.transactionType || ''}
              onChange={(e) => setField('transactionType', e.target.value)}
              style={styles.fieldInput}
            >
              {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                <option key={opt.id || 'all'} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>Status</span>
            <select
              value={filters.status || ''}
              onChange={(e) => setField('status', e.target.value)}
              style={styles.fieldInput}
            >
              {TRANSACTION_STATUS_OPTIONS.map((opt) => (
                <option key={opt.id || 'all'} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" style={styles.clearFilters} onClick={clearAdvancedFilters}>
            Clear filters
          </button>
        </div>
      )}

      {resultCount != null && totalCount != null ? (
        <div style={styles.resultMeta}>
          Showing {resultCount} of {totalCount} transaction{totalCount === 1 ? '' : 's'}
        </div>
      ) : null}
    </div>
  );
}

export { DEFAULT_TRANSACTION_FILTERS };
