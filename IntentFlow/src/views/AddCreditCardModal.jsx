// src/views/AddCreditCardModal.jsx
import React, { useState } from 'react';

const AddCreditCardModal = ({ isOpen, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        accountNumber: '',
        cardHolderName: '',
        name: '', // Card name
        institution: '',
        limit: '',
        apr: '',
        dueDate: '',
        balance: '',
        notes: ''
    });
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const validateForm = () => {
        const newErrors = {};

        if (!formData.accountNumber.trim()) {
            newErrors.accountNumber = 'Account number is required';
        } else {
            const digits = formData.accountNumber.replace(/\s/g, '');
            if (digits.length < 15) {
                newErrors.accountNumber = 'Account number must be at least 15 digits';
            } else if (digits.length > 16) {
                newErrors.accountNumber = 'Account number cannot exceed 16 digits';
            }
        }

        if (!formData.cardHolderName.trim()) {
            newErrors.cardHolderName = 'Card holder name is required';
        }

        if (!formData.name.trim()) {
            newErrors.name = 'Card name is required';
        }

        if (!formData.limit) {
            newErrors.limit = 'Credit limit is required';
        } else if (parseFloat(formData.limit) <= 0) {
            newErrors.limit = 'Credit limit must be greater than 0';
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
            // Prepare data for saving - include ALL fields
            const cardData = {
                accountNumber: formData.accountNumber.replace(/\s/g, ''),
                cardHolderName: formData.cardHolderName,
                name: formData.name,
                institution: formData.institution,
                limit: parseFloat(formData.limit),
                credit_limit: parseFloat(formData.limit), // Add both for compatibility
                apr: formData.apr ? parseFloat(formData.apr) : 18.99,
                interest_rate: formData.apr ? parseFloat(formData.apr) : 18.99, // Add both
                dueDate: formData.dueDate,
                due_date: formData.dueDate, // Add both
                balance: formData.balance ? parseFloat(formData.balance) : 0,
                notes: formData.notes,
                type: 'credit'
            };

            console.log('📤 Sending card data from modal:', cardData); // Add debug log

            await onSave(cardData);
            onClose();

            // Reset form
            setFormData({
                accountNumber: '',
                cardHolderName: '',
                name: '',
                institution: '',
                limit: '',
                apr: '',
                dueDate: '',
                balance: '',
                notes: ''
            });
        } catch (error) {
            console.error('Error saving credit card:', error);
            alert('Failed to save credit card');
        } finally {
            setIsSubmitting(false);
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
        // Remove all non-digits
        const digits = value.replace(/\D/g, '');

        // Limit to 16 digits (standard credit card length)
        const limited = digits.slice(0, 16);

        // Add space every 4 digits
        const groups = limited.match(/.{1,4}/g);
        return groups ? groups.join(' ') : limited;
    };

    return (
        <div style={styles.modalOverlay} onClick={onClose}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                    <h2 style={styles.modalTitle}>Add Credit Card</h2>
                    <button onClick={onClose} style={styles.closeButton}>×</button>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Account Number */}
                    <div style={styles.formGroup}>
                        <label style={styles.label}>
                            Account Number <span style={styles.required}>*</span>
                        </label>
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
                            style={{
                                ...styles.input,
                                ...(errors.accountNumber ? styles.inputError : {})
                            }}
                        />
                        {errors.accountNumber && (
                            <div style={styles.fieldError}>{errors.accountNumber}</div>
                        )}
                        <div style={styles.hint}>
                            {formData.accountNumber.replace(/\s/g, '').length} / 16 digits
                        </div>
                    </div>

                    {/* Card Holder Name */}
                    <div style={styles.formGroup}>
                        <label style={styles.label}>
                            Card Holder Name <span style={styles.required}>*</span>
                        </label>
                        <input
                            type="text"
                            name="cardHolderName"
                            value={formData.cardHolderName}
                            onChange={handleChange}
                            placeholder="John Doe"
                            style={{
                                ...styles.input,
                                ...(errors.cardHolderName ? styles.inputError : {})
                            }}
                        />
                        {errors.cardHolderName && (
                            <div style={styles.fieldError}>{errors.cardHolderName}</div>
                        )}
                    </div>

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
                        {errors.name && (
                            <div style={styles.fieldError}>{errors.name}</div>
                        )}
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
                            {errors.limit && (
                                <div style={styles.fieldError}>{errors.limit}</div>
                            )}
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
                                style={styles.input}
                            />
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
                                style={{
                                    ...styles.input,
                                    ...(errors.dueDate ? styles.inputError : {})
                                }}
                            />
                            {errors.dueDate && (
                                <div style={styles.fieldError}>{errors.dueDate}</div>
                            )}
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
                                    style={styles.inputWithSymbol}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Notes (Optional)</label>
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
                            {isSubmitting ? 'Saving...' : 'Add Credit Card'}
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
    hint: {
        color: '#9CA3AF',
        fontSize: '0.75rem',
        marginTop: '0.25rem',
        textAlign: 'right'
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
    }
};

export default AddCreditCardModal;