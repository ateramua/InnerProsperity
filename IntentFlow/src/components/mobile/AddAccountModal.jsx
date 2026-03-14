// src/components/mobile/AddAccountModal.jsx
import React, { useState } from 'react';

export default function AddAccountModal({ isVisible, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'checking',
    balance: '',
    institution: '',
    currency: 'USD',
    creditLimit: '',
    interestRate: '',
    dueDate: '',
    minimumPayment: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const accountTypes = [
    { value: 'checking', label: 'Checking', icon: '🏦' },
    { value: 'savings', label: 'Savings', icon: '💰' },
    { value: 'credit', label: 'Credit Card', icon: '💳' },
    { value: 'investment', label: 'Investment', icon: '📈' },
    { value: 'loan', label: 'Loan', icon: '🏦' },
    { value: 'cash', label: 'Cash', icon: '💵' }
  ];

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('Account name is required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const accountData = {
        name: formData.name,
        type: formData.type,
        balance: formData.type === 'credit' 
          ? -Math.abs(parseFloat(formData.balance) || 0)
          : Math.abs(parseFloat(formData.balance) || 0),
        institution: formData.institution,
        currency: formData.currency,
        ...(formData.type === 'credit' && {
          creditLimit: parseFloat(formData.creditLimit) || 0,
          interestRate: parseFloat(formData.interestRate) || 0,
          dueDate: formData.dueDate,
          minimumPayment: parseFloat(formData.minimumPayment) || 0
        })
      };

      await onSave(accountData);
      onClose();
      resetForm();
    } catch (err) {
      console.error('Error creating account:', err);
      setError('Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'checking',
      balance: '',
      institution: '',
      currency: 'USD',
      creditLimit: '',
      interestRate: '',
      dueDate: '',
      minimumPayment: ''
    });
  };

  if (!isVisible) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.title}>➕ Add Account</h3>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        {error && <div style={styles.errorMessage}>{error}</div>}

        {/* Form */}
        <div style={styles.form}>
          {/* Account Name */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Account Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., Chase Checking"
              style={styles.input}
              autoFocus
            />
          </div>

          {/* Account Type */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Account Type</label>
            <div style={styles.typeGrid}>
              {accountTypes.map(type => (
                <button
                  key={type.value}
                  style={{
                    ...styles.typeButton,
                    ...(formData.type === type.value ? styles.typeButtonActive : {})
                  }}
                  onClick={() => setFormData({...formData, type: type.value})}
                >
                  <span>{type.icon}</span>
                  <span style={styles.typeLabel}>{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Institution */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Institution</label>
            <input
              type="text"
              value={formData.institution}
              onChange={(e) => setFormData({...formData, institution: e.target.value})}
              placeholder="e.g., Chase, Bank of America"
              style={styles.input}
            />
          </div>

          {/* Balance */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>
              {formData.type === 'credit' ? 'Current Balance (negative)' : 'Current Balance'}
            </label>
            <div style={styles.amountInput}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                value={formData.balance}
                onChange={(e) => setFormData({...formData, balance: e.target.value})}
                placeholder="0.00"
                step="0.01"
                style={styles.amountField}
              />
            </div>
          </div>

          {/* Credit Card Specific Fields */}
          {formData.type === 'credit' && (
            <>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Credit Limit</label>
                <div style={styles.amountInput}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    value={formData.creditLimit}
                    onChange={(e) => setFormData({...formData, creditLimit: e.target.value})}
                    placeholder="5000"
                    step="100"
                    style={styles.amountField}
                  />
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Interest Rate (APR %)</label>
                <input
                  type="number"
                  value={formData.interestRate}
                  onChange={(e) => setFormData({...formData, interestRate: e.target.value})}
                  placeholder="18.99"
                  step="0.01"
                  style={styles.input}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Due Date</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                  style={styles.input}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Minimum Payment</label>
                <div style={styles.amountInput}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    value={formData.minimumPayment}
                    onChange={(e) => setFormData({...formData, minimumPayment: e.target.value})}
                    placeholder="25"
                    step="0.01"
                    style={styles.amountField}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button onClick={onClose} style={styles.cancelButton}>Cancel</button>
          <button onClick={handleSubmit} style={styles.saveButton} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Add Account'}
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
  input: {
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '16px',
    outline: 'none',
  },
  typeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  typeButton: {
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: '#111827',
    color: '#9CA3AF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  },
  typeButtonActive: {
    background: '#3B82F6',
    color: 'white',
    borderColor: '#3B82F6',
  },
  typeLabel: {
    fontSize: '11px',
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
    fontSize: '16px',
    outline: 'none',
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
  },
};