// src/views/EditLoanModal.jsx
import React, { useState, useEffect } from 'react';

const EditLoanModal = ({ isOpen, onClose, onSave, onDelete, loan }) => {
  const [formData, setFormData] = useState({
    name: '',
    lender: '',
    originalBalance: '',
    interestRate: '',
    term: '',
    monthlyPayment: '',
    nextPaymentDate: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (loan && isOpen) {
      setFormData({
        name: loan.name || '',
        lender: loan.lender || loan.institution || '',
        originalBalance: loan.originalBalance ? Math.abs(loan.originalBalance).toString() : '',
        interestRate: loan.interestRate ? loan.interestRate.toString() : '',
        term: loan.term ? loan.term.toString() : '',
        monthlyPayment: loan.monthlyPayment ? loan.monthlyPayment.toString() : '',
        nextPaymentDate: loan.nextPaymentDate || '',
        notes: loan.notes || ''
      });
    } else if (isOpen) {
      // Reset for new loan (though this modal is only for edit)
      setFormData({
        name: '',
        lender: '',
        originalBalance: '',
        interestRate: '',
        term: '',
        monthlyPayment: '',
        nextPaymentDate: '',
        notes: ''
      });
    }
  }, [loan, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const updatedData = {
        name: formData.name.trim(),
        lender: formData.lender.trim() || null,
        originalBalance: formData.originalBalance ? parseFloat(formData.originalBalance) : null,
        interestRate: formData.interestRate ? parseFloat(formData.interestRate) : null,
        term: formData.term ? parseInt(formData.term) : null,
        monthlyPayment: formData.monthlyPayment ? parseFloat(formData.monthlyPayment) : null,
        nextPaymentDate: formData.nextPaymentDate || null,
        notes: formData.notes.trim() || null
      };

      // Remove null values to avoid overwriting with null
      Object.keys(updatedData).forEach(key => 
        updatedData[key] === null && delete updatedData[key]
      );

      await onSave(loan.id, updatedData);
      onClose();
    } catch (error) {
      console.error('Error updating loan:', error);
      alert('Failed to update loan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (window.confirm(`Are you sure you want to delete "${loan?.name}"?`)) {
      setIsSubmitting(true);
      try {
        console.log('Calling onDelete with:', loan.id, 'onDelete type:', typeof onDelete);
        await onDelete(loan.id);
        onClose();
      } catch (error) {
        console.error('Error deleting loan:', error);
        alert('Failed to delete loan');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Edit Loan</h2>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Loan Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Lender / Institution</label>
            <input
              type="text"
              name="lender"
              value={formData.lender}
              onChange={handleChange}
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Original Balance</label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                name="originalBalance"
                value={formData.originalBalance}
                onChange={handleChange}
                step="0.01"
                style={styles.inputWithSymbol}
              />
            </div>
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
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Term (months)</label>
            <input
              type="number"
              name="term"
              value={formData.term}
              onChange={handleChange}
              min="1"
              style={styles.input}
            />
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
                style={styles.inputWithSymbol}
                required
              />
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
            <label style={styles.label}>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              style={styles.textarea}
            />
          </div>

          <div style={styles.modalActions}>
            {onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                style={styles.deleteButton}
                disabled={isSubmitting}
              >
                Delete
              </button>
            )}
            <button
              type="submit"
              style={styles.saveButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={styles.cancelButton}
              disabled={isSubmitting}
            >
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
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)',
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
    maxWidth: '500px',
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
  input: {
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
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem'
  },
  saveButton: {
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
    background: '#6B7280',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
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
  }
};

export default EditLoanModal;