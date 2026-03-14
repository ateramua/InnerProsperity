// src/components/mobile/TransferModal.jsx
import React, { useState, useEffect } from 'react';

export default function TransferModal({ isVisible, onClose, onTransfer, accounts }) {
  const [formData, setFormData] = useState({
    fromAccount: '',
    toAccount: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    memo: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isVisible && accounts.length >= 2) {
      setFormData({
        fromAccount: accounts[0]?.id || '',
        toAccount: accounts[1]?.id || '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        memo: ''
      });
      setError('');
    }
  }, [isVisible, accounts]);

  const handleSubmit = async () => {
    if (!formData.fromAccount || !formData.toAccount) {
      setError('Please select both accounts');
      return;
    }

    if (formData.fromAccount === formData.toAccount) {
      setError('From and To accounts must be different');
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const amount = parseFloat(formData.amount);
      
      const outflowTransaction = {
        amount: -amount,
        description: formData.description || 'Transfer',
        accountId: formData.fromAccount,
        date: formData.date,
        memo: formData.memo || 'Transfer',
        categoryId: null,
        cleared: true
      };

      const inflowTransaction = {
        amount: amount,
        description: formData.description || 'Transfer',
        accountId: formData.toAccount,
        date: formData.date,
        memo: formData.memo || 'Transfer',
        categoryId: null,
        cleared: true
      };

      await onTransfer(outflowTransaction, inflowTransaction);
      onClose();
    } catch (error) {
      console.error('Error processing transfer:', error);
      setError('Transfer failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>💰 Transfer Money</h3>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        {error && <div style={styles.errorMessage}>{error}</div>}

        <div style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>From Account *</label>
            <select
              value={formData.fromAccount}
              onChange={(e) => setFormData({...formData, fromAccount: e.target.value})}
              style={styles.select}
            >
              <option value="">Select source account</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.balance >= 0 ? '+' : ''}{acc.balance?.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>To Account *</label>
            <select
              value={formData.toAccount}
              onChange={(e) => setFormData({...formData, toAccount: e.target.value})}
              style={styles.select}
            >
              <option value="">Select destination account</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.balance >= 0 ? '+' : ''}{acc.balance?.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Amount *</label>
            <div style={styles.amountInput}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                placeholder="0.00"
                step="0.01"
                min="0"
                style={styles.amountField}
                autoFocus
              />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="e.g., Monthly savings transfer"
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.actions}>
          <button onClick={onClose} style={styles.cancelButton}>Cancel</button>
          <button onClick={handleSubmit} style={styles.transferButton} disabled={isSubmitting}>
            {isSubmitting ? 'Processing...' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: '100%',
    maxWidth: '500px',
    backgroundColor: '#1F2937',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '24px',
    paddingBottom: '40px',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: 'white',
    margin: 0,
  },
  closeButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: '#374151',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '18px',
    cursor: 'pointer',
  },
  errorMessage: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #EF4444',
    color: '#EF4444',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '24px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    color: '#9CA3AF',
  },
  select: {
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '16px',
  },
  amountInput: {
    position: 'relative',
  },
  currencySymbol: {
    position: 'absolute',
    left: '14px',
    top: '14px',
    color: '#9CA3AF',
  },
  amountField: {
    width: '100%',
    padding: '14px',
    paddingLeft: '36px',
    borderRadius: '12px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '18px',
  },
  input: {
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '16px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  cancelButton: {
    flex: 1,
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid #374151',
    background: 'transparent',
    color: '#9CA3AF',
    fontSize: '16px',
    cursor: 'pointer',
  },
  transferButton: {
    flex: 2,
    padding: '16px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
