import React from 'react';

const styles = {
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.65rem 1rem',
    background: 'rgba(37, 99, 235, 0.14)',
    borderBottom: '1px solid #374151',
    fontSize: '0.875rem',
    color: '#E5E7EB',
  },
  label: {
    flex: '1 1 200px',
    minWidth: 0,
  },
  meta: {
    color: '#9CA3AF',
    fontSize: '0.8125rem',
  },
  focusHint: {
    color: '#6EE7B7',
    fontSize: '0.8125rem',
    marginTop: '0.2rem',
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
  btnPrimary: {
    borderColor: '#2563EB',
    background: 'rgba(37, 99, 235, 0.25)',
  },
};

export default function ActivityDrilldownBanner({
  label,
  matchCount,
  focusLabel,
  loading,
  onBackToBudget,
  onClearFilters,
}) {
  return (
    <div style={styles.bar} role="status" aria-live="polite">
      <div style={styles.label}>
        <strong>Activity drill-down</strong>
        {label ? ` · ${label}` : null}
        <div style={styles.meta}>
          {loading
            ? 'Locating activity transactions…'
            : `${matchCount} transaction(s) make up this activity`}
        </div>
        {!loading && focusLabel ? (
          <div style={styles.focusHint}>
            Focused on: <strong>{focusLabel}</strong>
            {matchCount > 1 ? ' (most recent — others highlighted below)' : null}
          </div>
        ) : null}
      </div>
      {onBackToBudget && (
        <button type="button" style={{ ...styles.btn, ...styles.btnPrimary }} onClick={onBackToBudget}>
          ← Back to Budget
        </button>
      )}
      {onClearFilters && (
        <button type="button" style={styles.btn} onClick={onClearFilters}>
          Clear drill-down
        </button>
      )}
    </div>
  );
}
