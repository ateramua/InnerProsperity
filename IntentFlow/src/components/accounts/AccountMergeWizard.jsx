import React, { useEffect, useState } from 'react';
import { showAppToast } from '../AppToast';
import { showIntentFlowConfirmDialog } from '../../utils/showIntentFlowDialog.jsx';

/**
 * Merge Review Wizard — Plaid account ↔ existing manual account.
 */
export default function AccountMergeWizard({
  offers = [],
  onClose,
  onMerged,
  onKeptSeparate,
  onResolved,
}) {
  const [activeOffer, setActiveOffer] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (offers.length && !activeOffer) {
      setActiveOffer(offers[0]);
      setSelectedTargetId(offers[0].candidates?.[0]?.id ?? null);
    }
  }, [offers, activeOffer]);

  useEffect(() => {
    if (!activeOffer || !selectedTargetId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      try {
        const res = await window.electronAPI?.getAccountMergePreview?.(
          activeOffer.plaidAccountId,
          selectedTargetId
        );
        if (!cancelled && res?.success) {
          setPreview(res.data);
        }
      } catch (e) {
        if (!cancelled) console.error('Merge preview failed:', e);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOffer, selectedTargetId]);

  const formatMoney = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      Math.abs(Number(n) || 0)
    );

  const advanceOfferQueue = (plaidAccountId) => {
    const rest = offers.filter((o) => o.plaidAccountId !== plaidAccountId);
    if (rest.length) {
      setActiveOffer(rest[0]);
      setSelectedTargetId(rest[0].candidates?.[0]?.id ?? null);
      setPreview(null);
    } else {
      onClose?.();
    }
  };

  const resolveDuplicate = async (action, extra = {}) => {
    if (!activeOffer) return;
    setBusy(true);
    try {
      const res = await window.electronAPI?.resolveAccountDuplicate?.({
        action,
        plaidAccountId: activeOffer.plaidAccountId,
        targetAccountId: selectedTargetId,
        ...extra,
      });
      if (res?.success) {
        showAppToast(`Resolved: ${action.replace(/_/g, ' ')}`, 'success');
        onResolved?.({ action, plaidAccountId: activeOffer.plaidAccountId, data: res.data });
        if (action === 'merge') onMerged?.(activeOffer.plaidAccountId);
        if (action === 'keep_both') onKeptSeparate?.(activeOffer.plaidAccountId);
        advanceOfferQueue(activeOffer.plaidAccountId);
      } else {
        showAppToast(res?.error || 'Could not resolve duplicate', 'error');
      }
    } catch (e) {
      showAppToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleMerge = () => resolveDuplicate('merge');
  const handleReplace = () => resolveDuplicate('replace');
  const handleKeepSeparate = () => resolveDuplicate('keep_both');

  const handleKeepOffBudget = async () => {
    const confirmed = await showIntentFlowConfirmDialog({
      title: 'Keep off budget?',
      message:
        'The linked account will sync balances but will not affect Ready to Assign or your budget envelope.',
    });
    if (confirmed) await resolveDuplicate('keep_off_budget');
  };

  const handleIgnore = async () => {
    const confirmed = await showIntentFlowConfirmDialog({
      title: 'Ignore imported account?',
      message: 'This Plaid account will not be imported again unless you reconnect it.',
    });
    if (confirmed) await resolveDuplicate('ignore');
  };

  const handleIgnoreTemporarily = () => resolveDuplicate('ignore_temporarily', { temporaryDays: 7 });

  const handleDecideLater = () => {
    advanceOfferQueue(activeOffer?.plaidAccountId);
  };

  if (!offers.length || !activeOffer) return null;

  const dup = preview?.preview?.duplicateAnalysis;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <h2 style={styles.title}>Duplicate account review</h2>
        <p style={styles.intro}>
          This linked account may match an existing account. Choose how to resolve it.
          {activeOffer.confidence != null && (
            <span style={styles.confidence}>
              {' '}
              Match confidence: <strong>{activeOffer.confidence}%</strong>
            </span>
          )}
        </p>

        <div style={styles.columns}>
          <div style={styles.card}>
            <h4 style={styles.cardTitle}>Detected (Plaid)</h4>
            <p style={styles.row}>
              <strong>{activeOffer.plaidDisplayName}</strong>
            </p>
            {activeOffer.mask && <p style={styles.row}>•••• {activeOffer.mask}</p>}
            {preview?.incoming && (
              <>
                <p style={styles.row}>Balance: {formatMoney(preview.incoming.balance)}</p>
                <p style={styles.row}>Transactions: {preview.incoming.transactionCount ?? 0}</p>
              </>
            )}
          </div>

          <div style={styles.card}>
            <h4 style={styles.cardTitle}>Existing (IntentFlow)</h4>
            <label style={styles.selectLabel}>Match target:</label>
            <select
              style={styles.select}
              value={selectedTargetId || ''}
              onChange={(e) => setSelectedTargetId(e.target.value)}
            >
              {activeOffer.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.institution ? ` — ${c.institution}` : ''}
                  {c.confidence != null ? ` (${c.confidence}% match)` : ''}
                </option>
              ))}
            </select>
            {preview?.existing && (
              <>
                <p style={styles.row}>Balance: {formatMoney(preview.existing.balance)}</p>
                <p style={styles.row}>Transactions: {preview.existing.transactionCount ?? 0}</p>
              </>
            )}
          </div>
        </div>

        {previewLoading && <p style={styles.muted}>Loading merge preview…</p>}

        {dup && !previewLoading && (
          <div style={styles.previewBox}>
            <h4 style={styles.cardTitle}>Merge preview</h4>
            <ul style={styles.previewList}>
              <li>Exact duplicates removed: <strong>{dup.exactDuplicateCount}</strong></li>
              <li>Probable duplicates: <strong>{dup.probableDuplicateCount}</strong></li>
              <li>New transactions retained: <strong>{dup.uniqueIncomingCount}</strong></li>
            </ul>
          </div>
        )}

        <div style={styles.actions}>
          <button type="button" style={styles.primary} disabled={busy || !selectedTargetId} onClick={handleMerge}>
            {busy ? 'Working…' : 'Merge accounts'}
          </button>
          <button type="button" style={styles.secondary} disabled={busy || !selectedTargetId} onClick={handleReplace}>
            Replace manual
          </button>
          <button type="button" style={styles.secondary} disabled={busy} onClick={handleKeepSeparate}>
            Keep both
          </button>
          <button type="button" style={styles.secondary} disabled={busy} onClick={handleKeepOffBudget}>
            Keep off budget
          </button>
          <button type="button" style={styles.ghost} disabled={busy} onClick={handleIgnoreTemporarily}>
            Snooze 7 days
          </button>
          <button type="button" style={styles.ghost} disabled={busy} onClick={handleIgnore}>
            Ignore imported
          </button>
          <button type="button" style={styles.ghost} disabled={busy} onClick={handleDecideLater}>
            Decide later
          </button>
        </div>

        {offers.length > 1 && (
          <p style={styles.muted}>{offers.length} account(s) waiting for review</p>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: 24,
  },
  panel: {
    background: '#1e293b',
    color: '#f1f5f9',
    borderRadius: 12,
    padding: 28,
    maxWidth: 760,
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
  },
  title: { margin: '0 0 12px', fontSize: 22 },
  intro: { margin: '0 0 20px', lineHeight: 1.5, color: '#cbd5e1' },
  confidence: { color: '#93c5fd' },
  columns: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  card: {
    background: '#0f172a',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #334155',
  },
  cardTitle: { margin: '0 0 10px', fontSize: 14, color: '#94a3b8' },
  row: { margin: '6px 0', fontSize: 14 },
  selectLabel: { display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 },
  select: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #475569',
    background: '#1e293b',
    color: '#f8fafc',
    marginBottom: 10,
  },
  previewBox: {
    background: '#0f172a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    border: '1px solid #334155',
  },
  previewList: { margin: '8px 0', paddingLeft: 20, lineHeight: 1.6 },
  muted: { fontSize: 13, color: '#94a3b8', margin: '8px 0 0' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  primary: {
    padding: '10px 18px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
  },
  secondary: {
    padding: '10px 18px',
    background: '#334155',
    color: '#f1f5f9',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  ghost: {
    padding: '10px 18px',
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid #475569',
    borderRadius: 8,
    cursor: 'pointer',
  },
};
