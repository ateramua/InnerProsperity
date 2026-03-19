// src/views/EditCreditCardModal.jsx
import React, { useState, useEffect } from 'react';

const EditCreditCardModal = ({ isOpen, onClose, onSave, onDelete, card }) => {
  const [formData, setFormData] = useState({
    name: '',
    institution: '',
    limit: '',
    apr: '',
    dueDate: '',
    balance: '',
    cardHolderName: '',
    accountNumber: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load card data when modal opens
  useEffect(() => {
    if (card && isOpen) {
      setFormData({
        name: card.name || '',
        institution: card.institution || '',
        limit: card.credit_limit || card.limit || '',
        apr: card.interest_rate || card.apr || '',
        dueDate: card.due_date || card.dueDate || '',
        balance: Math.abs(card.balance || 0),
        cardHolderName: card.cardHolderName || '',
        accountNumber: card.accountNumber || '',
        notes: card.notes || ''
      });
    }
  }, [card, isOpen]);

  if (!isOpen) return null;

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Card name is required';
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
      // Prepare data for saving
      const updatedData = {
        name: formData.name,
        institution: formData.institution,
        credit_limit: parseFloat(formData.limit),
        limit: parseFloat(formData.limit), // For compatibility
        interest_rate: formData.apr ? parseFloat(formData.apr) : null,
        apr: formData.apr ? parseFloat(formData.apr) : null, // For compatibility
        due_date: formData.dueDate || null,
        dueDate: formData.dueDate || null, // For compatibility
        balance: formData.balance ? -Math.abs(parseFloat(formData.balance)) : card.balance,
        cardHolderName: formData.cardHolderName,
        accountNumber: formData.accountNumber,
        notes: formData.notes
      };

      await onSave(card.id, updatedData);
      onClose();
    } catch (error) {
      console.error('Error updating credit card:', error);
      alert('Failed to update credit card');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this credit card? This action cannot be undone.')) {
      onDelete(card.id);
      onClose();
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const formatAccountNumber = (value) => {
    const digits = value.replace(/\D/g, '');
    const limited = digits.slice(0, 16);
    const groups = limited.match(/.{1,4}/g);
    return groups ? groups.join(' ') : limited;
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Edit Credit Card</h2>
          <button onClick={onClose} style={styles.closeButton}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
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
            />
            {errors.name && <div style={styles.fieldError}>{errors.name}</div>}
          </div>

          {/* Institution */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Institution</label>
            <input
              type="text"
              name="institution"
              value={formData.institution}
              onChange={handleChange}
              placeholder="e.g., Chase, Capital One"
              style={styles.input}
            />
          </div>

          {/* Card Holder Name */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Card Holder Name</label>
            <input
              type="text"
              name="cardHolderName"
              value={formData.cardHolderName}
              onChange={handleChange}
              placeholder="John Doe"
              style={styles.input}
            />
          </div>

          {/* Account Number */}
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
              placeholder="1234 5678 9012 3456"
              maxLength="19"
              style={styles.input}
            />
          </div>

          {/* Two Column Layout */}
          <div style={styles.row}>
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
                />
              </div>
              {errors.limit && <div style={styles.fieldError}>{errors.limit}</div>}
            </div>

            {/* APR */}
            <div style={styles.formGroup}>
              <label style={styles.label}>APR (%)</label>
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
              />
              {errors.apr && <div style={styles.fieldError}>{errors.apr}</div>}
            </div>
          </div>

          {/* Two Column Layout */}
          <div style={styles.row}>
            {/* Due Date */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Due Date</label>
              <input
                type="date"
                name="dueDate"
                value={formData.dueDate}
                onChange={handleChange}
                style={styles.input}
              />
            </div>

            {/* Current Balance */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Current Balance</label>
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
                />
              </div>
              {errors.balance && <div style={styles.fieldError}>{errors.balance}</div>}
            </div>
          </div>

          {/* Notes */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Add any notes about this card..."
              rows="3"
              style={styles.textarea}
            />
          </div>

          {/* Action Buttons */}
          <div style={styles.modalActions}>
            <button
              type="button"
              onClick={handleDelete}
              style={styles.deleteButton}
              disabled={isSubmitting}
            >
              🗑️ Delete
            </button>
            <div style={styles.rightActions}>
              <button
                type="button"
                onClick={onClose}
                style={styles.cancelButton}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={styles.saveButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
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
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 0.5rem',
    ':hover': {
      color: 'white'
    }
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
  modalActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '2rem',
    gap: '1rem'
  },
  rightActions: {
    display: 'flex',
    gap: '1rem'
  },
  deleteButton: {
    padding: '0.75rem 1.5rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      background: '#DC2626',
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  },
  saveButton: {
    padding: '0.75rem 1.5rem',
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
      cursor: 'not-allowed'
    }
  },
  cancelButton: {
    padding: '0.75rem 1.5rem',
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
  }
};

export default EditCreditCardModal;