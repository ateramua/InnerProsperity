import React, { useMemo, useState, useEffect, useRef } from 'react';
import useTransactionPayees, {
  serializePayeeOption,
  parsePayeeOption,
  findPayeeOptionByName,
  filterTransferPayeesForAccount,
} from '../../hooks/useTransactionPayees.jsx';

const styles = {
  select: {
    width: '100%',
    padding: '0.35rem 0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid #334155',
    background: '#111827',
    color: '#F3F4F6',
    fontSize: '0.875rem',
    minWidth: '12rem',
  },
  input: {
    width: '100%',
    padding: '0.35rem 0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid #2563EB',
    background: '#111827',
    color: '#F3F4F6',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
  },
  loading: {
    fontSize: '0.8rem',
    color: '#9CA3AF',
    padding: '0.35rem 0',
  },
};

const PLACEHOLDER = '-- Select or enter payee --';
const TRANSFERS_GROUP = 'PAYMENTS & TRANSFERS';
const RECENT_GROUP = 'RECENT PAYEES';

/**
 * Payee dropdown (Add Transaction modals + All Accounts table).
 */
export default function TransactionPayeeSelect({
  payeeName = '',
  excludeAccountId = null,
  onCommit,
  onCancel,
  autoFocus = false,
  alwaysOpen = false,
  disabled = false,
  payees: payeesProp = null,
  payeesLoading: payeesLoadingProp = false,
}) {
  const internal = useTransactionPayees(excludeAccountId, { enabled: !payeesProp });
  const loading = payeesProp ? payeesLoadingProp : internal.loading;
  const source = payeesProp || internal.payees;

  const payees = useMemo(
    () => ({
      transferPayees: filterTransferPayeesForAccount(source, excludeAccountId),
      regularPayees: source?.regularPayees || [],
    }),
    [source, excludeAccountId]
  );

  const inputRef = useRef(null);
  const matchedOption = useMemo(
    () => findPayeeOptionByName(payees, payeeName),
    [payees, payeeName]
  );

  const [manualMode, setManualMode] = useState(
    () => !alwaysOpen && !matchedOption && Boolean(payeeName?.trim())
  );
  const [manualText, setManualText] = useState(payeeName || '');

  const selectValue = useMemo(() => {
    if (matchedOption) return serializePayeeOption(matchedOption);
    if (payeeName?.trim()) return `__current__:${payeeName}`;
    return '';
  }, [matchedOption, payeeName]);

  useEffect(() => {
    if (alwaysOpen) return;
    const match = findPayeeOptionByName(payees, payeeName);
    if (match) {
      setManualMode(false);
    } else if (payeeName?.trim()) {
      setManualMode(true);
      setManualText(payeeName);
    } else {
      setManualMode(false);
      setManualText('');
    }
  }, [payees, payeeName, alwaysOpen]);

  useEffect(() => {
    if (manualMode && autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [manualMode, autoFocus]);

  const commitManual = async () => {
    const trimmed = manualText.trim();
    const current = (payeeName || '').trim();
    if (!trimmed || trimmed === current) {
      if (!alwaysOpen) onCancel?.();
      return;
    }
    await onCommit?.({
      payee: trimmed,
      description: trimmed,
      picked: { name: trimmed, isTransfer: false },
    });
  };

  const handleSelectChange = async (e) => {
    e.stopPropagation();
    const value = e.target.value;
    if (value === '__manual__') {
      setManualMode(true);
      setManualText(payeeName || '');
      return;
    }
    if (!value || value.startsWith('__current__:')) return;

    const picked = parsePayeeOption(value);
    if (!picked?.name) return;

    const current = (payeeName || '').trim();
    if (picked.name === current) {
      if (!alwaysOpen) onCancel?.();
      return;
    }

    await onCommit?.({
      payee: picked.name,
      description: picked.name,
      picked,
    });
  };

  if (loading && !payees.transferPayees.length && !payees.regularPayees.length) {
    return <div style={styles.loading}>Loading payees…</div>;
  }

  if (manualMode && !disabled) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          onBlur={commitManual}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setManualText(payeeName || '');
              setManualMode(false);
              onCancel?.();
            }
          }}
          style={styles.input}
          placeholder="Enter payee name"
          aria-label="Enter payee manually"
        />
      </div>
    );
  }

  const showCurrentOption = payeeName?.trim() && !matchedOption;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <select
        value={selectValue}
        onChange={handleSelectChange}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' && !alwaysOpen) onCancel?.();
        }}
        disabled={disabled}
        autoFocus={autoFocus && !alwaysOpen}
        style={styles.select}
        aria-label="Payee"
        title={payeeName || PLACEHOLDER}
      >
        <option value="">{PLACEHOLDER}</option>
        {showCurrentOption && (
          <option value={`__current__:${payeeName}`}>{payeeName}</option>
        )}
        {payees.transferPayees.length > 0 && (
          <optgroup label={TRANSFERS_GROUP}>
            {payees.transferPayees.map((payee) => (
              <option key={payee.id} value={serializePayeeOption(payee)}>
                {payee.name}
              </option>
            ))}
          </optgroup>
        )}
        {payees.regularPayees.length > 0 && (
          <optgroup label={RECENT_GROUP}>
            {payees.regularPayees.map((payee) => (
              <option key={payee.id} value={serializePayeeOption(payee)}>
                {payee.name}
              </option>
            ))}
          </optgroup>
        )}
        {!disabled && <option value="__manual__">Other (type manually)</option>}
      </select>
    </div>
  );
}
