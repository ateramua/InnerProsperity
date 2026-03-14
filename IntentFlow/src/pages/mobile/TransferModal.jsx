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

  // Reset form when modal opens
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
    // Validation
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

    const fromAccount = accounts.find(a => a.id === formData.fromAccount);
    const amount = parseFloat(formData.amount);

    if (fromAccount && Math.abs(fromAccount.balance) < amount) {
      if (!confirm(`Warning: Insufficient funds in ${fromAccount.name}. Continue anyway?`)) {
        return;
      }
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Create two transactions: one outflow, one inflow
      const outflowTransaction = {
        amount: -amount,
        description: formData.description || `Transfer to ${accounts.find(a => a.id === formData.toAccount)?.name}`,
        accountId: formData.fromAccount,
        date: formData.date,
        memo: formData.memo || 'Transfer',
        categoryId: null,
        cleared: true
      };

      const inflowTransaction = {
        amount: amount,
        description: formData.description || `Transfer from ${accounts.find(a => a.id === formData.fromAccount)?.name}`,
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

  const fromAccount = accounts.find(a => a.id === formData.fromAccount);
  const toAccount = accounts.find(a => a.id === formData.toAccount);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.title}>💰 Transfer Money</h3>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        {/* Error Message */}
        {error && (
          <div style={styles.errorMessage}>
            {error}
          </div>
        )}

        {/* Form */}
        <div style={styles.form}>
          {/* From Account */}
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

          {/* To Account */}
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

          {/* Amount */}
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

          {/* Date */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              style={styles.input}
            />
          </div>

          {/* Description */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Description (Optional)</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="e.g., Monthly savings transfer"
              style={styles.input}
            />
          </div>

          {/* Memo */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Memo (Optional)</label>
            <input
              type="text"
              value={formData.memo}
              onChange={(e) => setFormData({...formData, memo: e.target.value})}
              placeholder="Additional notes"
              style={styles.input}
            />
          </div>

          {/* Balance Preview */}
          {fromAccount && toAccount && formData.amount && (
            <div style={styles.previewContainer}>
              <h4 style={styles.previewTitle}>After Transfer</h4>
              <div style={styles.previewRow}>
                <span>{fromAccount.name}</span>
                <span style={{
                  color: (fromAccount.balance - parseFloat(formData.amount)) < 0 ? '#F87171' : '#4ADE80'
                }}>
                  {formatCurrency(fromAccount.balance - parseFloat(formData.amount))}
                </span>
              </div>
              <div style={styles.previewRow}>
                <span>{toAccount.name}</span>
                <span style={{ color: '#4ADE80' }}>
                  {formatCurrency(toAccount.balance + parseFloat(formData.amount))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={styles.actions}>
          <button
            onClick={onClose}
            style={styles.cancelButton}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={styles.transferButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
};

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
    animation: 'fadeIn 0.2s ease-out',
  },
  modal: {
    width: '100%',
    maxWidth: '500px',
    backgroundColor: '#1F2937',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '24px',
    paddingBottom: '40px',
    animation: 'slideUp 0.3s ease-out',
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorMessage: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #EF4444',
    color: '#EF4444',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
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
    fontWeight: '500',
  },
  select: {
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '16px',
    outline: 'none',
    cursor: 'pointer',
  },
  amountInput: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  currencySymbol: {
    position: 'absolute',
    left: '14px',
    fontSize: '18px',
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
    fontWeight: '600',
    outline: 'none',
  },
  input: {
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '16px',
    outline: 'none',
  },
  previewContainer: {
    background: '#0A2472',
    padding: '16px',
    borderRadius: '12px',
    marginTop: '8px',
  },
  previewTitle: {
    fontSize: '14px',
    fontWeight: '600',
    margin: '0 0 12px 0',
    color: 'white',
  },
  previewRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '14px',
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
    fontWeight: '500',
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
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
  },
};