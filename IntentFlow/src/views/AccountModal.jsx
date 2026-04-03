// src/views/AccountModal.jsx
import React, { useState, useEffect } from 'react';

const AccountModal = ({ isOpen, onClose, onSave, onDelete, account, mode = 'add', defaultType = 'checking' }) => {
  const [formData, setFormData] = useState({
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
    debitCardNumber: '',
    routingNumber: '',
    dailyWithdrawalLimit: '',
    overdraftProtection: false,
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        accountNumber: account.account_number || '',
        originalBalance: account.original_balance || '',
        interestRate: account.interest_rate || '',
        term: account.term_months || '',
        monthlyPayment: account.payment_amount || '',
        nextPaymentDate: account.next_payment_date || account.due_date || '',
        debitCardNumber: account.debit_card_number || '',
        routingNumber: account.routing_number || '',
        dailyWithdrawalLimit: account.daily_withdrawal_limit || '',
        overdraftProtection: account.overdraft_protection || false,
        notes: account.notes || ''
      });
    } else if (mode === 'add' && isOpen) {
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
        debitCardNumber: '',
        routingNumber: '',
        dailyWithdrawalLimit: '',
        overdraftProtection: false,
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
    } else if (formData.type === 'checking' || formData.type === 'savings') {
      if (!formData.accountNumber) newErrors.accountNumber = 'Account number is required';
      if (!formData.routingNumber) newErrors.routingNumber = 'Routing number is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      const data = {
        name: formData.name.trim(),
        institution: formData.institution.trim() || null,
        balance: formData.balance ? parseFloat(formData.balance) : 0,
        type: formData.type,
        notes: formData.notes.trim() || null
      };
      if (formData.type === 'credit') {
        data.credit_limit = parseFloat(formData.creditLimit);
        data.interest_rate = formData.apr ? parseFloat(formData.apr) : null;
        data.due_date = formData.dueDate || null;
        data.cardHolderName = formData.cardHolderName.trim() || null;
        data.account_number = formData.accountNumber.replace(/\s/g, '') || null;
      } else if (formData.type === 'loan') {
        data.original_balance = parseFloat(formData.originalBalance);
        data.interest_rate = formData.interestRate ? parseFloat(formData.interestRate) : null;
        data.term_months = parseInt(formData.term, 10);
        data.payment_amount = parseFloat(formData.monthlyPayment);
        data.next_payment_date = formData.nextPaymentDate || null;
        data.due_date = formData.nextPaymentDate || null;
        data.account_number = formData.accountNumber.replace(/\s/g, '') || null;
      } else if (formData.type === 'checking' || formData.type === 'savings') {
        data.account_number = formData.accountNumber.replace(/\s/g, '') || null;
        data.routing_number = formData.routingNumber.replace(/\s/g, '') || null;
        data.debit_card_number = formData.debitCardNumber.replace(/\s/g, '') || null;
        data.daily_withdrawal_limit = formData.dailyWithdrawalLimit ? parseFloat(formData.dailyWithdrawalLimit) : null;
        data.overdraft_protection = formData.overdraftProtection;
        data.interest_rate = formData.apr ? parseFloat(formData.apr) : null;
      }
      await onSave(data, account?.id);
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
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const formatAccountNumber = (value) => {
    const digits = value.replace(/\D/g, '');
    const limited = digits.slice(0, 16);
    const groups = limited.match(/.{1,4}/g);
    return groups ? groups.join(' ') : limited;
  };

  const formatRoutingNumber = (value) => {
    const digits = value.replace(/\D/g, '');
    return digits.slice(0, 9);
  };

  const maskNumber = (number) => {
    if (!number || number.length === 0) return '';
    if (number.length <= 4) return number;
    const asterisks = '•'.repeat(Math.min(number.length - 4, 12));
    return asterisks + number.slice(-4);
  };

  const accountTypes = [
    { value: 'checking', label: '🏦 Checking Account' },
    { value: 'savings', label: '🏦 Savings Account' },
    { value: 'credit', label: '💳 Credit Card' },
    { value: 'loan', label: '📉 Loan' }
  ];

  const showBankAccountFields = formData.type === 'checking' || formData.type === 'savings';

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
          {/* Account Type Selector - NOW ALWAYS VISIBLE */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Account Type <span style={styles.required}>*</span></label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              style={styles.select}
              required
            >
              {accountTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Common Fields */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Account Name <span style={styles.required}>*</span></label>
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
            <label style={styles.label}>Institution / Bank</label>
            <input
              type="text"
              name="institution"
              value={formData.institution}
              onChange={handleChange}
              style={styles.input}
              placeholder="e.g., Chase Bank, Bank of America"
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
                placeholder="0.00"
              />
            </div>
          </div>

          {/* CHECKING & SAVINGS FIELDS - These WILL appear when selected */}
          {showBankAccountFields && (
            <>
              <div style={styles.sectionDivider}>
                <span style={styles.sectionTitle}>Bank Account Details</span>
              </div>

              {/* Account Number Field */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Account Number <span style={styles.required}>*</span></label>
                <input
                  type="text"
                  name="accountNumber"
                  value={formData.accountNumber}
                  onChange={(e) => {
                    const formatted = formatAccountNumber(e.target.value);
                    setFormData(prev => ({ ...prev, accountNumber: formatted }));
                  }}
                  maxLength="19"
                  style={{ ...styles.input, ...(errors.accountNumber && styles.inputError) }}
                  placeholder="Enter account number (up to 16 digits)"
                />
                {errors.accountNumber && <div style={styles.fieldError}>{errors.accountNumber}</div>}
                {formData.accountNumber && (
                  <small style={styles.hint}>Stored as: {maskNumber(formData.accountNumber.replace(/\s/g, ''))}</small>
                )}
              </div>

              {/* Routing Number Field */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Routing Number <span style={styles.required}>*</span></label>
                <input
                  type="text"
                  name="routingNumber"
                  value={formData.routingNumber}
                  onChange={(e) => {
                    const formatted = formatRoutingNumber(e.target.value);
                    setFormData(prev => ({ ...prev, routingNumber: formatted }));
                  }}
                  maxLength="9"
                  style={{ ...styles.input, ...(errors.routingNumber && styles.inputError) }}
                  placeholder="9-digit routing number"
                />
                {errors.routingNumber && <div style={styles.fieldError}>{errors.routingNumber}</div>}
                {formData.routingNumber && (
                  <small style={styles.hint}>Stored as: {maskNumber(formData.routingNumber)}</small>
                )}
              </div>

              {/* Debit Card Field */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Debit Card Number (Optional)</label>
                <input
                  type="text"
                  name="debitCardNumber"
                  value={formData.debitCardNumber}
                  onChange={(e) => {
                    const formatted = formatAccountNumber(e.target.value);
                    setFormData(prev => ({ ...prev, debitCardNumber: formatted }));
                  }}
                  maxLength="19"
                  style={styles.input}
                  placeholder="Enter debit card number (up to 16 digits)"
                />
                {formData.debitCardNumber && (
                  <small style={styles.hint}>Stored as: {maskNumber(formData.debitCardNumber.replace(/\s/g, ''))}</small>
                )}
              </div>

              {/* Daily Withdrawal Limit */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Daily Withdrawal Limit</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    name="dailyWithdrawalLimit"
                    value={formData.dailyWithdrawalLimit}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    style={styles.inputWithSymbol}
                    placeholder="0.00"
                  />
                </div>
                <small style={styles.hint}>Maximum amount you can withdraw per day</small>
              </div>

              {/* Overdraft Protection */}
              <div style={styles.formGroup}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    name="overdraftProtection"
                    checked={formData.overdraftProtection}
                    onChange={handleChange}
                    style={styles.checkbox}
                  />
                  Enable Overdraft Protection
                </label>
              </div>

              {/* Interest Rate for Savings/Checking */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Interest Rate (APY %)</label>
                <input
                  type="number"
                  name="apr"
                  value={formData.apr}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  max="100"
                  style={styles.input}
                  placeholder="e.g., 0.50"
                />
                <small style={styles.hint}>Annual Percentage Yield for this account</small>
              </div>
            </>
          )}

          {/* Credit Card Fields */}
          {formData.type === 'credit' && (
            <>
              <div style={styles.sectionDivider}>
                <span style={styles.sectionTitle}>Credit Card Details</span>
              </div>
              <div style={styles.row}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Credit Limit <span style={styles.required}>*</span></label>
                  <div style={styles.inputWrapper}>
                    <span style={styles.currencySymbol}>$</span>
                    <input
                      type="number"
                      name="creditLimit"
                      value={formData.creditLimit}
                      onChange={handleChange}
                      style={styles.inputWithSymbol}
                      placeholder="0.00"
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
                    style={styles.input}
                    placeholder="e.g., 18.99"
                  />
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Due Date <span style={styles.required}>*</span></label>
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleChange}
                  style={styles.input}
                />
                {errors.dueDate && <div style={styles.fieldError}>{errors.dueDate}</div>}
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Card Holder Name</label>
                <input
                  type="text"
                  name="cardHolderName"
                  value={formData.cardHolderName}
                  onChange={handleChange}
                  style={styles.input}
                  placeholder="Name on card"
                />
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
                  placeholder="Enter card number"
                />
              </div>
            </>
          )}

          {/* Loan Fields */}
          {formData.type === 'loan' && (
            <>
              <div style={styles.sectionDivider}>
                <span style={styles.sectionTitle}>Loan Details</span>
              </div>
              <div style={styles.row}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Original Balance <span style={styles.required}>*</span></label>
                  <div style={styles.inputWrapper}>
                    <span style={styles.currencySymbol}>$</span>
                    <input
                      type="number"
                      name="originalBalance"
                      value={formData.originalBalance}
                      onChange={handleChange}
                      style={styles.inputWithSymbol}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.originalBalance && <div style={styles.fieldError}>{errors.originalBalance}</div>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Interest Rate (%) <span style={styles.required}>*</span></label>
                  <input
                    type="number"
                    name="interestRate"
                    value={formData.interestRate}
                    onChange={handleChange}
                    step="0.01"
                    style={styles.input}
                    placeholder="e.g., 5.99"
                  />
                  {errors.interestRate && <div style={styles.fieldError}>{errors.interestRate}</div>}
                </div>
              </div>
              <div style={styles.row}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Term (months) <span style={styles.required}>*</span></label>
                  <input
                    type="number"
                    name="term"
                    value={formData.term}
                    onChange={handleChange}
                    style={styles.input}
                    placeholder="e.g., 60"
                  />
                  {errors.term && <div style={styles.fieldError}>{errors.term}</div>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Monthly Payment <span style={styles.required}>*</span></label>
                  <div style={styles.inputWrapper}>
                    <span style={styles.currencySymbol}>$</span>
                    <input
                      type="number"
                      name="monthlyPayment"
                      value={formData.monthlyPayment}
                      onChange={handleChange}
                      style={styles.inputWithSymbol}
                      placeholder="0.00"
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
                  placeholder="Enter loan account number"
                />
              </div>
            </>
          )}

          {/* Notes */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              style={styles.textarea}
              placeholder="Add any additional notes..."
            />
          </div>

          {/* Buttons */}
          <div style={styles.modalActions}>
            {mode === 'edit' && onDelete && (
              <button type="button" onClick={() => onDelete(account)} style={styles.deleteButton}>
                🗑️ Delete Account
              </button>
            )}
            <div style={styles.actionButtonsGroup}>
              <button type="button" onClick={onClose} style={styles.cancelButton}>
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
    maxWidth: '650px',
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
    cursor: 'pointer',
    padding: '0 0.5rem'
  },
  formGroup: {
    marginBottom: '1.25rem',
    flex: 1
  },
  row: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '0'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    fontWeight: '500'
  },
  required: {
    color: '#EF4444',
    marginLeft: '0.25rem'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer'
  },
  hint: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.7rem',
    color: '#6B7280'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    cursor: 'pointer'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.9rem'
  },
  inputError: {
    borderColor: '#EF4444'
  },
  fieldError: {
    color: '#EF4444',
    fontSize: '0.7rem',
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
    color: '#9CA3AF',
    fontSize: '0.9rem'
  },
  inputWithSymbol: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 1.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.9rem'
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  sectionDivider: {
    margin: '1rem 0 1rem 0',
    borderBottom: '1px solid #374151',
    paddingBottom: '0.5rem'
  },
  sectionTitle: {
    color: '#60A5FA',
    fontSize: '0.8rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '1.5rem',
    gap: '1rem'
  },
  actionButtonsGroup: {
    display: 'flex',
    gap: '0.75rem'
  },
  deleteButton: {
    padding: '0.6rem 1rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.85rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  saveButton: {
    padding: '0.6rem 1.25rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  cancelButton: {
    padding: '0.6rem 1.25rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    cursor: 'pointer'
  }
};

export default AccountModal;