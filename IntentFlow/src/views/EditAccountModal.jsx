// src/views/EditAccountModal.jsx
import React, { useState, useEffect } from 'react';

const EditAccountModal = ({ isOpen, onClose, onSave, onDelete, account, mode = 'edit' }) => {
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    balance: '',
    credit_limit: '',
    interest_rate: '',
    due_date: '',
    institution: '',
    account_number: '',
    account_holder_name: '',
    notes: '',
    // Loan-specific fields
    original_balance: '',
    term_months: '',
    monthly_payment: '',
    loan_type: ''
  });

  // For displaying masked account number
  const [displayAccountNumber, setDisplayAccountNumber] = useState('');
  const [isEditingAccountNumber, setIsEditingAccountNumber] = useState(false);

  // Helper function to mask account number safely
  const maskAccountNumber = (number) => {
    if (!number || number.length === 0) return '';
    if (number.length <= 4) return number;
    
    const asterisksCount = Math.max(0, number.length - 4);
    const asterisks = '•'.repeat(Math.min(asterisksCount, 12));
    return asterisks + number.slice(-4);
  };

  useEffect(() => {
    console.log('🔍 EditAccountModal - account prop:', account);
    console.log('🔍 EditAccountModal - account type:', account?.type);
    
    if (account && isOpen) {
      // For new accounts (id === 'new'), set default values
      if (account.id === 'new') {
        const isLoan = account.type === 'loan';
        setFormData({
          name: account.name || '',
          type: account.type || 'credit',
          balance: '',
          credit_limit: account.credit_limit || account.limit || '',
          interest_rate: account.interest_rate || account.apr || '',
          due_date: account.due_date || account.dueDate || '',
          institution: account.institution || '',
          account_number: '',
          account_holder_name: account.account_holder_name || '',
          notes: account.notes || '',
          // Loan-specific defaults
          original_balance: '',
          term_months: '',
          monthly_payment: '',
          loan_type: account.loan_type || 'personal'
        });
        setDisplayAccountNumber('');
        setIsEditingAccountNumber(true);
      } else {
        // For existing accounts
        const isLoan = account.type === 'loan';
        const fullNumber = account.account_number || '';
        const balanceValue = account.balance !== undefined && account.balance !== null 
          ? Math.abs(account.balance).toString() 
          : '';
        
        setFormData({
          name: account.name || '',
          type: account.type || 'credit',
          balance: balanceValue,
          credit_limit: account.credit_limit || account.limit || '',
          interest_rate: account.interest_rate || account.apr || '',
          due_date: account.due_date || account.dueDate || '',
          institution: account.institution || '',
          account_number: fullNumber,
          account_holder_name: account.account_holder_name || '',
          notes: account.notes || '',
          // Loan-specific fields
          original_balance: account.original_balance ? Math.abs(account.original_balance).toString() : '',
          term_months: account.term_months || '',
          monthly_payment: account.monthly_payment || account.payment_amount || '',
          loan_type: account.loan_type || account.type || 'personal'
        });
        
        // Mask the account number for display
        setDisplayAccountNumber(maskAccountNumber(fullNumber));
        setIsEditingAccountNumber(false);
      }
    }
  }, [account, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle account number change with masking
  const handleAccountNumberChange = (e) => {
    let value = e.target.value;
    
    // Remove any non-digit characters
    value = value.replace(/\D/g, '');
    
    // Limit to 16 digits
    if (value.length > 16) {
      value = value.slice(0, 16);
    }
    
    setFormData(prev => ({ ...prev, account_number: value }));
    
    // Update masked display while typing
    setDisplayAccountNumber(maskAccountNumber(value));
  };

  // Toggle edit mode for account number
  const handleEditAccountNumberClick = () => {
    setIsEditingAccountNumber(true);
    setDisplayAccountNumber('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Prepare data for save based on account type
    const isLoan = formData.type === 'loan';
    
   const saveData = {
  name: formData.name,
  type: formData.type,
  balance: formData.balance === '' ? 0 : parseFloat(formData.balance),
  credit_limit: formData.credit_limit === '' ? null : parseFloat(formData.credit_limit),
  interest_rate: formData.interest_rate === '' ? null : parseFloat(formData.interest_rate),
  due_date: formData.due_date || null,
  institution: formData.institution || null,
  account_number: formData.account_number,        // ← Must be included
  account_holder_name: formData.account_holder_name || null, // ← Must be included
  notes: formData.notes || null,
  // Loan-specific fields
  ...(formData.type === 'loan' && {
    original_balance: formData.original_balance === '' ? null : parseFloat(formData.original_balance),
    term_months: formData.term_months === '' ? null : parseInt(formData.term_months),
    monthly_payment: formData.monthly_payment === '' ? null : parseFloat(formData.monthly_payment),
    loan_type: formData.loan_type
  })
};
    
    console.log('📤 Submitting save data:', saveData);
    console.log('📤 Account number being saved:', saveData.account_number);
    console.log('📤 Is loan:', isLoan);
    
    const accountId = account?.id === 'new' ? 'new' : account?.id;
    await onSave(accountId, saveData);
  };

  const handleDelete = () => {
    if (onDelete && account?.id !== 'new') {
      onDelete(account.id);
    }
  };

  if (!isOpen) return null;

  const isNewCard = account?.id === 'new';
  const isLoan = formData.type === 'loan';
  const title = isNewCard 
    ? (isLoan ? 'Add New Loan' : 'Add Credit Card')
    : (isLoan ? 'Edit Loan' : 'Edit Credit Card');

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>{title}</h2>
        
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Account Name <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              style={styles.input}
              placeholder={isLoan ? "e.g., Auto Loan, Student Loan" : "e.g., Chase Sapphire"}
              required
            />
          </div>

          {/* Account Type - Hidden but preserved */}
          <input type="hidden" name="type" value={formData.type} />

          {/* Balance Field */}
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Current Balance <span style={styles.required}>*</span>
            </label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                name="balance"
                value={formData.balance}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setFormData({ ...formData, balance: '' });
                  } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                      setFormData({ ...formData, balance: numValue });
                    }
                  }
                }}
                onBlur={() => {
                  if (formData.balance === '' || formData.balance === null) {
                    setFormData({ ...formData, balance: '' });
                  }
                }}
                style={styles.modalInput}
                step="0.01"
                placeholder="0.00"
              />
            </div>
            <small style={styles.hint}>
              {isLoan ? 'Enter the remaining loan balance' : 'Enter the current amount owed (positive number)'}
            </small>
          </div>

          {/* Loan-specific fields */}
          {isLoan && (
            <>
              <div style={styles.formGroup}>
                <label style={styles.label}>Original Loan Amount</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    name="original_balance"
                    value={formData.original_balance}
                    onChange={handleChange}
                    style={styles.modalInput}
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <small style={styles.hint}>Original amount borrowed</small>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Loan Type</label>
                <select
                  name="loan_type"
                  value={formData.loan_type}
                  onChange={handleChange}
                  style={styles.select}
                >
                  <option value="personal">Personal Loan</option>
                  <option value="auto">Auto Loan</option>
                  <option value="student">Student Loan</option>
                  <option value="mortgage">Mortgage</option>
                  <option value="business">Business Loan</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Monthly Payment</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    name="monthly_payment"
                    value={formData.monthly_payment}
                    onChange={handleChange}
                    style={styles.modalInput}
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Loan Term (months)</label>
                <input
                  type="number"
                  name="term_months"
                  value={formData.term_months}
                  onChange={handleChange}
                  style={styles.input}
                  step="1"
                  placeholder="e.g., 60 for 5 years"
                />
              </div>
            </>
          )}

          {/* Credit Card specific fields */}
          {!isLoan && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Credit Limit</label>
              <div style={styles.inputWrapper}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  name="credit_limit"
                  value={formData.credit_limit}
                  onChange={handleChange}
                  style={styles.modalInput}
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
            </div>
          )}

          {/* Common fields for both */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Interest Rate (APR %)</label>
            <input
              type="number"
              name="interest_rate"
              value={formData.interest_rate}
              onChange={handleChange}
              style={styles.input}
              step="0.01"
              placeholder={isLoan ? "e.g., 5.99" : "e.g., 18.99"}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Due Date</label>
            <input
              type="date"
              name="due_date"
              value={formData.due_date}
              onChange={handleChange}
              style={styles.input}
            />
            <small style={styles.hint}>
              {isLoan ? 'Monthly payment due date' : 'Credit card statement due date'}
            </small>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Institution / Lender</label>
            <input
              type="text"
              name="institution"
              value={formData.institution}
              onChange={handleChange}
              style={styles.input}
              placeholder={isLoan ? "e.g., Wells Fargo, Sallie Mae" : "e.g., Chase Bank"}
            />
          </div>

          {/* Account Number Field - Same for both */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Account Number</label>
            {!isEditingAccountNumber && displayAccountNumber && !isNewCard ? (
              <div style={styles.maskedDisplay}>
                <span style={styles.maskedValue}>{displayAccountNumber}</span>
                <button 
                  type="button"
                  onClick={handleEditAccountNumberClick}
                  style={styles.editMaskedButton}
                >
                  Edit
                </button>
              </div>
            ) : (
              <div style={styles.inputWrapper}>
                <input
                  type="text"
                  name="account_number"
                  value={isEditingAccountNumber || isNewCard ? formData.account_number : displayAccountNumber}
                  onChange={handleAccountNumberChange}
                  style={styles.accountNumberInput}
                  placeholder="Enter up to 16 digits"
                  maxLength="16"
                  autoFocus={isNewCard}
                />
              </div>
            )}
            <small style={styles.hint}>
              Enter full account number (up to 16 digits). Only the last 4 digits will be visible after saving.
            </small>
            {formData.account_number && formData.account_number.length > 0 && (
              <div style={styles.maskedPreview}>
                <span style={styles.maskedLabel}>Will be stored as:</span>
                <span style={styles.maskedValue}>
                  {maskAccountNumber(formData.account_number)}
                </span>
              </div>
            )}
          </div>

          {/* Account Holder Name - Same for both */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Account Holder Name</label>
            <input
              type="text"
              name="account_holder_name"
              value={formData.account_holder_name}
              onChange={handleChange}
              style={styles.input}
              placeholder="Name on the account"
            />
            {formData.account_holder_name && (
              <div style={styles.holderPreview}>
                <span style={styles.maskedLabel}>Holder:</span>
                <span style={styles.holderValue}>{formData.account_holder_name}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              style={styles.textarea}
              rows="3"
              placeholder="Add any additional notes about this account..."
            />
          </div>

          <div style={styles.modalActions}>
            <button type="submit" style={styles.saveButton}>
              {isNewCard ? (isLoan ? 'Create Loan' : 'Create Card') : 'Save Changes'}
            </button>
            {!isNewCard && onDelete && (
              <button type="button" onClick={handleDelete} style={styles.deleteButton}>
                Delete {isLoan ? 'Loan' : 'Card'}
              </button>
            )}
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Cancel
            </button>
          </div>
        </form>
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
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: '#1F2937',
    padding: '2rem',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '550px',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: 'white'
  },
  formGroup: {
    marginBottom: '1rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  },
  required: {
    color: '#EF4444',
    marginLeft: '0.25rem'
  },
  hint: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: '#6B7280'
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
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  accountNumberInput: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    fontFamily: 'monospace',
    letterSpacing: '0.5px'
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  inputWrapper: {
    position: 'relative'
  },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF',
    zIndex: 1
  },
  modalInput: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  maskedDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#111827',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid #374151'
  },
  maskedValue: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '1rem',
    letterSpacing: '1px',
    color: '#4ADE80',
    fontWeight: '600'
  },
  editMaskedButton: {
    padding: '0.25rem 0.75rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    ':hover': {
      background: '#2563EB'
    }
  },
  maskedPreview: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    background: '#111827',
    borderRadius: '0.375rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    border: '1px solid #374151'
  },
  holderPreview: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    background: '#111827',
    borderRadius: '0.375rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    border: '1px solid #374151'
  },
  maskedLabel: {
    color: '#9CA3AF',
    fontWeight: '500'
  },
  holderValue: {
    color: '#60A5FA',
    fontWeight: '500'
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem'
  },
  saveButton: {
    flex: 1,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  deleteButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  }
};

export default EditAccountModal;