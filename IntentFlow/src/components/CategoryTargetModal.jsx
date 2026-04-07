import React, { useState, useEffect } from 'react';

const CategoryTargetModal = ({ 
  isOpen, 
  onClose, 
  category, 
  onSave,
  currentTargetAmount = 0,
  currentTargetType = 'monthly',
  currentTargetDate = null
}) => {
  const [targetType, setTargetType] = useState(currentTargetType);
  const [targetAmount, setTargetAmount] = useState(currentTargetAmount);
  const [targetDate, setTargetDate] = useState(currentTargetDate || '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTargetType(currentTargetType);
      setTargetAmount(currentTargetAmount);
      setTargetDate(currentTargetDate || '');
      setError('');
    }
  }, [isOpen, currentTargetType, currentTargetAmount, currentTargetDate]);

  const handleSave = () => {
    // Validation
    if (targetAmount <= 0) {
      setError('Please enter a valid target amount greater than 0');
      return;
    }

    if (targetType === 'by_date' && !targetDate) {
      setError('Please select a target date for this goal');
      return;
    }

    if (targetType === 'by_date') {
      const selectedDate = new Date(targetDate);
      const today = new Date();
      if (selectedDate <= today) {
        setError('Target date must be in the future');
        return;
      }
    }

    onSave({
      target_amount: targetAmount,
      target_type: targetType,
      target_date: targetType === 'by_date' ? targetDate : null
    });
  };

  const getTargetDescription = () => {
    switch (targetType) {
      case 'monthly':
        return "Set a monthly amount to assign to this category each month.";
      case 'balance':
        return "Save toward a specific balance goal. The progress bar shows how close you are to your target.";
      case 'by_date':
        return "Set a target amount to save by a specific date. We'll calculate how much you need to set aside each month.";
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
          <label style={styles.label}>Goal Type</label>
          <select 
            style={styles.select}
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
          >
            <option value="monthly">Monthly Funding Target</option>
            <option value="balance">Balance Goal (e.g., Emergency Fund)</option>
            <option value="by_date">Target by Date (e.g., Vacation by July)</option>
          </select>
          <p style={styles.helperText}>{getTargetDescription()}</p>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>
            {targetType === 'monthly' ? 'Monthly Target Amount' : 
             targetType === 'balance' ? 'Target Balance' : 
             'Target Amount to Save'}
          </label>
          <div style={styles.amountInputWrapper}>
            <span style={styles.currencySymbol}>$</span>
            <input
              type="number"
              style={styles.amountInput}
              value={targetAmount === 0 ? '' : targetAmount}
              onChange={(e) => {
                const value = e.target.value === '' ? 0 : parseFloat(e.target.value);
                setTargetAmount(value);
                setError('');
              }}
              placeholder="0.00"
              step="0.01"
              min="0"
              autoFocus
            />
          </div>
        </div>

        {targetType === 'by_date' && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Target Date</label>
            <input
              type="date"
              style={styles.input}
              value={targetDate}
              onChange={(e) => {
                setTargetDate(e.target.value);
                setError('');
              }}
            />
            {targetDate && targetAmount > 0 && (
              <div style={styles.calculationHint}>
                💡 You'll need to save approximately $
                {(targetAmount / Math.max(1, Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30)))).toFixed(2)} 
                per month to reach your goal by {new Date(targetDate).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        {targetType === 'balance' && category && (
          <div style={styles.currentBalanceHint}>
            Current balance: ${(category.available || 0).toFixed(2)}
            {targetAmount > 0 && (
              <span style={{ color: category.available >= targetAmount ? '#4ADE80' : '#F59E0B' }}>
                {category.available >= targetAmount 
                  ? ' ✓ Goal achieved!' 
                  : ` (Need $${(targetAmount - (category.available || 0)).toFixed(2)} more)`}
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
                  target_date: null
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: '#1E3A8A',
    borderRadius: '16px',
    padding: '24px',
    width: '90%',
    maxWidth: '500px',
    border: '1px solid #334155',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: '20px',
    fontWeight: '600',
    margin: 0
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#94A3B8',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px 8px'
  },
  formGroup: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    color: '#94A3B8',
    fontSize: '13px',
    marginBottom: '8px',
    fontWeight: '500'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#FFFFFF',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  helperText: {
    color: '#64748B',
    fontSize: '12px',
    marginTop: '6px',
    lineHeight: '1.4'
  },
  amountInputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  currencySymbol: {
    position: 'absolute',
    left: '12px',
    color: '#94A3B8',
    fontSize: '14px'
  },
  amountInput: {
    width: '100%',
    padding: '10px 12px 10px 28px',
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#FFFFFF',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#FFFFFF',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  calculationHint: {
    marginTop: '8px',
    padding: '8px',
    backgroundColor: '#0F172A',
    borderRadius: '6px',
    color: '#60A5FA',
    fontSize: '12px'
  },
  currentBalanceHint: {
    marginTop: '-10px',
    marginBottom: '16px',
    padding: '8px',
    backgroundColor: '#0F172A',
    borderRadius: '6px',
    color: '#94A3B8',
    fontSize: '12px'
  },
  errorMessage: {
    padding: '10px',
    backgroundColor: '#7F1D1D',
    borderRadius: '8px',
    color: '#FCA5A5',
    fontSize: '13px',
    marginBottom: '16px'
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px'
  },
  saveButton: {
    backgroundColor: '#10B981',
    color: 'white',
    border: 'none',
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500'
  },
  cancelButton: {
    backgroundColor: '#374151',
    color: 'white',
    border: 'none',
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500'
  },
  removeTargetSection: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '1px solid #334155',
    textAlign: 'center'
  },
  removeButton: {
    backgroundColor: 'transparent',
    color: '#EF4444',
    border: '1px solid #EF4444',
    padding: '6px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px'
  }
};

export default CategoryTargetModal;