// src/views/AddLoanForm.jsx
import React, { useState } from 'react';

export default function AddLoanForm({ onComplete, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'auto',
    lender: '',
    originalBalance: '',
    currentBalance: '',
    interestRate: '',
    term: '',
    monthlyPayment: '',
    nextPaymentDate: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loanTypes = [
    { value: 'auto', label: 'Auto Loan', icon: '🚗' },
    { value: 'student', label: 'Student Loan', icon: '🎓' },
    { value: 'personal', label: 'Personal Loan', icon: '💰' },
    { value: 'mortgage', label: 'Mortgage', icon: '🏠' },
    { value: 'business', label: 'Business Loan', icon: '💼' },
    { value: 'other', label: 'Other Loan', icon: '📝' }
  ];

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) newErrors.name = 'Loan name is required';
    if (!formData.lender.trim()) newErrors.lender = 'Lender name is required';
    if (!formData.originalBalance) newErrors.originalBalance = 'Original balance is required';
    if (!formData.currentBalance) newErrors.currentBalance = 'Current balance is required';
    if (!formData.interestRate) newErrors.interestRate = 'Interest rate is required';
    if (!formData.term) newErrors.term = 'Loan term is required';
    if (!formData.monthlyPayment) newErrors.monthlyPayment = 'Monthly payment is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const loanData = {
        name: formData.name,
        type: formData.type,
        lender: formData.lender,
        originalBalance: parseFloat(formData.originalBalance),
        balance: -Math.abs(parseFloat(formData.currentBalance)), // Store as negative for consistency
        interestRate: parseFloat(formData.interestRate),
        term: parseInt(formData.term),
        monthlyPayment: parseFloat(formData.monthlyPayment),
        nextPaymentDate: formData.nextPaymentDate,
        remainingPayments: Math.ceil(parseFloat(formData.currentBalance) / parseFloat(formData.monthlyPayment)),
        notes: formData.notes
      };

      await onComplete(loanData);
    } catch (error) {
      console.error('Error adding loan:', error);
      setErrors({ form: 'Failed to add loan. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onCancel} style={styles.backButton}>← Back</button>
        <h2 style={styles.title}>➕ Add New Loan</h2>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        {errors.form && <div style={styles.errorMessage}>{errors.form}</div>}

        {/* Loan Name */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Loan Name <span style={styles.required}>*</span></label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            placeholder="e.g., Toyota Auto Loan"
            style={{...styles.input, ...(errors.name ? styles.inputError : {})}}
          />
          {errors.name && <div style={styles.fieldError}>{errors.name}</div>}
        </div>

        {/* Loan Type and Lender */}
        <div style={styles.row}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Loan Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
              style={styles.select}
            >
              {loanTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Lender <span style={styles.required}>*</span></label>
            <input
              type="text"
              name="lender"
              value={formData.lender}
              onChange={(e) => setFormData({...formData, lender: e.target.value})}
              placeholder="e.g., Chase, Navient"
              style={{...styles.input, ...(errors.lender ? styles.inputError : {})}}
            />
            {errors.lender && <div style={styles.fieldError}>{errors.lender}</div>}
          </div>
        </div>

        {/* Balances */}
        <div style={styles.row}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Original Balance <span style={styles.required}>*</span></label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                name="originalBalance"
                value={formData.originalBalance}
                onChange={(e) => setFormData({...formData, originalBalance: e.target.value})}
                placeholder="25000"
                style={{...styles.inputWithSymbol, ...(errors.originalBalance ? styles.inputError : {})}}
              />
            </div>
            {errors.originalBalance && <div style={styles.fieldError}>{errors.originalBalance}</div>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Current Balance <span style={styles.required}>*</span></label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                name="currentBalance"
                value={formData.currentBalance}
                onChange={(e) => setFormData({...formData, currentBalance: e.target.value})}
                placeholder="15250.75"
                style={{...styles.inputWithSymbol, ...(errors.currentBalance ? styles.inputError : {})}}
              />
            </div>
            {errors.currentBalance && <div style={styles.fieldError}>{errors.currentBalance}</div>}
          </div>
        </div>

        {/* Interest Rate and Term */}
        <div style={styles.row}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Interest Rate (%) <span style={styles.required}>*</span></label>
            <input
              type="number"
              name="interestRate"
              value={formData.interestRate}
              onChange={(e) => setFormData({...formData, interestRate: e.target.value})}
              placeholder="4.5"
              step="0.1"
              min="0"
              max="30"
              style={{...styles.input, ...(errors.interestRate ? styles.inputError : {})}}
            />
            {errors.interestRate && <div style={styles.fieldError}>{errors.interestRate}</div>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Term (months) <span style={styles.required}>*</span></label>
            <input
              type="number"
              name="term"
              value={formData.term}
              onChange={(e) => setFormData({...formData, term: e.target.value})}
              placeholder="60"
              min="1"
              style={{...styles.input, ...(errors.term ? styles.inputError : {})}}
            />
            {errors.term && <div style={styles.fieldError}>{errors.term}</div>}
          </div>
        </div>

        {/* Monthly Payment and Next Payment Date */}
        <div style={styles.row}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Monthly Payment <span style={styles.required}>*</span></label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                name="monthlyPayment"
                value={formData.monthlyPayment}
                onChange={(e) => setFormData({...formData, monthlyPayment: e.target.value})}
                placeholder="345.67"
                style={{...styles.inputWithSymbol, ...(errors.monthlyPayment ? styles.inputError : {})}}
              />
            </div>
            {errors.monthlyPayment && <div style={styles.fieldError}>{errors.monthlyPayment}</div>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Next Payment Date</label>
            <input
              type="date"
              name="nextPaymentDate"
              value={formData.nextPaymentDate}
              onChange={(e) => setFormData({...formData, nextPaymentDate: e.target.value})}
              min={new Date().toISOString().split('T')[0]}
              style={styles.input}
            />
          </div>
        </div>

        {/* Notes */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Notes (Optional)</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={(e) => setFormData({...formData, notes: e.target.value})}
            placeholder="Any additional information about this loan..."
            rows="3"
            style={styles.textarea}
          />
        </div>

        {/* Tips */}
        <div style={styles.tipsContainer}>
          <h4 style={styles.tipsTitle}>💡 Loan Management Tips</h4>
          <ul style={styles.tipsList}>
            <li>Track all your loans to see your complete debt picture</li>
            <li>The Debt Strategist will help you optimize payments</li>
            <li>Extra payments go directly to principal and save interest</li>
            <li>Consider refinancing if rates drop significantly</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div style={styles.actionButtons}>
          <button type="button" onClick={onCancel} style={styles.cancelButton}>
            Cancel
          </button>
          <button type="submit" style={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Adding...' : 'Add Loan'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Styles (similar to AddCreditCardForm but with loan-specific styling)
const styles = {
  container: {
    padding: '2rem',
    maxWidth: '800px',
    margin: '0 auto',
    color: 'white'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '2rem'
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem'
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 'bold',
    margin: 0,
    background: 'linear-gradient(135deg, #10B981, #3B82F6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  form: {
    background: '#1F2937',
    borderRadius: '1rem',
    padding: '2rem',
    border: '1px solid #374151'
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
  required: {
    color: '#EF4444'
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
    fontFamily: 'inherit'
  },
  inputError: {
    borderColor: '#EF4444'
  },
  fieldError: {
    color: '#EF4444',
    fontSize: '0.75rem',
    marginTop: '0.25rem'
  },
  errorMessage: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #EF4444',
    color: '#EF4444',
    padding: '1rem',
    borderRadius: '0.5rem',
    marginBottom: '1.5rem'
  },
  tipsContainer: {
    background: '#0A2472',
    padding: '1.5rem',
    borderRadius: '0.5rem',
    marginBottom: '2rem'
  },
  tipsTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    margin: '0 0 0.75rem 0',
    color: 'white'
  },
  tipsList: {
    margin: 0,
    paddingLeft: '1.5rem',
    color: '#9CA3AF'
  },
  actionButtons: {
    display: 'flex',
    gap: '1rem'
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    cursor: 'pointer'
  },
  submitButton: {
    flex: 2,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  }
};