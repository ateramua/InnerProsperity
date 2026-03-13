// src/views/GoalDetailsModal.jsx
import React, { useState, useEffect } from 'react';

const GoalDetailsModal = ({ isOpen, onClose, category, onSave }) => {
  const [goalData, setGoalData] = useState({
    target_amount: 0,
    target_type: 'monthly',
    target_date: '',
    notes: ''
  });

  useEffect(() => {
    if (category) {
      setGoalData({
        target_amount: category.target_amount || 0,
        target_type: category.target_type || 'monthly',
        target_date: category.target_date || '',
        notes: category.notes || ''
      });
    }
  }, [category]);

  const handleSave = () => {
    if (goalData.target_amount <= 0) {
      alert('Please enter a valid target amount');
      return;
    }

    if (goalData.target_type === 'by_date' && !goalData.target_date) {
      alert('Please select a target date');
      return;
    }

    onSave({
      ...category,
      target_amount: goalData.target_amount,
      target_type: goalData.target_type,
      target_date: goalData.target_date,
      notes: goalData.notes
    });
  };

  if (!isOpen || !category) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Set Goal for {category.name}</h2>
          <button style={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div style={styles.modalBody}>
          {/* Target Type Selection */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Goal Type</label>
            <select
              style={styles.select}
              value={goalData.target_type}
              onChange={(e) => setGoalData({ ...goalData, target_type: e.target.value })}
            >
              <option value="monthly">Monthly Savings Goal</option>
              <option value="balance">Balance Target</option>
              <option value="by_date">Save by Date</option>
            </select>
          </div>

          {/* Target Amount */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Target Amount</label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                style={styles.inputWithSymbol}
                value={goalData.target_amount || ''}
                onChange={(e) => setGoalData({ ...goalData, target_amount: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {/* Target Date (only for 'by_date' type) */}
          {goalData.target_type === 'by_date' && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Target Date</label>
              <input
                type="date"
                style={styles.input}
                value={goalData.target_date}
                onChange={(e) => setGoalData({ ...goalData, target_date: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          )}

          {/* Notes */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Notes (Optional)</label>
            <textarea
              style={styles.textarea}
              value={goalData.notes}
              onChange={(e) => setGoalData({ ...goalData, notes: e.target.value })}
              placeholder="Add any notes about this goal..."
              rows="3"
            />
          </div>

          {/* Current Progress (if any) */}
          {category.available > 0 && (
            <div style={styles.progressSection}>
              <h4 style={styles.progressTitle}>Current Progress</h4>
              <div style={styles.progressBarContainer}>
                <div 
                  style={{
                    ...styles.progressBarFill,
                    width: `${Math.min((category.available / goalData.target_amount) * 100, 100)}%`
                  }}
                />
              </div>
              <div style={styles.progressStats}>
                <span style={styles.progressStat}>
                  Available: ${category.available.toFixed(2)}
                </span>
                <span style={styles.progressStat}>
                  {((category.available / goalData.target_amount) * 100).toFixed(1)}% complete
                </span>
              </div>
            </div>
          )}

          {/* Monthly Breakdown (for 'by_date' type) */}
          {goalData.target_type === 'by_date' && goalData.target_date && goalData.target_amount > 0 && (
            <div style={styles.breakdownSection}>
              <h4 style={styles.breakdownTitle}>Monthly Breakdown</h4>
              {(() => {
                const today = new Date();
                const targetDate = new Date(goalData.target_date);
                const monthsRemaining = (targetDate.getFullYear() - today.getFullYear()) * 12 +
                  (targetDate.getMonth() - today.getMonth());
                const remainingAmount = goalData.target_amount - (category.available || 0);
                const monthlyNeeded = monthsRemaining > 0 ? remainingAmount / monthsRemaining : remainingAmount;

                return (
                  <>
                    <div style={styles.breakdownRow}>
                      <span>Months remaining:</span>
                      <strong>{Math.max(0, monthsRemaining)}</strong>
                    </div>
                    <div style={styles.breakdownRow}>
                      <span>Amount needed:</span>
                      <strong>${Math.max(0, remainingAmount).toFixed(2)}</strong>
                    </div>
                    <div style={styles.breakdownRow}>
                      <span>Monthly contribution needed:</span>
                      <strong style={{ color: '#F59E0B' }}>
                        ${Math.max(0, monthlyNeeded).toFixed(2)}/month
                      </strong>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button style={styles.saveButton} onClick={handleSave}>
            Save Goal
          </button>
        </div>
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
    zIndex: 1100,
    backdropFilter: 'blur(4px)'
  },
  modalContent: {
    background: '#0047AB',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'hidden',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
    border: '1px solid #3B82F6'
  },
  modalHeader: {
    padding: '1.5rem',
    borderBottom: '1px solid #374151',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#0f2e1c'
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'white',
    margin: 0
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '1.5rem',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.375rem',
    transition: 'all 0.2s ease',
    ':hover': {
      background: 'rgba(255, 255, 255, 0.1)',
      color: 'white'
    }
  },
  modalBody: {
    padding: '1.5rem',
    overflowY: 'auto',
    maxHeight: 'calc(90vh - 130px)'
  },
  formGroup: {
    marginBottom: '1.5rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#0047AB',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    ':focus': {
      outline: 'none',
      borderColor: '#3B82F6'
    }
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  currencySymbol: {
    position: 'absolute',
    left: '1rem',
    color: '#9CA3AF',
    fontSize: '1rem'
  },
  inputWithSymbol: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: '#0047AB',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    transition: 'all 0.2s ease',
    ':focus': {
      outline: 'none',
      borderColor: '#3B82F6'
    }
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#0047AB',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    transition: 'all 0.2s ease',
    ':focus': {
      outline: 'none',
      borderColor: '#3B82F6'
    }
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#0047AB',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    fontFamily: 'inherit',
    resize: 'vertical',
    transition: 'all 0.2s ease',
    ':focus': {
      outline: 'none',
      borderColor: '#3B82F6'
    }
  },
  progressSection: {
    marginTop: '1.5rem',
    padding: '1rem',
    background: '#0f2e1c',
    borderRadius: '0.5rem',
    border: '1px solid #1f3a2c'
  },
  progressTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  progressBarContainer: {
    height: '8px',
    background: '#374151',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '0.5rem'
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
    transition: 'width 0.3s ease'
  },
  progressStats: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  progressStat: {
    color: '#9CA3AF'
  },
  breakdownSection: {
    marginTop: '1.5rem',
    padding: '1rem',
    background: '#0f2e1c',
    borderRadius: '0.5rem',
    border: '1px solid #1f3a2c'
  },
  breakdownTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  breakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0',
    borderBottom: '1px solid #1f3a2c',
    ':last-child': {
      borderBottom: 'none'
    }
  },
  modalFooter: {
    padding: '1.5rem',
    borderTop: '1px solid #374151',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '1rem',
    background: '#0f2e1c'
  },
  saveButton: {
    padding: '0.75rem 1.5rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      background: '#2563EB',
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
    }
  },
  cancelButton: {
    padding: '0.75rem 1.5rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      background: '#6B7280'
    }
  }
};

export default GoalDetailsModal;