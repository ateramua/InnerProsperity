import React, { useState, useEffect, useCallback, useRef } from 'react';
import ImportTransactionPreview from './transactions/ImportTransactionPreview.jsx';

const FIELD_KEYS = ['date', 'payee', 'amount', 'direction', 'outflow', 'inflow', 'category', 'memo'];

const FIELD_LABELS = {
  date: 'Date',
  payee: 'Payee / Description',
  amount: 'Amount',
  direction: 'Debit/Credit column (e.g. Credit Debit Indicator)',
  outflow: 'Outflow / Debit amount',
  inflow: 'Inflow / Credit amount',
  category: 'Bank category column',
  memo: 'Memo / Notes',
};

const READY_TO_ASSIGN_VALUE = 'inflow_ready_to_assign';

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '1rem',
  },
  modal: {
    background: '#0f172a',
    color: '#f8fafc',
    borderRadius: '12px',
    padding: '1.5rem',
    maxWidth: '720px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    border: '1px solid rgba(255,255,255,0.15)',
  },
  modalWide: {
    maxWidth: '960px',
  },
  title: { margin: '0 0 0.5rem', fontSize: '1.25rem' },
  hint: { margin: '0 0 1rem', fontSize: '0.85rem', color: '#94a3b8' },
  row: { marginBottom: '0.75rem' },
  label: { display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#cbd5e1' },
  select: {
    width: '100%',
    padding: '0.5rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f8fafc',
  },
  buttonRow: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' },
  primary: {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  secondary: {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: '1px solid #475569',
    background: 'transparent',
    color: '#e2e8f0',
    cursor: 'pointer',
  },
  error: { color: '#f87171', fontSize: '0.85rem', marginTop: '0.5rem' },
  previewTable: {
    width: '100%',
    fontSize: '0.75rem',
    borderCollapse: 'collapse',
    marginTop: '0.5rem',
  },
  th: { textAlign: 'left', borderBottom: '1px solid #334155', padding: '0.35rem' },
  td: { padding: '0.35rem', borderBottom: '1px solid #1e293b' },
  stat: { fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem' },
  sectionTitle: {
    margin: '1.25rem 0 0.5rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  sectionHint: {
    margin: '0 0 0.75rem',
    fontSize: '0.8rem',
    color: '#94a3b8',
  },
  categoryMapTable: {
    width: '100%',
    fontSize: '0.8rem',
    borderCollapse: 'collapse',
  },
  categoryMapRow: {
    borderBottom: '1px solid #1e293b',
  },
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
  profileBadge: {
    display: 'inline-block',
    marginTop: '0.35rem',
    padding: '0.25rem 0.6rem',
    borderRadius: '999px',
    background: 'rgba(37, 99, 235, 0.2)',
    border: '1px solid rgba(37, 99, 235, 0.45)',
    color: '#93c5fd',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  supportedBanks: {
    margin: '0 0 1rem',
    fontSize: '0.75rem',
    color: '#64748b',
  },
};

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

function mergeSuggestedMappings(prev, suggested) {
  const next = { ...prev };
  for (const [key, id] of Object.entries(suggested || {})) {
    if (next[key] === undefined) next[key] = id;
  }
  return next;
}

/**
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @param {(result: object) => void} onComplete
 * @param {string} [fixedAccountId] - lock import target account
 * @param {object[]} [accounts] - for account picker
 * @param {string} [title]
 */
export default function TransactionImportModal({
  isOpen,
  onClose,
  onComplete,
  fixedAccountId = null,
  accounts = [],
  title = 'Import transactions',
}) {
  const [accountId, setAccountId] = useState(fixedAccountId || '');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [previewRows, setPreviewRows] = useState([]);
  const [previewTransactions, setPreviewTransactions] = useState([]);
  const [detectedProfile, setDetectedProfile] = useState(null);
  const [totalRows, setTotalRows] = useState(0);
  const [validCount, setValidCount] = useState(0);
  const [parseErrors, setParseErrors] = useState([]);
  const [importBalancePreview, setImportBalancePreview] = useState(null);
  const [budgetCategories, setBudgetCategories] = useState([]);
  const [bankCategories, setBankCategories] = useState([]);
  const [categoryMappings, setCategoryMappings] = useState({});
  const [saveCategoryMappings, setSaveCategoryMappings] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('pick');
  const categoryRefreshTimer = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setAccountId(fixedAccountId || '');
      setFileContent('');
      setFileName('');
      setHeaders([]);
      setColumnMap({});
      setPreviewRows([]);
      setPreviewTransactions([]);
      setDetectedProfile(null);
      setImportBalancePreview(null);
      setBudgetCategories([]);
      setBankCategories([]);
      setCategoryMappings({});
      setSaveCategoryMappings(true);
      setError('');
      setStep('pick');
    }
  }, [isOpen, fixedAccountId]);

  const applyPreviewData = useCallback((d, mergeMappings = true) => {
    setHeaders(d.headers || []);
    setColumnMap((prev) => {
      const next = { ...prev };
      for (const key of FIELD_KEYS) {
        if (!next[key] && d.suggestedMapping?.[key]) {
          next[key] = d.suggestedMapping[key];
        }
      }
      return next;
    });
    setPreviewRows(d.preview || []);
    setPreviewTransactions(d.previewTransactions || d.preview || []);
    setDetectedProfile(d.detectedProfile || null);
    setTotalRows(d.totalRows || 0);
    setValidCount(d.validCount || 0);
    setParseErrors(d.parseErrors || []);
    setImportBalancePreview(d.balancePreview ?? null);
    setBudgetCategories(d.categories || []);
    setBankCategories(d.bankCategories || []);
    if (mergeMappings) {
      setCategoryMappings((prev) => mergeSuggestedMappings(prev, d.suggestedCategoryMappings));
    }
    setStep('map');
    setError('');
  }, []);

  const runPreview = useCallback(
    async (content, acctId, map, mappings, mergeMappings = true) => {
      if (!window.electronAPI?.previewTransactionImport) {
        setError('Import API not available');
        return;
      }
      const res = await window.electronAPI.previewTransactionImport({
        accountId: acctId,
        content,
        columnMap: map,
        categoryMappings: mappings,
        fileName,
      });
      if (!res?.success) {
        setError(res?.error || 'Preview failed');
        return;
      }
      applyPreviewData(res.data, mergeMappings);
    },
    [applyPreviewData, fileName]
  );

  const scheduleCategoryPreviewRefresh = useCallback(
    (nextMappings) => {
      if (categoryRefreshTimer.current) clearTimeout(categoryRefreshTimer.current);
      categoryRefreshTimer.current = setTimeout(async () => {
        if (!accountId || !fileContent || !columnMap.category) return;
        setBusy(true);
        try {
          await runPreview(fileContent, accountId, columnMap, nextMappings, false);
        } finally {
          setBusy(false);
        }
      }, 350);
    },
    [accountId, fileContent, columnMap, runPreview]
  );

  useEffect(() => {
    return () => {
      if (categoryRefreshTimer.current) clearTimeout(categoryRefreshTimer.current);
    };
  }, []);

  const handlePickFile = async () => {
    setError('');
    setBusy(true);
    try {
      const pick = await window.electronAPI.pickTransactionImportFile();
      if (pick?.canceled) return;
      if (!pick?.success) {
        setError(pick?.error || 'Could not open file');
        return;
      }
      setFileContent(pick.content || '');
      setFileName(pick.fileName || 'file.csv');
      setColumnMap({});
      const acct = fixedAccountId || accountId;
      if (acct) {
        await runPreview(pick.content, acct, columnMap, categoryMappings);
      } else {
        setStep('account');
      }
    } catch (e) {
      setError(e.message || 'File pick failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAccountContinue = async () => {
    if (!accountId) {
      setError('Select an account');
      return;
    }
    if (!fileContent) {
      setError('Choose a file first');
      return;
    }
    setBusy(true);
    try {
      await runPreview(fileContent, accountId, columnMap, categoryMappings);
    } finally {
      setBusy(false);
    }
  };

  const handleMappingRefresh = async () => {
    if (!accountId || !fileContent) return;
    setBusy(true);
    try {
      await runPreview(fileContent, accountId, columnMap, categoryMappings);
    } finally {
      setBusy(false);
    }
  };

  const handleColumnMapChange = async (field, headerName) => {
    const nextMap = { ...columnMap, [field]: headerName };
    setColumnMap(nextMap);
    if (field === 'category' && accountId && fileContent) {
      setBusy(true);
      try {
        await runPreview(fileContent, accountId, nextMap, categoryMappings);
      } finally {
        setBusy(false);
      }
    }
  };

  const handleCategoryMappingChange = (bankKey, categoryId) => {
    setCategoryMappings((prev) => {
      const next = { ...prev, [bankKey]: categoryId };
      scheduleCategoryPreviewRefresh(next);
      return next;
    });
  };

  const handleImport = async () => {
    if (!accountId || !fileContent) {
      setError('Account and file are required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await window.electronAPI.executeTransactionImport({
        accountId,
        content: fileContent,
        columnMap,
        categoryMappings,
        saveCategoryMappings,
        fileName,
      });
      if (!res?.success) {
        setError(res?.error || 'Import failed');
        return;
      }
      const d = res.data || {};
      onComplete?.(d);
      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
      onClose();
      alert(
        `Import complete\n\nImported: ${d.imported ?? 0}\nSkipped (duplicates): ${d.skipped ?? 0}\nFailed: ${d.failed ?? 0}`
      );
    } catch (e) {
      setError(e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const showAccountPicker = !fixedAccountId && (step === 'account' || (step === 'pick' && !accountId));
  const showCategoryMappingSection = step === 'map';
  const hasCategoryColumnMapped = Boolean(columnMap.category);
  const showCategoryMappingTable =
    hasCategoryColumnMapped && bankCategories.length > 0;
  const showImportPreview = step === 'map' && previewTransactions.length > 0;
  const mappedCount = bankCategories.filter((item) => {
    const mapped = categoryMappings[item.key];
    return mapped != null && mapped !== '';
  }).length;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={{ ...styles.modal, ...(showImportPreview || showCategoryMappingTable ? styles.modalWide : null) }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.hint}>
          CSV export from your bank. Supported institutions: Wells Fargo, PNC Bank, Capital One,
          Navy Federal Credit Union, American Express, and Bank of America. Map a{' '}
          <strong>Debit/Credit</strong> column when Amount is always positive (Navy Federal). Optionally
          map bank categories to IntentFlow budget categories. Duplicates are skipped.
        </p>
        <p style={styles.supportedBanks}>
          After import, transactions appear in the standard table with search, filters, and recent ranges.
        </p>
        {fileName ? (
          <p style={styles.stat}>
            File: <strong>{fileName}</strong>
            {detectedProfile?.name ? (
              <>
                <br />
                <span style={styles.profileBadge}>Detected: {detectedProfile.name}</span>
              </>
            ) : null}
          </p>
        ) : null}

        {detectedProfile?.notes ? (
          <p style={styles.sectionHint}>{detectedProfile.notes}</p>
        ) : null}

        {showAccountPicker && (
          <div style={styles.row}>
            <label style={styles.label}>Import into account</label>
            <select
              style={styles.select}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">— Select account —</option>
              {(accounts || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>
        )}

        {fixedAccountId && accounts?.length > 0 && (
          <p style={styles.stat}>
            Account:{' '}
            <strong>{accounts.find((a) => String(a.id) === String(fixedAccountId))?.name || fixedAccountId}</strong>
          </p>
        )}

        {step === 'map' && headers.length > 0 && (
          <>
            <p style={styles.stat}>
              {validCount} of {totalRows} rows ready to import
              {importBalancePreview != null && Number.isFinite(importBalancePreview) ? (
                <>
                  {' '}
                  · Net from file:{' '}
                  <strong style={{ color: importBalancePreview >= 0 ? '#4ade80' : '#f87171' }}>
                    {formatCurrency(importBalancePreview)}
                  </strong>
                </>
              ) : null}
            </p>
            {FIELD_KEYS.map((field) => (
              <div key={field} style={styles.row}>
                <label style={styles.label}>{FIELD_LABELS[field] || field}</label>
                <select
                  style={styles.select}
                  value={columnMap[field] || ''}
                  onChange={(e) => handleColumnMapChange(field, e.target.value)}
                >
                  <option value="">—</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button
              type="button"
              style={styles.secondary}
              onClick={handleMappingRefresh}
              disabled={busy}
            >
              Refresh preview
            </button>

            {showCategoryMappingSection && (
              <>
                <h4 style={styles.sectionTitle}>Map bank categories (optional)</h4>
                {!hasCategoryColumnMapped && (
                  <p style={styles.sectionHint}>
                    Choose your CSV&apos;s category column in <strong>Bank category column</strong> above
                    (e.g. Category, Spending Category). The mapping table appears after the file is
                    refreshed. If your bank export has no category column, you can skip this step.
                  </p>
                )}
                {hasCategoryColumnMapped && !showCategoryMappingTable && (
                  <p style={styles.sectionHint}>
                    Column <strong>{columnMap.category}</strong> is selected, but no category values were
                    found in the file. Try a different column, or click <strong>Refresh preview</strong>.
                  </p>
                )}
                {showCategoryMappingTable && (
                  <>
                    <p style={styles.sectionHint}>
                      {mappedCount} of {bankCategories.length} bank categories mapped. Unmapped rows import
                      without a budget category. Names that exactly match an IntentFlow category are filled in
                      automatically; saved mappings from past imports are reused when available.
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
                                onChange={(e) => handleCategoryMappingChange(item.key, e.target.value)}
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
                        onChange={(e) => setSaveCategoryMappings(e.target.checked)}
                      />
                      Remember these mappings for future CSV imports
                    </label>
                  </>
                )}
              </>
            )}

            {showImportPreview && (
              <ImportTransactionPreview
                transactions={previewTransactions}
                categories={budgetCategories}
                title="Preview (same layout as imported transactions)"
              />
            )}

            {parseErrors.length > 0 && (
              <p style={styles.error}>
                {parseErrors.length} row(s) could not be parsed (see line numbers in file).
              </p>
            )}
          </>
        )}

        {error ? <p style={styles.error}>{error}</p> : null}

        <div style={styles.buttonRow}>
          {step === 'pick' && (
            <button type="button" style={styles.primary} onClick={handlePickFile} disabled={busy}>
              {busy ? 'Loading…' : 'Choose CSV file…'}
            </button>
          )}
          {showAccountPicker && fileContent && (
            <button
              type="button"
              style={styles.primary}
              onClick={handleAccountContinue}
              disabled={busy || !accountId}
            >
              Continue
            </button>
          )}
          {step === 'map' && validCount > 0 && (
            <button type="button" style={styles.primary} onClick={handleImport} disabled={busy}>
              {busy ? 'Importing…' : `Import ${validCount} transaction(s)`}
            </button>
          )}
          <button type="button" style={styles.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
