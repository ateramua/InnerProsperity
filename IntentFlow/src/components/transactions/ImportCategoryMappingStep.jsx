import React from 'react';

const READY_TO_ASSIGN_VALUE = 'inflow_ready_to_assign';

const styles = {
  sectionTitle: {
    margin: '0 0 0.35rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  sectionHint: {
    margin: '0 0 0.75rem',
    fontSize: '0.8rem',
    color: '#94a3b8',
    lineHeight: 1.45,
  },
  institutionBadge: {
    display: 'inline-block',
    marginBottom: '0.65rem',
    padding: '0.25rem 0.65rem',
    borderRadius: '999px',
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.35)',
    color: '#6ee7b7',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  categoryMapTable: {
    width: '100%',
    fontSize: '0.8rem',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    borderBottom: '1px solid #334155',
    padding: '0.35rem',
    color: '#9ca3af',
    fontWeight: 600,
  },
  categoryMapRow: { borderBottom: '1px solid #1e293b' },
  categoryMapBank: {
    padding: '0.45rem 0.35rem 0.45rem 0',
    verticalAlign: 'middle',
    color: '#e2e8f0',
    maxWidth: '14rem',
    wordBreak: 'break-word',
  },
  categoryMapCount: {
    padding: '0.45rem 0.35rem',
    verticalAlign: 'middle',
    color: '#64748b',
    whiteSpace: 'nowrap',
    width: '3.5rem',
  },
  categoryMapSelect: {
    width: '100%',
    padding: '0.4rem 0.5rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f8fafc',
    fontSize: '0.8rem',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.75rem',
    fontSize: '0.8rem',
    color: '#cbd5e1',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#60a5fa',
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: 0,
    textDecoration: 'underline',
    marginTop: '0.5rem',
  },
  emptyHint: {
    padding: '0.75rem',
    borderRadius: '8px',
    background: 'rgba(30, 41, 59, 0.6)',
    border: '1px dashed #475569',
    color: '#94a3b8',
    fontSize: '0.85rem',
  },
};

/**
 * Optional bank category → IntentFlow category mapping UI for CSV import.
 */
export default function ImportCategoryMappingStep({
  institutionLabel,
  hasCategoryColumnMapped,
  categoryColumnName,
  bankCategories = [],
  categoryMappings = {},
  onCategoryMappingChange,
  budgetCategories = [],
  saveCategoryMappings = true,
  onSaveCategoryMappingsChange,
  mappedCount = 0,
  onManageSavedMappings,
}) {
  const showTable = hasCategoryColumnMapped && bankCategories.length > 0;

  return (
    <div>
      <h4 style={styles.sectionTitle}>Map bank categories (optional)</h4>
      {institutionLabel ? (
        <span style={styles.institutionBadge}>
          Saved mappings for: {institutionLabel}
        </span>
      ) : null}

      {!hasCategoryColumnMapped && (
        <p style={styles.sectionHint}>
          Map the <strong>Bank category column</strong> on the previous step to enable category
          mapping. You can skip this and import without budget categories, then categorize later in
          the register.
        </p>
      )}

      {hasCategoryColumnMapped && !showTable && (
        <p style={styles.emptyHint}>
          Column <strong>{categoryColumnName}</strong> is mapped, but no category values were found
          in this file. You can skip mapping and continue.
        </p>
      )}

      {showTable && (
        <>
          <p style={styles.sectionHint}>
            {mappedCount} of {bankCategories.length} bank categories mapped. Unmapped rows import
            without a budget category. Exact name matches and saved mappings for this institution
            are applied automatically.
          </p>
          <table style={styles.categoryMapTable}>
            <thead>
              <tr>
                <th style={styles.th}>Bank category</th>
                <th style={styles.th}>Rows</th>
                <th style={styles.th}>IntentFlow category</th>
              </tr>
            </thead>
            <tbody>
              {bankCategories.map((item) => (
                <tr key={item.key} style={styles.categoryMapRow}>
                  <td style={styles.categoryMapBank}>{item.name}</td>
                  <td style={styles.categoryMapCount}>{item.count}</td>
                  <td style={{ padding: '0.35rem 0' }}>
                    <select
                      style={styles.categoryMapSelect}
                      value={categoryMappings[item.key] ?? ''}
                      onChange={(e) => onCategoryMappingChange?.(item.key, e.target.value)}
                    >
                      <option value="">— Unmapped —</option>
                      <option value={READY_TO_ASSIGN_VALUE}>Ready to Assign (inflow)</option>
                      {(budgetCategories || []).map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={saveCategoryMappings}
              onChange={(e) => onSaveCategoryMappingsChange?.(e.target.checked)}
            />
            Save mappings for future imports from this institution
          </label>
        </>
      )}

      {onManageSavedMappings ? (
        <button type="button" style={styles.linkBtn} onClick={onManageSavedMappings}>
          Review or edit all saved import mappings…
        </button>
      ) : null}
    </div>
  );
}

export { READY_TO_ASSIGN_VALUE };
