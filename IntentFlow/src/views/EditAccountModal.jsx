// src/views/EditAccountModal.jsx
import React, { useState, useEffect } from 'react';

const EditAccountModal = ({ isOpen, onClose, onSave, onDelete, account }) => {
  const [formData, setFormData] = useState({
    name: '',
    institution: '',
    balance: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (account && isOpen) {
      setFormData({
        name: account.name || '',
        institution: account.institution || '',
        balance: Math.abs(account.balance || 0).toString()
      });
    }
  }, [account, isOpen]);

  if (!isOpen) return null;

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Account name is required';
    if (formData.balance && isNaN(parseFloat(formData.balance))) newErrors.balance = 'Balance must be a number';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const updatedData = {
        name: formData.name.trim(),
        institution: formData.institution.trim() || null,
        balance: parseFloat(formData.balance) || 0
      };
      await onSave(account.id, updatedData);
      onClose();
    } catch (error) {
      console.error('Error updating account:', error);
      alert('Failed to update account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this account? This action cannot be undone.')) {
      onDelete(account.id);
      onClose();
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }));
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
      maxWidth: '500px'
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
      padding: '0 0.5rem'
    },
    formGroup: {
      marginBottom: '1.5rem'
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

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Edit Account</h2>
          <button onClick={onClose} style={styles.closeButton}>×</button>
        </div>
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
              style={{ ...styles.input, ...(errors.name ? styles.inputError : {}) }}
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
                style={{ ...styles.inputWithSymbol, ...(errors.balance ? styles.inputError : {}) }}
              />
            </div>
            {errors.balance && <div style={styles.fieldError}>{errors.balance}</div>}
          </div>
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

export default EditAccountModal;