// src/components/mobile/AddTransactionModal.jsx
import React, { useState, useEffect } from 'react';

export default function AddTransactionModal({ isVisible, onClose, onSave, accounts, categories }) {
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    category: '',
    account: '',
    date: new Date().toISOString().split('T')[0],
    type: 'expense', // 'expense' or 'income'
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isVisible) {
      setFormData({
        amount: '',
        description: '',
        category: '',
        account: accounts[0]?.id || '',
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        notes: ''
      });
    }
  }, [isVisible, accounts]);

  const handleSubmit = async () => {
    if (!formData.amount || !formData.description || !formData.account) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const transactionData = {
        amount: formData.type === 'expense' ? -Math.abs(parseFloat(formData.amount)) : Math.abs(parseFloat(formData.amount)),
        description: formData.description,
        categoryId: formData.category || null,
        accountId: formData.account,
        date: formData.date,
        memo: formData.notes,
        cleared: true
      };

      await onSave(transactionData);
      onClose();
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('Failed to add transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.title}>Add Transaction</h3>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        {/* Type Selector */}
        <div style={styles.typeSelector}>
          <button
            style={{
              ...styles.typeButton,
              ...(formData.type === 'expense' ? styles.activeExpense : {})
            }}
            onClick={() => setFormData({...formData, type: 'expense'})}
          >
            💸 Expense
          </button>
          <button
            style={{
              ...styles.typeButton,
              ...(formData.type === 'income' ? styles.activeIncome : {})
            }}
            onClick={() => setFormData({...formData, type: 'income'})}
          >
            💰 Income
          </button>
        </div>

        {/* Form */}
        <div style={styles.form}>
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

          {/* Description */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Description *</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="e.g., Grocery store, Paycheck"
              style={styles.input}
            />
          </div>

          {/* Category */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
              style={styles.select}
            >
              <option value="">Select a category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Account */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Account *</label>
            <select
              value={formData.account}
              onChange={(e) => setFormData({...formData, account: e.target.value})}
              style={styles.select}
            >
              <option value="">Select an account</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} (${acc.balance?.toFixed(2)})
                </option>
              ))}
            </select>
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

          {/* Notes */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Additional details..."
              style={styles.textarea}
              rows="3"
            />
          </div>
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
            style={styles.saveButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Add Transaction'}
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
  typeSelector: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
  },
  typeButton: {
    flex: 1,
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid #374151',
    background: 'transparent',
    color: 'white',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  activeExpense: {
    background: '#EF4444',
    borderColor: '#EF4444',
  },
  activeIncome: {
    background: '#10B981',
    borderColor: '#10B981',
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
  input: {
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '16px',
    outline: 'none',
    transition: 'border-color 0.2s',
    ':focus': {
      borderColor: '#3B82F6',
    },
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
  textarea: {
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '16px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
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
  saveButton: {
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