// src/views/AddLoanForm.jsx
import React, { useState } from 'react';

export default function AddLoanForm({ onComplete, onCancel }) {
  // At the top of the component function
console.log('AddLoanForm rendering');
  const [formData, setFormData] = useState({
    name: '',
    lender: '',
    balance: '',
    interestRate: '',
    originalBalance: '',
    term: '',
    monthlyPayment: '',
    nextPaymentDate: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Loan name is required';
    if (!formData.lender.trim()) newErrors.lender = 'Lender is required';
    if (!formData.balance) newErrors.balance = 'Current balance is required';
    if (!formData.interestRate) newErrors.interestRate = 'Interest rate is required';
    if (!formData.originalBalance) newErrors.originalBalance = 'Original balance is required';
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
        name: formData.name.trim(),
        lender: formData.lender.trim(),
        balance: parseFloat(formData.balance),
        interestRate: parseFloat(formData.interestRate),
        originalBalance: parseFloat(formData.originalBalance),
        term: parseInt(formData.term, 10),
        monthlyPayment: parseFloat(formData.monthlyPayment),
        nextPaymentDate: formData.nextPaymentDate || null,
        notes: formData.notes.trim() || null
      };
      await onComplete(loanData);
    } catch (error) {
      console.error('Error adding loan:', error);
      alert('Failed to add loan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onCancel} style={styles.backButton}>← Back</button>
        <h2 style={styles.title}>➕ Add Loan</h2>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        {errors.form && <div style={styles.errorMessage}>{errors.form}</div>}

        <div style={styles.formGroup}>
          <label style={styles.label}>Loan Name *</label>
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
          <label style={styles.label}>Lender *</label>
          <input
            type="text"
            name="lender"
            value={formData.lender}
            onChange={handleChange}
            style={{ ...styles.input, ...(errors.lender && styles.inputError) }}
          />
          {errors.lender && <div style={styles.fieldError}>{errors.lender}</div>}
        </div>

        <div style={styles.row}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Current Balance *</label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                name="balance"
                value={formData.balance}
                onChange={handleChange}
                step="0.01"
                style={{ ...styles.inputWithSymbol, ...(errors.balance && styles.inputError) }}
              />
            </div>
            {errors.balance && <div style={styles.fieldError}>{errors.balance}</div>}
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
            <label style={styles.label}>Original Balance *</label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                name="originalBalance"
                value={formData.originalBalance}
                onChange={handleChange}
                step="0.01"
                style={{ ...styles.inputWithSymbol, ...(errors.originalBalance && styles.inputError) }}
              />
            </div>
            {errors.originalBalance && <div style={styles.fieldError}>{errors.originalBalance}</div>}
          </div>

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

        <div style={styles.formGroup}>
          <label style={styles.label}>Next Payment Date (Optional)</label>
          <input
            type="date"
            name="nextPaymentDate"
            value={formData.nextPaymentDate}
            onChange={handleChange}
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Notes (Optional)</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows="3"
            style={styles.textarea}
          />
        </div>

        <div style={styles.actionButtons}>
          <button type="button" onClick={onCancel} style={styles.cancelButton} disabled={isSubmitting}>
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
    background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
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
    fontSize: '0.875rem',
    fontWeight: '500'
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
  actionButtons: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem'
  },
  submitButton: {
    flex: 2,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
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
    cursor: 'pointer'
  }
};