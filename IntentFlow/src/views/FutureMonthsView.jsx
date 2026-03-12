// src/views/FutureMonthsView.jsx
import React, { useState } from 'react';

const FutureMonthsView = ({ 
  futureAssignments = 2340.50,
  nextMonthTarget = 5000,
  monthsAhead = 1.5
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const progressPercentage = (futureAssignments / nextMonthTarget) * 100;

  return (
    <section style={styles.card}>
      {/* Card Header with Roll-up Button */}
      <button 
        style={styles.cardRollup}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span style={styles.rollupIcon}>{isExpanded ? '▼' : '►'}</span>
        <span style={styles.rollupText}>Future Months</span>
      </button>

      {/* Card Body - Conditionally rendered */}
      {isExpanded && (
        <div style={styles.cardBody}>
          <div style={styles.content}>
            {/* Total Assigned */}
            <div style={styles.totalRow}>
              <span style={styles.totalLabel}>Assigned in Future</span>
              <span style={styles.totalValue}>
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD'
                }).format(futureAssignments)}
              </span>
            </div>

            {/* Months Ahead Indicator */}
            <div style={styles.monthsAhead}>
              <span style={styles.monthsAheadLabel}>Months Ahead</span>
              <span style={styles.monthsAheadValue}>{monthsAhead.toFixed(1)}</span>
            </div>

            {/* Progress Bar */}
            <div style={styles.progressSection}>
              <div style={styles.progressHeader}>
                <span style={styles.progressLabel}>Next Month Funding</span>
                <span style={styles.progressPercentage}>
                  {progressPercentage.toFixed(1)}%
                </span>
              </div>
              <div style={styles.progressBarBackground}>
                <div 
                  style={{
                    ...styles.progressBarFill,
                    width: `${Math.min(progressPercentage, 100)}%`
                  }}
                />
              </div>
            </div>

            {/* Month Breakdown */}
            <div style={styles.breakdown}>
              <div style={styles.breakdownItem}>
                <span style={styles.breakdownMonth}>April 2024</span>
                <span style={styles.breakdownAmount}>$1,500</span>
              </div>
              <div style={styles.breakdownItem}>
                <span style={styles.breakdownMonth}>May 2024</span>
                <span style={styles.breakdownAmount}>$840</span>
              </div>
            </div>

            {/* Action Button */}
            <button style={styles.assignButton}>
              Assign to Next Month
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

const styles = {
  card: {
    width: '100%',
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    overflow: 'hidden'
  },
  cardRollup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    padding: '1rem',
    background: '#111827',
    border: 'none',
    borderBottom: '1px solid #374151',
    color: 'white',
    fontSize: '0.95rem',
    fontWeight: '500',
    cursor: 'pointer',
    textAlign: 'left',
    ':hover': {
      background: '#1F2937'
    }
  },
  rollupIcon: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  rollupText: {
    flex: 1
  },
  cardBody: {
    padding: '1rem'
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  totalLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  totalValue: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#4ADE80'
  },
  monthsAhead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0'
  },
  monthsAheadLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  monthsAheadValue: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#3B82F6'
  },
  progressSection: {
    marginBottom: '0.5rem'
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem'
  },
  progressLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  progressPercentage: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: 'white'
  },
  progressBarBackground: {
    height: '6px',
    background: '#374151',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    background: '#3B82F6',
    borderRadius: '3px',
    transition: 'width 0.3s ease'
  },
  breakdown: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.5rem 0'
  },
  breakdownItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem',
    background: '#111827',
    borderRadius: '0.375rem'
  },
  breakdownMonth: {
    fontSize: '0.875rem',
    color: '#F3F4F6'
  },
  breakdownAmount: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#4ADE80'
  },
  assignButton: {
    width: '100%',
    padding: '0.75rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    marginTop: '0.5rem',
    ':hover': {
      background: '#2563EB'
    }
  }
};

export default FutureMonthsView;