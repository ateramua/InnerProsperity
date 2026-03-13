// src/views/AutoAssignView.jsx
import React, { useState } from 'react';

const AutoAssignView = ({ readyToAssign = 1250.57 }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState('underfunded');
  const [showPreview, setShowPreview] = useState(false);

  // Sample categories for preview
  const categories = [
    { name: 'Gas - Uber', amount: 45.67, category: 'Transportation' },
    { name: 'Stuff I Forgot To Budget', amount: 100.0, category: 'Misc' },
    { name: 'House Hold Item', amount: 75.5, category: 'Shopping' },
    { name: 'Acorn Subscription', amount: 12.99, category: 'Subscriptions' },
    { name: 'HairCut', amount: 35.0, category: 'Personal Care' },
  ];

  const strategies = [
    { id: 'underfunded', name: 'Underfunded', icon: '⚠️' },
    { id: 'lastMonth', name: 'Last Month', icon: '📅' },
    { id: 'spent', name: 'Spent Last', icon: '💳' },
    { id: 'average', name: 'Average', icon: '📊' },
  ];

  const handleStrategyClick = (strategyId) => {
    setSelectedStrategy(strategyId);
    setShowPreview(true);
  };

  const handleApply = () => {
    // This would trigger the actual auto-assign logic
    console.log(`Applying ${selectedStrategy} strategy`);
    // You would call a parent callback here
  };

  // Debug: confirm rendering
  console.log('🔥🔥🔥 AutoAssignView is DEFINITELY rendering!');

  return (
    <div
      style={{
        border: '5px solid red',
        padding: '20px',
        margin: '20px 0',
        background: 'rgba(255,0,0,0.2)',
      }}
    >
      <div
        style={{
          color: 'white',
          fontSize: '20px',
          fontWeight: 'bold',
          marginBottom: '10px',
        }}
      >
        🔥 AUTO-ASSIGN VIEW SHOULD BE HERE 🔥
      </div>

      <section style={styles.card}>
        {/* Card Header */}
        <button style={styles.cardRollup} onClick={() => setIsExpanded(!isExpanded)}>
          <span style={styles.rollupIcon}>{isExpanded ? '▼' : '►'}</span>
          <span style={styles.rollupText}>Auto-Assign</span>
        </button>

        {isExpanded && (
          <div style={styles.cardBody}>
            {/* Strategy Icons Row */}
            <div style={styles.strategiesRow}>
              {strategies.map((strategy) => (
                <button
                  key={strategy.id}
                  style={{
                    ...styles.strategyIcon,
                    ...(selectedStrategy === strategy.id ? styles.strategyIconActive : {}),
                  }}
                  onClick={() => handleStrategyClick(strategy.id)}
                  title={strategy.name}
                >
                  <span style={styles.strategyEmoji}>{strategy.icon}</span>
                </button>
              ))}
            </div>

            {/* Preview Section */}
            {showPreview && (
              <div style={styles.previewContainer}>
                <div style={styles.previewHeader}>
                  <span style={styles.previewTitle}>Auto-Assign Preview</span>
                  <button 
                    style={styles.applyButton} 
                    onClick={handleApply}
                  >
                    Apply
                  </button>
                </div>

                {/* Quality of Life Header */}
                <div style={styles.categoryHeader}>
                  <strong style={styles.categoryHeaderText}>Quality of Life</strong>
                </div>

                <ul style={styles.categoryList}>
                  {categories.slice(0, 3).map((item, index) => (
                    <li key={index} style={styles.categoryItem}>
                      <span style={styles.categoryName}>{item.name}</span>
                      <span style={styles.categoryAmount}>
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        }).format(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Stuff I Forgot To Budget Header */}
                <div style={styles.categoryHeader}>
                  <strong style={styles.categoryHeaderText}>Stuff I Forgot To Budget</strong>
                </div>

                <ul style={styles.categoryList}>
                  {categories.slice(3, 5).map((item, index) => (
                    <li key={index + 3} style={styles.categoryItem}>
                      <span style={styles.categoryName}>{item.name}</span>
                      <span style={styles.categoryAmount}>
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        }).format(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ready to Assign */}
            <div style={styles.readyToAssign}>
              <span style={styles.readyLabel}>Ready to Assign</span>
              <span style={styles.readyAmount}>
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(readyToAssign)}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

const styles = {
  card: {
    width: '100%',
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    overflow: 'hidden',
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
  },
  rollupIcon: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
  },
  rollupText: {
    flex: 1,
  },
  cardBody: {
    padding: '1rem',
  },
  strategiesRow: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  strategyIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#111827',
    border: '2px solid #374151',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.2rem',
    transition: 'all 0.2s ease',
  },
  strategyIconActive: {
    borderColor: '#3B82F6',
    background: 'rgba(59, 130, 246, 0.2)',
  },
  strategyEmoji: {
    fontSize: '1.2rem',
  },
  previewContainer: {
    background: '#111827',
    borderRadius: '0.5rem',
    padding: '1rem',
    marginBottom: '1rem',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  previewTitle: {
    fontSize: '0.9rem',
    fontWeight: '500',
    color: '#9CA3AF',
  },
  applyButton: {
    padding: '0.25rem 0.75rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  categoryHeader: {
    marginTop: '0.5rem',
    marginBottom: '0.5rem',
  },
  categoryHeaderText: {
    fontSize: '0.85rem',
    color: '#9CA3AF',
  },
  categoryList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  categoryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0',
    borderBottom: '1px solid #374151',
  },
  categoryName: {
    fontSize: '0.9rem',
    color: '#F3F4F6',
  },
  categoryAmount: {
    fontSize: '0.9rem',
    fontWeight: '500',
    color: '#4ADE80',
  },
  readyToAssign: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    background: '#111827',
    borderRadius: '0.5rem',
    marginTop: '0.5rem',
  },
  readyLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
  },
  readyAmount: {
    fontSize: '1rem',
    fontWeight: 'bold',
    color: '#4ADE80',
  },
};

export default AutoAssignView;