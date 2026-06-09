import React, { useState, useEffect, useCallback, useRef } from 'react';
import ImportTransactionPreview from './transactions/ImportTransactionPreview.jsx';
import ImportCategoryMappingStep from './transactions/ImportCategoryMappingStep.jsx';
import ImportCategoryMappingsManager from './transactions/ImportCategoryMappingsManager.jsx';
import { notifyAccountsChanged } from '../utils/accountRefreshEvents.jsx';
import { showIntentFlowDialog } from '../utils/showIntentFlowDialog.jsx';

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

const MODAL_MAX_HEIGHT = 'min(90vh, calc(100dvh - 2rem))';

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '1rem',
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  modal: {
    background: '#0f172a',
    color: '#f8fafc',
    borderRadius: '12px',
    maxWidth: '720px',
    width: '100%',
    maxHeight: MODAL_MAX_HEIGHT,
    minHeight: 0,
    margin: 'auto',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.15)',
    boxSizing: 'border-box',
  },
  modalWide: {
    maxWidth: '960px',
  },
  modalHeader: {
    flexShrink: 0,
    padding: '1.25rem 1.5rem 0.75rem',
    borderBottom: '1px solid rgba(51, 65, 85, 0.6)',
  },
  modalBody: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '1rem 1.5rem',
    WebkitOverflowScrolling: 'touch',
  },
  modalFooter: {
    flexShrink: 0,
    padding: '0.75rem 1.5rem 1.25rem',
    borderTop: '1px solid rgba(51, 65, 85, 0.8)',
    background: '#0f172a',
  },
  title: { margin: '0 0 0.5rem', fontSize: '1.25rem' },
  hint: { margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.45 },
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
  buttonRow: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
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
  const [importFilePath, setImportFilePath] = useState('');
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
  const [institutionKey, setInstitutionKey] = useState('');
  const [institutionLabel, setInstitutionLabel] = useState('');
  const [showMappingsManager, setShowMappingsManager] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** pick | account | map-columns | map-categories | review */
  const [step, setStep] = useState('pick');
  const categoryRefreshTimer = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setAccountId(fixedAccountId || '');
      setImportFilePath('');
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
      setInstitutionKey('');
      setInstitutionLabel('');
      setShowMappingsManager(false);
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
    setInstitutionKey(d.institutionKey || d.detectedProfile?.id || '');
    setInstitutionLabel(d.institutionLabel || d.detectedProfile?.name || '');
    setStep((current) =>
      current === 'pick' || current === 'account' ? 'map-columns' : current
    );
    setError('');
  }, []);

  const runPreview = useCallback(
    async (filePath, acctId, map, mappings, mergeMappings = true) => {
      if (!window.electronAPI?.previewTransactionImport) {
        setError('Import API not available');
        return;
      }
      const res = await window.electronAPI.previewTransactionImport({
        accountId: acctId,
        filePath,
        columnMap: map,
        categoryMappings: mappings,
        fileName,
        institutionKey,
      });
      if (!res?.success) {
        setError(res?.error || 'Preview failed');
        return;
      }
      applyPreviewData(res.data, mergeMappings);
    },
    [applyPreviewData, fileName, institutionKey]
  );

  const scheduleCategoryPreviewRefresh = useCallback(
    (nextMappings) => {
      if (categoryRefreshTimer.current) clearTimeout(categoryRefreshTimer.current);
      categoryRefreshTimer.current = setTimeout(async () => {
        if (!accountId || !importFilePath || !columnMap.category) return;
        setBusy(true);
        try {
          await runPreview(importFilePath, accountId, columnMap, nextMappings, false);
        } finally {
          setBusy(false);
        }
      }, 350);
    },
    [accountId, importFilePath, columnMap, runPreview]
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
      setImportFilePath(pick.filePath || '');
      setFileName(pick.fileName || 'file.csv');
      setColumnMap({});
      const acct = fixedAccountId || accountId;
      if (acct) {
        await runPreview(pick.filePath, acct, columnMap, categoryMappings);
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
    if (!importFilePath) {
      setError('Choose a file first');
      return;
    }
    setBusy(true);
    try {
      await runPreview(importFilePath, accountId, columnMap, categoryMappings);
    } finally {
      setBusy(false);
    }
  };

  const handleMappingRefresh = async () => {
    if (!accountId || !importFilePath) return;
    setBusy(true);
    try {
      await runPreview(importFilePath, accountId, columnMap, categoryMappings);
    } finally {
      setBusy(false);
    }
  };

  const handleColumnMapChange = async (field, headerName) => {
    const nextMap = { ...columnMap, [field]: headerName };
    setColumnMap(nextMap);
    if (field === 'category' && accountId && importFilePath) {
      setBusy(true);
      try {
        await runPreview(importFilePath, accountId, nextMap, categoryMappings);
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

  const hasCategoryColumnMapped = Boolean(columnMap.category);
  const showCategoryMappingTable = hasCategoryColumnMapped && bankCategories.length > 0;
  const canOfferCategoryStep = showCategoryMappingTable;

  const goToReview = async () => {
    if (!accountId || !importFilePath) return;
    setBusy(true);
    try {
      await runPreview(importFilePath, accountId, columnMap, categoryMappings, false);
      setStep('review');
    } finally {
      setBusy(false);
    }
  };

  const skipCategoryMapping = () => {
    goToReview();
  };

  const continueToCategoryMapping = () => {
    if (canOfferCategoryStep) {
      setStep('map-categories');
    } else {
      goToReview();
    }
  };

  const handleImport = async () => {
    if (!accountId || !importFilePath) {
      setError('Account and file are required');
      return;
    }
    if (window.intentflow?.isHygieneRunning) {
      const hygieneActive = await window.intentflow.isHygieneRunning().catch(() => false);
      if (hygieneActive) {
        setError('Budget maintenance is in progress. Please wait and try again.');
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      if (window.electronAPI?.waitForDbIdle) {
        const idle = await window.electronAPI.waitForDbIdle({
          timeoutMs: 15000,
          stableWindowMs: 800,
        });
        if (!idle?.success) {
          setError(idle?.error || 'Database is busy. Please wait and try again.');
          return;
        }
      }
      const res = await window.electronAPI.executeTransactionImport({
        accountId,
        filePath: importFilePath,
        columnMap,
        categoryMappings,
        saveCategoryMappings,
        institutionKey,
        fileName,
      });
      if (!res?.success) {
        const d = res.data || {};
        const failureLines = (d.failures || [])
          .map((f) => `Line ${f.lineNumber}: ${f.message}`)
          .join('\n');
        const detail = failureLines || res.error || 'Import failed';
        setError(detail);
        const dialogType = 'error';
        const dialogTitle = 'Import failed';
        const baseMessage = `Imported: ${d.imported ?? 0}\nSkipped (duplicates): ${d.skipped ?? 0}\nFailed: ${d.failed ?? 0}`;
        await showIntentFlowDialog({
          id: 'import-complete',
          type: dialogType,
          title: dialogTitle,
          message: failureLines ? `${baseMessage}\n\n${failureLines}` : baseMessage,
        });
        return;
      }
      const d = res.data || {};
      const hardFailure =
        (d.failed ?? 0) > 0 && (d.imported ?? 0) === 0 && (d.matched ?? 0) === 0;
      if (hardFailure) {
        const failureLines = (d.failures || [])
          .map((f) => `Line ${f.lineNumber}: ${f.message}`)
          .join('\n');
        setError(failureLines || d.error || 'Import failed');
        const baseMessage = `Imported: ${d.imported ?? 0}\nSkipped (duplicates): ${d.skipped ?? 0}\nFailed: ${d.failed ?? 0}`;
        await showIntentFlowDialog({
          id: 'import-complete',
          type: 'error',
          title: 'Import failed',
          message: failureLines ? `${baseMessage}\n\n${failureLines}` : baseMessage,
        });
        return;
      }
      if (window.electronAPI?.waitForDbIdle) {
        await window.electronAPI.waitForDbIdle({ timeoutMs: 10000, stableWindowMs: 400 }).catch(() => {});
      }
      onComplete?.(d);
      notifyAccountsChanged({ reason: 'transaction-import' });
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
      onClose();
      const failureLines = (d.failures || [])
        .map((f) => `Line ${f.lineNumber}: ${f.message}`)
        .join('\n');
      const partialErrors = (d.failed ?? 0) > 0;
      const dialogType = partialErrors ? 'error' : 'success';
      const dialogTitle = partialErrors ? 'Import finished with errors' : 'Import complete';
      const baseMessage = `Imported: ${d.imported ?? 0}\nSkipped (duplicates): ${d.skipped ?? 0}\nFailed: ${d.failed ?? 0}`;
      await showIntentFlowDialog({
        id: 'import-complete',
        type: dialogType,
        title: dialogTitle,
        message: failureLines ? `${baseMessage}\n\n${failureLines}` : baseMessage,
      });
    } catch (e) {
      setError(e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const showAccountPicker = !fixedAccountId && (step === 'account' || (step === 'pick' && !accountId));
  const showColumnMapping = step === 'map-columns';
  const showCategoryStep = step === 'map-categories';
  const showImportPreview = step === 'review' && previewTransactions.length > 0;
  const mappedCount = bankCategories.filter((item) => {
    const mapped = categoryMappings[item.key];
    return mapped != null && mapped !== '';
  }).length;

  const stepLabels = {
    pick: '1. Choose file',
    account: '2. Select account',
    'map-columns': '3. Map columns',
    'map-categories': '4. Map categories (optional)',
    review: canOfferCategoryStep ? '5. Review & import' : '4. Review & import',
  };

  const isWideModal =
    showImportPreview || showCategoryStep || showCategoryMappingTable;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-import-modal-title"
        style={{
          ...styles.modal,
          ...(isWideModal ? styles.modalWide : null),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={styles.modalHeader}>
          <h3 id="transaction-import-modal-title" style={styles.title}>
            {title}
          </h3>
          <p style={styles.hint}>
            CSV export from your bank. Supported institutions: Wells Fargo, PNC Bank, Capital One,
            Navy Federal Credit Union, American Express, and Bank of America. Map a{' '}
            <strong>Debit/Credit</strong> column when Amount is always positive (Navy Federal). Use
            the optional category mapping step to align bank categories with your budget. Duplicates
            are skipped.
          </p>
          {step !== 'pick' && step !== 'account' ? (
            <p style={styles.stat}>
              Step: <strong>{stepLabels[step] || step}</strong>
            </p>
          ) : null}
        </header>

        <div style={styles.modalBody}>
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

        {(showColumnMapping || showCategoryStep || showImportPreview) && headers.length > 0 && (
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
        )}

        {showColumnMapping && headers.length > 0 && (
          <>
            <h4 style={styles.sectionTitle}>Map CSV columns</h4>
            <p style={styles.sectionHint}>
              Match each field to a column in your file. Select <strong>Bank category column</strong> if
              your export includes spending categories (recommended for automatic mapping).
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
          </>
        )}

        {showCategoryStep && (
          <ImportCategoryMappingStep
            institutionLabel={institutionLabel}
            hasCategoryColumnMapped={hasCategoryColumnMapped}
            categoryColumnName={columnMap.category}
            bankCategories={bankCategories}
            categoryMappings={categoryMappings}
            onCategoryMappingChange={handleCategoryMappingChange}
            budgetCategories={budgetCategories}
            saveCategoryMappings={saveCategoryMappings}
            onSaveCategoryMappingsChange={setSaveCategoryMappings}
            mappedCount={mappedCount}
            onManageSavedMappings={() => setShowMappingsManager(true)}
          />
        )}

        {showImportPreview && (
          <>
            <ImportTransactionPreview
              transactions={previewTransactions}
              categories={budgetCategories}
              title="Preview (categories reflect your mappings)"
            />
            {parseErrors.length > 0 && (
              <p style={styles.error}>
                {parseErrors.length} row(s) could not be parsed (see line numbers in file).
              </p>
            )}
          </>
        )}

        {error ? <p style={styles.error}>{error}</p> : null}
        </div>

        <footer style={styles.modalFooter}>
          <div style={styles.buttonRow}>
            {step === 'pick' && (
              <button type="button" style={styles.primary} onClick={handlePickFile} disabled={busy}>
                {busy ? 'Loading…' : 'Choose CSV file…'}
              </button>
            )}
            {showAccountPicker && importFilePath && (
              <button
                type="button"
                style={styles.primary}
                onClick={handleAccountContinue}
                disabled={busy || !accountId}
              >
                Continue
              </button>
            )}
            {showColumnMapping && validCount > 0 && (
              <>
                <button
                  type="button"
                  style={styles.primary}
                  onClick={continueToCategoryMapping}
                  disabled={busy}
                >
                  {canOfferCategoryStep ? 'Next: Map categories' : 'Next: Review'}
                </button>
                {canOfferCategoryStep && (
                  <button
                    type="button"
                    style={styles.secondary}
                    onClick={skipCategoryMapping}
                    disabled={busy}
                  >
                    Skip category mapping
                  </button>
                )}
              </>
            )}
            {showCategoryStep && (
              <>
                <button
                  type="button"
                  style={styles.secondary}
                  onClick={() => setStep('map-columns')}
                  disabled={busy}
                >
                  Back
                </button>
                <button type="button" style={styles.primary} onClick={goToReview} disabled={busy}>
                  {busy ? 'Updating preview…' : 'Continue to review'}
                </button>
                <button
                  type="button"
                  style={styles.secondary}
                  onClick={skipCategoryMapping}
                  disabled={busy}
                >
                  Skip & use defaults
                </button>
              </>
            )}
            {step === 'review' && validCount > 0 && (
              <>
                <button
                  type="button"
                  style={styles.secondary}
                  onClick={() => setStep(canOfferCategoryStep ? 'map-categories' : 'map-columns')}
                  disabled={busy}
                >
                  Back
                </button>
                <button type="button" style={styles.primary} onClick={handleImport} disabled={busy}>
                  {busy ? 'Importing…' : `Approve import (${validCount})`}
                </button>
              </>
            )}
            <button type="button" style={styles.secondary} onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
        </footer>
      </div>

      <ImportCategoryMappingsManager
        isOpen={showMappingsManager}
        onClose={() => setShowMappingsManager(false)}
        budgetCategories={budgetCategories}
        onMappingsChanged={async () => {
          if (accountId && importFilePath) {
            await runPreview(importFilePath, accountId, columnMap, categoryMappings, true);
          }
        }}
      />
    </div>
  );
}
