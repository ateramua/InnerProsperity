import React, { useState, useEffect, useCallback } from 'react';

const READY_TO_ASSIGN_VALUE = 'inflow_ready_to_assign';

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
    padding: '1rem',
  },
  modal: {
    background: '#0f172a',
    color: '#f8fafc',
    borderRadius: '12px',
    padding: '1.25rem',
    maxWidth: '720px',
    width: '100%',
    maxHeight: '85vh',
    overflow: 'auto',
    border: '1px solid rgba(255,255,255,0.15)',
  },
  title: { margin: '0 0 0.5rem', fontSize: '1.15rem' },
  hint: { margin: '0 0 1rem', fontSize: '0.85rem', color: '#94a3b8' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th: {
    textAlign: 'left',
    padding: '0.5rem',
    borderBottom: '1px solid #334155',
    color: '#9ca3af',
  },
  td: { padding: '0.5rem', borderBottom: '1px solid #1e293b', verticalAlign: 'middle' },
  select: {
    width: '100%',
    padding: '0.4rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f8fafc',
  },
  btn: {
    padding: '0.4rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #475569',
    background: 'transparent',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  danger: { color: '#f87171', borderColor: '#7f1d1d' },
  footer: { display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' },
  empty: { color: '#64748b', padding: '1.5rem', textAlign: 'center' },
};

function rowKey(row) {
  return `${row.institutionKey}::${row.bankCategory}`;
}

export default function ImportCategoryMappingsManager({
  isOpen,
  onClose,
  budgetCategories = [],
  onMappingsChanged,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  const loadRows = useCallback(async () => {
    if (!window.electronAPI?.listImportCategoryMappings) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await window.electronAPI.listImportCategoryMappings();
      if (res?.success) setRows(res.data || []);
      else setError(res?.error || 'Failed to load mappings');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadRows();
  }, [isOpen, loadRows]);

  const handleCategoryChange = async (row, categoryId) => {
    const key = rowKey(row);
    setBusyKey(key);
    try {
      if (!categoryId) {
        const res = await window.electronAPI.deleteImportCategoryMapping(
          row.institutionKey,
          row.bankCategory
        );
        if (res?.success === false) alert(res?.error || 'Could not remove mapping');
      } else {
        const mappings = { [row.bankCategory]: categoryId };
        const res = await window.electronAPI.saveImportCategoryMappings(
          mappings,
          row.institutionKey
        );
        if (res?.success === false) alert(res?.error || 'Could not save mapping');
      }
      await loadRows();
      onMappingsChanged?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyKey('');
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Remove mapping for "${row.bankCategory}"?`)) return;
    const key = rowKey(row);
    setBusyKey(key);
    try {
      const res = await window.electronAPI.deleteImportCategoryMapping(
        row.institutionKey,
        row.bankCategory
      );
      if (res?.success !== false) {
        await loadRows();
        onMappingsChanged?.();
      } else {
        alert(res?.error || 'Delete failed');
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyKey('');
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>Saved import category mappings</h3>
        <p style={styles.hint}>
          These mappings apply when you import CSV transactions. Institution-specific mappings
          override default mappings for the same bank category name.
        </p>

        {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}
        {loading ? (
          <p style={styles.empty}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={styles.empty}>No saved mappings yet. Map categories during import and check
            &quot;Save mappings for future imports.&quot;</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Institution</th>
                <th style={styles.th}>Bank category</th>
                <th style={styles.th}>IntentFlow category</th>
                <th style={styles.th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = rowKey(row);
                const selectValue =
                  row.categoryId == null || row.categoryId === ''
                    ? READY_TO_ASSIGN_VALUE
                    : row.categoryId;
                return (
                  <tr key={key}>
                    <td style={styles.td}>{row.institutionLabel}</td>
                    <td style={styles.td}>{row.bankCategory}</td>
                    <td style={styles.td}>
                      <select
                        style={styles.select}
                        value={selectValue}
                        disabled={busyKey === key}
                        onChange={(e) => handleCategoryChange(row, e.target.value)}
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
                    <td style={styles.td}>
                      <button
                        type="button"
                        style={{ ...styles.btn, ...styles.danger }}
                        disabled={busyKey === key}
                        onClick={() => handleDelete(row)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={styles.footer}>
          <button type="button" style={styles.btn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
