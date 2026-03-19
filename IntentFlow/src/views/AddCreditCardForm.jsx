// src/views/AddCreditCardForm.jsx
import React, { useState } from 'react';

const AddCreditCardForm = ({ onComplete, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    institution: '',
    limit: '',
    apr: '',
    dueDate: '',
    cardNumber: '',
    balance: '', // Added balance field
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Card name is required';
    }

    if (!formData.institution.trim()) {
      newErrors.institution = 'Institution name is required';
    }

    if (!formData.limit) {
      newErrors.limit = 'Credit limit is required';
    } else if (parseFloat(formData.limit) <= 0) {
      newErrors.limit = 'Credit limit must be greater than 0';
    }

    if (formData.balance && parseFloat(formData.balance) < 0) {
      newErrors.balance = 'Balance cannot be negative';
    }

    if (formData.apr && (parseFloat(formData.apr) < 0 || parseFloat(formData.apr) > 100)) {
      newErrors.apr = 'APR must be between 0 and 100';
    }

    if (!formData.dueDate) {
      newErrors.dueDate = 'Due date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Format the data for submission
      // In handleSubmit function, make sure type is always set
      const cardData = {
        name: formData.name,
        institution: formData.institution,
        limit: parseFloat(formData.limit),
        apr: formData.apr ? parseFloat(formData.apr) : 18.99,
        dueDate: formData.dueDate,
        cardNumber: formData.cardNumber ? formData.cardNumber.replace(/\s/g, '') : undefined,
        notes: formData.notes,
        balance: formData.balance ? parseFloat(formData.balance) : 0,
        lastStatementBalance: formData.balance ? parseFloat(formData.balance) : 0,
        minimumPayment: 0,
        type: 'credit', // Always set to credit
        status: 'active'
      };

      await onComplete(cardData);
    } catch (error) {
      console.error('Error adding credit card:', error);
      setErrors({ form: 'Failed to add credit card. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const formatCardNumber = (value) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');

    // Add space every 4 digits
    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ');

    return formatted.slice(0, 19); // Limit to 16 digits + 3 spaces
  };

  const handleCardNumberChange = (e) => {
    const formatted = formatCardNumber(e.target.value);
    setFormData(prev => ({ ...prev, cardNumber: formatted }));
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onCancel} style={styles.backButton}>
          ← Back
        </button>
        <h2 style={styles.title}>➕ Add Credit Card</h2>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Error Message */}
        {errors.form && (
          <div style={styles.errorMessage}>
            {errors.form}
          </div>
        )}

        {/* Card Name */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Card Name <span style={styles.required}>*</span>
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Chase Sapphire Preferred"
            style={{
              ...styles.input,
              ...(errors.name ? styles.inputError : {})
            }}
            disabled={isSubmitting}
          />
          {errors.name && (
            <div style={styles.fieldError}>{errors.name}</div>
          )}
        </div>

        {/* Institution */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Institution <span style={styles.required}>*</span>
          </label>
          <input
            type="text"
            name="institution"
            value={formData.institution}
            onChange={handleChange}
            placeholder="e.g., Chase, Apple, Capital One"
            style={{
              ...styles.input,
              ...(errors.institution ? styles.inputError : {})
            }}
            disabled={isSubmitting}
          />
          {errors.institution && (
            <div style={styles.fieldError}>{errors.institution}</div>
          )}
        </div>

        {/* Three Column Layout */}
        <div style={styles.row}>
          {/* Current Balance */}
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Current Balance
            </label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                name="balance"
                value={formData.balance}
                onChange={handleChange}
                placeholder="0.00"
                min="0"
                step="0.01"
                style={{
                  ...styles.inputWithSymbol,
                  ...(errors.balance ? styles.inputError : {})
                }}
                disabled={isSubmitting}
              />
            </div>
            {errors.balance && (
              <div style={styles.fieldError}>{errors.balance}</div>
            )}
          </div>

          {/* Credit Limit */}
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Credit Limit <span style={styles.required}>*</span>
            </label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                name="limit"
                value={formData.limit}
                onChange={handleChange}
                placeholder="5000"
                min="0"
                step="100"
                style={{
                  ...styles.inputWithSymbol,
                  ...(errors.limit ? styles.inputError : {})
                }}
                disabled={isSubmitting}
              />
            </div>
            {errors.limit && (
              <div style={styles.fieldError}>{errors.limit}</div>
            )}
          </div>

          {/* APR */}
          <div style={styles.formGroup}>
            <label style={styles.label}>
              APR (%)
            </label>
            <input
              type="number"
              name="apr"
              value={formData.apr}
              onChange={handleChange}
              placeholder="18.99"
              min="0"
              max="100"
              step="0.01"
              style={{
                ...styles.input,
                ...(errors.apr ? styles.inputError : {})
              }}
              disabled={isSubmitting}
            />
            {errors.apr && (
              <div style={styles.fieldError}>{errors.apr}</div>
            )}
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={styles.row}>
          {/* Due Date */}
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Due Date <span style={styles.required}>*</span>
            </label>
            <input
              type="date"
              name="dueDate"
              value={formData.dueDate}
              onChange={handleChange}
              min={new Date().toISOString().split('T')[0]}
              style={{
                ...styles.input,
                ...(errors.dueDate ? styles.inputError : {})
              }}
              disabled={isSubmitting}
            />
            {errors.dueDate && (
              <div style={styles.fieldError}>{errors.dueDate}</div>
            )}
          </div>

          {/* Card Number (Optional) */}
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Card Number (Optional)
            </label>
            <input
              type="text"
              name="cardNumber"
              value={formData.cardNumber}
              onChange={handleCardNumberChange}
              placeholder="1234 5678 9012 3456"
              maxLength="19"
              style={styles.input}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Notes */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Notes (Optional)
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Add any notes about this card..."
            rows="3"
            style={styles.textarea}
            disabled={isSubmitting}
          />
        </div>

        {/* Tips Section */}
        <div style={styles.tipsContainer}>
          <h4 style={styles.tipsTitle}>💡 Tips</h4>
          <ul style={styles.tipsList}>
            <li>You can always edit these details later</li>
            <li>The current balance is what you owe on this card</li>
            <li>The due date helps track when payments are due</li>
            <li>APR is used to calculate potential interest charges</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div style={styles.actionButtons}>
          <button
            type="button"
            onClick={onCancel}
            style={styles.cancelButton}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={styles.submitButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span style={styles.spinner}></span>
                Adding...
              </>
            ) : (
              'Add Credit Card'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '900px',
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
    borderRadius: '0.5rem',
    transition: 'all 0.2s',
    ':hover': {
      background: '#374151',
      color: 'white'
    }
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
    fontSize: '1rem',
    transition: 'all 0.2s',
    ':focus': {
      outline: 'none',
      borderColor: '#3B82F6'
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
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
    color: '#9CA3AF',
    lineHeight: '1.6'
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
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      background: '#6B7280'
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
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
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
      transform: 'none'
    }
  },
  spinner: {
    display: 'inline-block',
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: 'white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginRight: '0.5rem'
  }
};

export default AddCreditCardForm;