import React, { useEffect, useMemo, useState } from 'react';

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modal: {
    width: 'min(520px, 100%)',
    background: '#1F2937',
    border: '1px solid #374151',
    borderRadius: '0.75rem',
    padding: '1.25rem',
    boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
  },
  title: { margin: '0 0 0.35rem', color: '#F9FAFB', fontSize: '1.125rem' },
  subtitle: { margin: '0 0 1rem', color: '#9CA3AF', fontSize: '0.875rem' },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 120px 36px',
    gap: '0.5rem',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  select: {
    padding: '0.45rem',
    borderRadius: '0.375rem',
    border: '1px solid #374151',
    background: '#111827',
    color: '#F3F4F6',
    fontSize: '0.875rem',
  },
  input: {
    padding: '0.45rem',
    borderRadius: '0.375rem',
    border: '1px solid #374151',
    background: '#111827',
    color: '#F3F4F6',
    fontSize: '0.875rem',
    width: '100%',
  },
  btn: {
    padding: '0.45rem 0.85rem',
    borderRadius: '0.375rem',
    border: '1px solid #475569',
    background: '#334155',
    color: '#E5E7EB',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: 600,
  },
  primary: {
    background: '#2563EB',
    borderColor: '#3B82F6',
  },
  danger: { background: '#7F1D1D', borderColor: '#B91C1C' },
  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    justifyContent: 'space-between',
    marginTop: '1rem',
    alignItems: 'center',
  },
  meta: { fontSize: '0.8125rem', color: '#9CA3AF' },
  error: { color: '#FCA5A5', fontSize: '0.8125rem', marginTop: '0.5rem' },
};

function emptyLine() {
  return { categoryId: '', amount: '' };
}

/**
 * Split a transaction across budget categories (FR-8).
 */
export default function TransactionSplitModal({
  open,
  transaction,
  categories = [],
  onClose,
  onSaved,
}) {
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const totalAmount = useMemo(
    () => Math.abs(Number(transaction?.amount) || 0),
    [transaction?.amount]
  );

  const lineSum = useMemo(
    () =>
      lines.reduce((s, line) => {
        const n = parseFloat(line.amount);
        return s + (Number.isFinite(n) ? Math.abs(n) : 0);
      }, 0),
    [lines]
  );

  const remaining = round2(totalAmount - lineSum);

  useEffect(() => {
    if (!open || !transaction?.id) return undefined;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        if (window.electronAPI?.getTransactionSplits) {
          const res = await window.electronAPI.getTransactionSplits(transaction.id);
          if (cancelled) return;
          if (res?.success && res.data?.splits?.length) {
            setLines(
              res.data.splits.map((s) => ({
                categoryId: s.category_id,
                amount: String(s.amount),
              }))
            );
          } else {
            const half = totalAmount > 0 ? round2(totalAmount / 2) : '';
            setLines([
              { categoryId: '', amount: half === '' ? '' : String(half) },
              {
                categoryId: '',
                amount: half === '' ? '' : String(round2(totalAmount - half)),
              },
            ]);
          }
        } else {
          const half = totalAmount > 0 ? round2(totalAmount / 2) : '';
          setLines([
            { categoryId: '', amount: half === '' ? '' : String(half) },
            { categoryId: '', amount: half === '' ? '' : String(round2(totalAmount - half)) },
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, transaction?.id, totalAmount]);

  if (!open || !transaction) return null;

  const payee = transaction.payee || transaction.description || 'Transaction';

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (index) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const fillRemainder = (index) => {
    const others = lines.reduce((s, line, i) => {
      if (i === index) return s;
      const n = parseFloat(line.amount);
      return s + (Number.isFinite(n) ? Math.abs(n) : 0);
    }, 0);
    const rest = Math.max(0, round2(totalAmount - others));
    updateLine(index, { amount: String(rest) });
  };

  const handleSave = async () => {
    setError('');
    const payload = lines
      .map((line) => ({
        categoryId: line.categoryId,
        amount: Math.abs(parseFloat(line.amount) || 0),
      }))
      .filter((line) => line.categoryId && line.amount > 0);

    if (payload.length < 2) {
      setError('Add at least two categories with amounts.');
      return;
    }
    if (Math.abs(lineSum - totalAmount) > 0.01) {
      setError(`Split amounts must equal ${formatMoney(totalAmount)} (remaining ${formatMoney(remaining)}).`);
      return;
    }

    setBusy(true);
    try {
      const res = await window.electronAPI.setTransactionSplits(transaction.id, payload);
      if (res?.success === false) {
        setError(res.error || 'Could not save split');
        return;
      }
      await onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not save split');
    } finally {
      setBusy(false);
    }
  };

  const handleClearSplit = async () => {
    if (!confirm('Remove split and return to a single category?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await window.electronAPI.clearTransactionSplits(transaction.id);
      if (res?.success === false) {
        setError(res.error || 'Could not clear split');
        return;
      }
      await onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not clear split');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="split-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 id="split-modal-title" style={styles.title}>
          Split transaction
        </h3>
        <p style={styles.subtitle}>
          {payee} · {formatMoney(totalAmount)} total
        </p>

        {loading ? (
          <p style={styles.meta}>Loading existing split…</p>
        ) : (
          <>
            {lines.map((line, index) => (
              <div key={index} style={styles.row}>
                <select
                  value={line.categoryId}
                  onChange={(e) => updateLine(index, { categoryId: e.target.value })}
                  style={styles.select}
                  aria-label={`Category line ${index + 1}`}
                >
                  <option value="">Category…</option>
                  {(categories || []).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.amount}
                  onChange={(e) => updateLine(index, { amount: e.target.value })}
                  style={styles.input}
                  aria-label={`Amount line ${index + 1}`}
                />
                <button
                  type="button"
                  style={styles.btn}
                  title="Fill remaining amount"
                  onClick={() => fillRemainder(index)}
                >
                  =
                </button>
                {lines.length > 2 && (
                  <button
                    type="button"
                    style={{ ...styles.btn, gridColumn: '3' }}
                    onClick={() => removeLine(index)}
                    title="Remove line"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" style={styles.btn} onClick={addLine}>
              + Add line
            </button>
            <p style={styles.meta}>
              Assigned: {formatMoney(lineSum)} / {formatMoney(totalAmount)}
              {Math.abs(remaining) > 0.01 && (
                <span style={{ color: remaining < 0 ? '#FCA5A5' : '#FCD34D' }}>
                  {' '}
                  ({remaining > 0 ? `${formatMoney(remaining)} left` : `${formatMoney(-remaining)} over`})
                </span>
              )}
            </p>
          </>
        )}

        {error ? <p style={styles.error}>{error}</p> : null}

        <div style={styles.footer}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {transaction.is_split_parent === 1 && (
              <button
                type="button"
                style={{ ...styles.btn, ...styles.danger }}
                disabled={busy}
                onClick={handleClearSplit}
              >
                Remove split
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" style={styles.btn} disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              style={{ ...styles.btn, ...styles.primary }}
              disabled={busy || loading}
              onClick={handleSave}
            >
              {busy ? 'Saving…' : 'Save split'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function formatMoney(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(n) || 0);
}
