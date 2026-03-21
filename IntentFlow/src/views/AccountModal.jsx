// src/views/AccountModal.jsx
import React, { useState, useEffect } from 'react';

const AccountModal = ({ isOpen, onClose, onSave, onDelete, account, mode = 'add', defaultType = 'checking' }) => {
  const [formData, setFormData] = useState({
    // Common fields
    name: '',
    institution: '',
    balance: '',
    type: account?.type || 'checking', // default type for add mode
    // Credit card specific
    creditLimit: '',
    apr: '',
    dueDate: '',
    cardHolderName: '',
    accountNumber: '',
    // Loan specific
    originalBalance: '',
    interestRate: '',
    term: '',
    monthlyPayment: '',
    nextPaymentDate: '',
    // Notes (shared)
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load data when editing
  useEffect(() => {
    if (account && isOpen) {
      setFormData({
        name: account.name || '',
        institution: account.institution || '',
        balance: Math.abs(account.balance || 0).toString(),
        type: account.type || defaultType,
        creditLimit: account.credit_limit || account.limit || '',
        apr: account.interest_rate || account.apr || '',
        dueDate: account.due_date || account.dueDate || '',
        cardHolderName: account.cardHolderName || '',
        accountNumber: account.accountNumber || '',
        originalBalance: account.original_balance || '',
        interestRate: account.interest_rate || '',
        term: account.term_months || '',
        monthlyPayment: account.payment_amount || '',
        nextPaymentDate: account.next_payment_date || account.due_date || '',
        notes: account.notes || ''
      });
    } else if (mode === 'add' && isOpen) {
      // Reset form for add mode
      setFormData({
        name: '',
        institution: '',
        balance: '',
        type: defaultType,
        creditLimit: '',
        apr: '',
        dueDate: '',
        cardHolderName: '',
        accountNumber: '',
        originalBalance: '',
        interestRate: '',
        term: '',
        monthlyPayment: '',
        nextPaymentDate: '',
        notes: ''
      });
    }
  }, [account, isOpen, mode, defaultType]);

  if (!isOpen) return null;

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) newErrors.name = 'Name is required';

    if (formData.type === 'credit') {
      if (!formData.creditLimit) newErrors.creditLimit = 'Credit limit is required';
      if (!formData.dueDate) newErrors.dueDate = 'Due date is required';
    } else if (formData.type === 'loan') {
      if (!formData.originalBalance) newErrors.originalBalance = 'Original balance is required';
      if (!formData.interestRate) newErrors.interestRate = 'Interest rate is required';
      if (!formData.term) newErrors.term = 'Loan term is required';
      if (!formData.monthlyPayment) newErrors.monthlyPayment = 'Monthly payment is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      // Base data for all types
      const data = {
        name: formData.name.trim(),
        institution: formData.institution.trim() || null,
        balance: formData.balance ? parseFloat(formData.balance) : 0,
        type: formData.type,
        notes: formData.notes.trim() || null
      };

      // Type-specific fields
      if (formData.type === 'credit') {
        data.credit_limit = parseFloat(formData.creditLimit);
        data.interest_rate = formData.apr ? parseFloat(formData.apr) : null;
        data.due_date = formData.dueDate || null;
        data.cardHolderName = formData.cardHolderName.trim() || null;
        data.accountNumber = formData.accountNumber.replace(/\s/g, '') || null;
      } else if (formData.type === 'loan') {
        data.original_balance = parseFloat(formData.originalBalance);
        data.interest_rate = formData.interestRate ? parseFloat(formData.interestRate) : null; // safe parsing
        data.term_months = parseInt(formData.term, 10);
        data.payment_amount = parseFloat(formData.monthlyPayment);
        data.next_payment_date = formData.nextPaymentDate || null;
        data.due_date = formData.nextPaymentDate || null; // for compatibility
      }

      await onSave(data, account?.id);
      // 🔥 Notify other components that accounts have been updated
      window.dispatchEvent(new CustomEvent('accounts-updated'));
      onClose();
    } catch (error) {
      console.error('Error saving account:', error);
      alert('Failed to save account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const formatAccountNumber = (value) => {
    const digits = value.replace(/\D/g, '');
    const limited = digits.slice(0, 16);
    const groups = limited.match(/.{1,4}/g);
    return groups ? groups.join(' ') : limited;
  };

  const accountTypes = [
    { value: 'checking', label: 'Checking' },
    { value: 'savings', label: 'Savings' },
    { value: 'credit', label: 'Credit Card' },
    { value: 'loan', label: 'Loan' }
  ];

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {mode === 'add' ? 'Add' : 'Edit'} Account
          </h2>
          <button onClick={onClose} style={styles.closeButton}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Account Type (only in add mode) */}
          {mode === 'add' && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Account Type</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                style={styles.input}
              >
                {accountTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Common Fields */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Account Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              style={{ ...styles.input, ...(errors.name && styles.inputError) }}
            />
            {errors.name && <div style={styles.fieldError}>{errors.name}</div>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Institution</label>
            <input
              type="text"
              name="institution"
              value={formData.institution}
              onChange={handleChange}
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Current Balance</label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                name="balance"
                value={formData.balance}
                onChange={handleChange}
                step="0.01"
                style={styles.inputWithSymbol}
              />
            </div>
          </div>

          {/* Credit Card Fields */}
          {formData.type === 'credit' && (
            <>
              <div style={styles.row}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Credit Limit *</label>
                  <div style={styles.inputWrapper}>
                    <span style={styles.currencySymbol}>$</span>
                    <input
                      type="number"
                      name="creditLimit"
                      value={formData.creditLimit}
                      onChange={handleChange}
                      style={{ ...styles.inputWithSymbol, ...(errors.creditLimit && styles.inputError) }}
                    />
                  </div>
                  {errors.creditLimit && <div style={styles.fieldError}>{errors.creditLimit}</div>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>APR (%)</label>
                  <input
                    type="number"
                    name="apr"
                    value={formData.apr}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    max="100"
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.row}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Due Date *</label>
                  <input
                    type="date"
                    name="dueDate"
                    value={formData.dueDate}
                    onChange={handleChange}
                    style={{ ...styles.input, ...(errors.dueDate && styles.inputError) }}
                  />
                  {errors.dueDate && <div style={styles.fieldError}>{errors.dueDate}</div>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Card Holder</label>
                  <input
                    type="text"
                    name="cardHolderName"
                    value={formData.cardHolderName}
                    onChange={handleChange}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Account Number</label>
                <input
                  type="text"
                  name="accountNumber"
                  value={formData.accountNumber}
                  onChange={(e) => {
                    const formatted = formatAccountNumber(e.target.value);
                    setFormData(prev => ({ ...prev, accountNumber: formatted }));
                  }}
                  maxLength="19"
                  style={styles.input}
                />
              </div>
            </>
          )}

          {/* Loan Fields */}
          {formData.type === 'loan' && (
            <>
              <div style={styles.row}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Original Balance *</label>
                  <div style={styles.inputWrapper}>
                    <span style={styles.currencySymbol}>$</span>
                    <input
                      type="number"
                      name="originalBalance"
                      value={formData.originalBalance}
                      onChange={handleChange}
                      style={{ ...styles.inputWithSymbol, ...(errors.originalBalance && styles.inputError) }}
                    />
                  </div>
                  {errors.originalBalance && <div style={styles.fieldError}>{errors.originalBalance}</div>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Interest Rate (%) *</label>
                  <input
                    type="number"
                    name="interestRate"
                    value={formData.interestRate}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    style={{ ...styles.input, ...(errors.interestRate && styles.inputError) }}
                  />
                  {errors.interestRate && <div style={styles.fieldError}>{errors.interestRate}</div>}
                </div>
              </div>

              <div style={styles.row}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Term (months) *</label>
                  <input
                    type="number"
                    name="term"
                    value={formData.term}
                    onChange={handleChange}
                    min="1"
                    style={{ ...styles.input, ...(errors.term && styles.inputError) }}
                  />
                  {errors.term && <div style={styles.fieldError}>{errors.term}</div>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Monthly Payment *</label>
                  <div style={styles.inputWrapper}>
                    <span style={styles.currencySymbol}>$</span>
                    <input
                      type="number"
                      name="monthlyPayment"
                      value={formData.monthlyPayment}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      style={{ ...styles.inputWithSymbol, ...(errors.monthlyPayment && styles.inputError) }}
                    />
                  </div>
                  {errors.monthlyPayment && <div style={styles.fieldError}>{errors.monthlyPayment}</div>}
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Next Payment Date</label>
                <input
                  type="date"
                  name="nextPaymentDate"
                  value={formData.nextPaymentDate}
                  onChange={handleChange}
                  style={styles.input}
                />
              </div>
            </>
          )}

          {/* Notes (for all types) */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              style={styles.textarea}
            />
          </div>

          {/* Modal Actions with Delete Button */}
          <div style={styles.modalActions}>
            {mode === 'edit' && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(account)}
                style={styles.deleteButton}
                disabled={isSubmitting}
              >
                🗑️ Delete Account
              </button>
            )}
            <div style={styles.actionButtonsGroup}>
              <button type="button" onClick={onClose} style={styles.cancelButton} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" style={styles.saveButton} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : mode === 'add' ? 'Add Account' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: '#1F2937',
    borderRadius: '1rem',
    padding: '2rem',
    width: '90%',
    maxWidth: '600px',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem'
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white',
    margin: 0
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '2rem',
    cursor: 'pointer'
  },
  formGroup: {
    marginBottom: '1.5rem',
    flex: 1
  },
  row: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '0.5rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  inputError: {
    borderColor: '#EF4444'
  },
  fieldError: {
    color: '#EF4444',
    fontSize: '0.75rem',
    marginTop: '0.25rem'
  },
  inputWrapper: {
    position: 'relative'
  },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF'
  },
  inputWithSymbol: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '2rem'
  },
  actionButtonsGroup: {
    display: 'flex',
    gap: '1rem'
  },
  deleteButton: {
    padding: '0.75rem 1rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  saveButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  cancelButton: {
    padding: '0.75rem 1.5rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    cursor: 'pointer'
  }
};

export default AccountModal;