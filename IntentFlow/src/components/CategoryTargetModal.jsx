import React, { useState, useEffect } from 'react';
import PM from '../constants/pmTheme.jsx';
import {
  CATEGORY_GOAL_TYPE_OPTIONS,
  CATEGORY_GOAL_FREQUENCY_OPTIONS,
  normalizeGoalFrequencyForSelect,
} from '../constants/categoryGoalTypes.jsx';
import { formatDateForInput } from '../utils/budgetMonthUtils.jsx';
import { parseMoneyInput, formatMoneyInput } from '../utils/categoryMoneyInput.jsx';

const CategoryTargetModal = ({ 
  isOpen, 
  onClose, 
  category, 
  onSave,
  currentTargetAmount = 0,
  currentTargetType = 'monthly',
  currentTargetDate = null,
  currentTargetFrequency = 'monthly'
}) => {
  const [targetType, setTargetType] = useState(currentTargetType);
  const [targetFrequency, setTargetFrequency] = useState(
    normalizeGoalFrequencyForSelect(currentTargetFrequency),
  );
  const [targetAmountInput, setTargetAmountInput] = useState('');
  const [targetDate, setTargetDate] = useState(formatDateForInput(currentTargetDate));
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTargetType(currentTargetType);
      setTargetFrequency(normalizeGoalFrequencyForSelect(currentTargetFrequency));
      setTargetAmountInput(formatMoneyInput(currentTargetAmount));
      setTargetDate(formatDateForInput(currentTargetDate));
      setError('');
    }
  }, [isOpen, currentTargetType, currentTargetAmount, currentTargetDate, currentTargetFrequency]);

  const handleSave = () => {
    const targetAmount = parseMoneyInput(targetAmountInput);
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setError('Please enter a valid target amount (greater than 0)');
      return;
    }

    if (targetType === 'by_date' && !targetDate) {
      setError('Please select a target date for this goal');
      return;
    }

    if (targetType === 'by_date') {
      const [y, m, d] = targetDate.split('-').map(Number);
      const selectedDate = new Date(y, m - 1, d);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selectedDate.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        setError('Target date cannot be in the past');
        return;
      }
    }

    onSave({
      target_amount: targetAmount,
      target_type: targetType,
      target_date: targetType === 'by_date' ? targetDate : null,
      target_frequency: targetFrequency,
    });
  };

  const getTargetDescription = () => {
    switch (targetType) {
      case 'monthly':
        return 'Set how much you want to fund this category each month.';
      case 'balance':
        return 'Save toward a target balance in this category. Progress is based on available balance.';
      case 'by_date':
        return 'Save toward a target category balance by a specific date.';
      default:
        return "";
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>Set Goal for {category?.name}</h3>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        <div style={styles.formGroup}>
          <label htmlFor="category-goal-type" style={styles.label}>Goal Type</label>
          <select
            id="category-goal-type"
            style={styles.select}
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
          >
            {CATEGORY_GOAL_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p style={styles.helperText}>{getTargetDescription()}</p>
        </div>

        <div style={styles.formGroup}>
          <label htmlFor="category-goal-frequency" style={styles.label}>Frequency</label>
          <select
            id="category-goal-frequency"
            style={styles.select}
            value={targetFrequency}
            onChange={(e) => setTargetFrequency(e.target.value)}
          >
            {CATEGORY_GOAL_FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <table style={styles.frequencyTable} aria-label="Supported goal frequencies">
            <thead>
              <tr>
                <th style={styles.frequencyTableHeader}>Frequency</th>
                <th style={styles.frequencyTableHeader}>Supported</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_GOAL_FREQUENCY_OPTIONS.map((opt) => (
                <tr key={opt.value}>
                  <td style={styles.frequencyTableCell}>{opt.label}</td>
                  <td style={styles.frequencyTableCell}>{opt.supported ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={styles.formGroup}>
          <label htmlFor="category-goal-amount" style={styles.label}>
            {targetType === 'monthly'
              ? 'Monthly funding amount'
              : targetType === 'balance'
                ? 'Target category balance'
                : 'Target category balance'}
          </label>
          <div style={styles.amountInputWrapper}>
            <span style={styles.currencySymbol}>$</span>
            <input
              id="category-goal-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label="Goal target"
              style={styles.amountInput}
              value={targetAmountInput}
              onChange={(e) => {
                setTargetAmountInput(e.target.value);
                setError('');
              }}
              placeholder="0.00"
              autoFocus
            />
          </div>
        </div>

        {targetType === 'by_date' && (
          <div style={styles.formGroup}>
            <label htmlFor="category-goal-date" style={styles.label}>Target Date</label>
            <input
              id="category-goal-date"
              type="date"
              style={{ ...styles.input, colorScheme: 'dark' }}
              value={targetDate || ''}
              onChange={(e) => {
                setTargetDate(e.target.value);
                setError('');
              }}
            />
            {targetDate && parseMoneyInput(targetAmountInput) > 0 && (
              <div style={styles.calculationHint}>
                💡 You'll need to save approximately $
                {(parseMoneyInput(targetAmountInput) / Math.max(1, Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30)))).toFixed(2)} 
                per month to reach your goal by {new Date(targetDate).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        {targetType === 'balance' && category && (
          <div style={styles.currentBalanceHint}>
            Current balance: ${(category.available || 0).toFixed(2)}
            {parseMoneyInput(targetAmountInput) > 0 && (
              <span style={{ color: category.available >= parseMoneyInput(targetAmountInput) ? '#4ADE80' : '#F59E0B' }}>
                {category.available >= parseMoneyInput(targetAmountInput)
                  ? ' ✓ Goal achieved!' 
                  : ` (Need $${(parseMoneyInput(targetAmountInput) - (category.available || 0)).toFixed(2)} more)`}
              </span>
            )}
          </div>
        )}

        {error && <div style={styles.errorMessage}>{error}</div>}

        <div style={styles.modalActions}>
          <button style={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button style={styles.saveButton} onClick={handleSave}>
            Save Goal
          </button>
        </div>

        <div style={styles.removeTargetSection}>
          <button 
            style={styles.removeButton}
            onClick={() => {
              if (confirm('Remove goal from this category?')) {
                onSave({
                  target_amount: null,
                  target_type: 'monthly',
                  target_date: null,
                  target_frequency: 'monthly',
                });
              }
            }}
          >
            Remove Goal
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: PM.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: PM.fg,
    borderRadius: '16px',
    padding: '24px',
    width: '90%',
    maxWidth: '500px',
    border: '1px solid ' + PM.border,
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: PM.shadow,
    color: PM.text
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  modalTitle: {
    color: PM.text,
    fontSize: '20px',
    fontWeight: '600',
    margin: 0
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: PM.textMuted,
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px 8px'
  },
  formGroup: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    color: PM.textMuted,
    fontSize: '13px',
    marginBottom: '8px',
    fontWeight: '500'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: PM.well,
    border: '1px solid ' + PM.border,
    borderRadius: '8px',
    color: PM.text,
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  helperText: {
    color: PM.textMuted,
    fontSize: '12px',
    marginTop: '6px',
    lineHeight: '1.4'
  },
  frequencyTable: {
    width: '100%',
    marginTop: '10px',
    borderCollapse: 'collapse',
    fontSize: '12px',
    color: PM.textMuted,
  },
  frequencyTableHeader: {
    textAlign: 'left',
    padding: '6px 8px',
    borderBottom: '1px solid ' + PM.border,
    fontWeight: '600',
    color: PM.text,
  },
  frequencyTableCell: {
    padding: '6px 8px',
    borderBottom: '1px solid ' + PM.border,
  },
  amountInputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  currencySymbol: {
    position: 'absolute',
    left: '12px',
    color: PM.textMuted,
    fontSize: '14px'
  },
  amountInput: {
    width: '100%',
    padding: '10px 12px 10px 28px',
    backgroundColor: PM.well,
    border: '1px solid ' + PM.border,
    borderRadius: '8px',
    color: PM.text,
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: PM.well,
    border: '1px solid ' + PM.border,
    borderRadius: '8px',
    color: PM.text,
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  calculationHint: {
    marginTop: '8px',
    padding: '8px',
    backgroundColor: PM.bg,
    borderRadius: '6px',
    color: '#0047AB',
    fontSize: '12px'
  },
  currentBalanceHint: {
    marginTop: '-10px',
    marginBottom: '16px',
    padding: '8px',
    backgroundColor: PM.bg,
    borderRadius: '6px',
    color: '#0047AB',
    fontSize: '12px'
  },
  errorMessage: {
    padding: '10px',
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderRadius: '8px',
    color: '#FECACA',
    fontSize: '13px',
    marginBottom: '16px',
    border: '1px solid rgba(252, 165, 165, 0.5)'
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px'
  },
  saveButton: {
    backgroundColor: PM.bg,
    color: PM.text,
    border: '1px solid ' + PM.border,
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  cancelButton: {
    backgroundColor: 'rgba(220, 38, 38, 0.88)',
    color: PM.text,
    border: '1px solid ' + PM.border,
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  removeTargetSection: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid ' + PM.border,
    textAlign: 'center'
  },
  removeButton: {
    backgroundColor: 'transparent',
    color: '#FECACA',
    border: '1px solid rgba(252, 165, 165, 0.6)',
    padding: '6px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px'
  }
};

export default CategoryTargetModal;