// src/views/SummaryView.jsx
import React, { useState, useEffect } from 'react';

const SummaryView = ({
  totalAvailable = 0,
  totalActivity = 0,
  totalAssigned = 0,
  unassigned = 0,
  month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
  categories = [],
  onAutoAssign = null
}) => {
  const [showAutoAssignOptions, setShowAutoAssignOptions] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState('underfunded');
  const [previewResults, setPreviewResults] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Calculate percentages for visual indicators
  const assignedPercentage = totalAvailable > 0 ? (totalAssigned / totalAvailable) * 100 : 0;

  // Auto-Assign Strategies
  const strategies = [
    {
      id: 'underfunded',
      name: 'Assign to Underfunded',
      description: 'Fund categories with targets or negative balances',
      icon: '🎯',
      color: '#3B82F6',
      priority: 1
    },
    {
      id: 'lastMonth',
      name: 'Last Month\'s Amount',
      description: 'Use amounts from last month',
      icon: '📅',
      color: '#8B5CF6',
      priority: 2
    },
    {
      id: 'average',
      name: 'Average Spending',
      description: 'Based on last 3 months average',
      icon: '📊',
      color: '#10B981',
      priority: 3
    },
    {
      id: 'reset',
      name: 'Reset Assigned',
      description: 'Clear all assigned amounts',
      icon: '🔄',
      color: '#F59E0B',
      priority: 4
    }
  ];

  // Priority-based categories (in real app, these would come from category settings)
  const getPriorityCategories = () => {
    const priorityGroups = {
      overspent: categories.filter(c => (c.available || 0) < 0),
      fixed: categories.filter(c => 
        ['Rent', 'Mortgage', 'Insurance', 'Utilities', 'Internet', 'Phone'].includes(c.name)
      ),
      variable: categories.filter(c => 
        ['Groceries', 'Food & Dining', 'Transportation', 'Gas'].includes(c.name)
      ),
      discretionary: categories.filter(c => 
        ['Shopping', 'Entertainment', 'Dining Out'].includes(c.name)
      ),
      savings: categories.filter(c => 
        ['Savings', 'Emergency Fund', 'Investments'].includes(c.name)
      )
    };
    return priorityGroups;
  };

  // Calculate auto-assign preview based on selected strategy
  const calculatePreview = (strategyId) => {
    setIsCalculating(true);
    
    if (!categories || categories.length === 0) {
      setPreviewResults(null);
      setIsCalculating(false);
      return;
    }

    let results = [];
    let totalToAssign = 0;
    let remainingFunds = unassigned;

    switch (strategyId) {
      case 'underfunded':
        // Follow priority order: overspent → fixed → variable → discretionary → savings
        const priorityGroups = getPriorityCategories();
        
        // 1. Fix overspent categories first
        priorityGroups.overspent.forEach(cat => {
          const needed = Math.abs(cat.available || 0);
          if (remainingFunds >= needed) {
            results.push({
              categoryId: cat.id,
              categoryName: cat.name,
              amount: needed,
              reason: 'Fix overspending',
              priority: 1
            });
            totalToAssign += needed;
            remainingFunds -= needed;
          }
        });

        // 2. Fund fixed expenses with targets
        priorityGroups.fixed.forEach(cat => {
          const target = cat.target_amount || 0;
          const assigned = cat.assigned || 0;
          const needed = Math.max(0, target - assigned);
          
          if (needed > 0 && remainingFunds >= needed) {
            results.push({
              categoryId: cat.id,
              categoryName: cat.name,
              amount: needed,
              reason: 'Fixed expense target',
              priority: 2
            });
            totalToAssign += needed;
            remainingFunds -= needed;
          }
        });

        // 3. Fund variable expenses (using average or target)
        priorityGroups.variable.forEach(cat => {
          const avgSpend = cat.average_spending || 0;
          const target = cat.target_amount || avgSpend;
          const assigned = cat.assigned || 0;
          const needed = Math.max(0, target - assigned);
          
          if (needed > 0 && remainingFunds >= needed) {
            results.push({
              categoryId: cat.id,
              categoryName: cat.name,
              amount: needed,
              reason: 'Variable expense',
              priority: 3
            });
            totalToAssign += needed;
            remainingFunds -= needed;
          }
        });

        // 4. Fund discretionary (using lower priority)
        priorityGroups.discretionary.forEach(cat => {
          const avgSpend = cat.average_spending || 0;
          const assigned = cat.assigned || 0;
          const needed = Math.max(0, avgSpend - assigned);
          
          if (needed > 0 && remainingFunds >= needed) {
            results.push({
              categoryId: cat.id,
              categoryName: cat.name,
              amount: needed,
              reason: 'Discretionary spending',
              priority: 4
            });
            totalToAssign += needed;
            remainingFunds -= needed;
          }
        });

        // 5. Fund savings goals
        priorityGroups.savings.forEach(cat => {
          const target = cat.target_amount || 0;
          const assigned = cat.assigned || 0;
          const needed = Math.max(0, target - assigned);
          
          if (needed > 0 && remainingFunds >= needed) {
            results.push({
              categoryId: cat.id,
              categoryName: cat.name,
              amount: needed,
              reason: 'Savings goal',
              priority: 5
            });
            totalToAssign += needed;
            remainingFunds -= needed;
          }
        });
        break;

      case 'lastMonth':
        // Use last month's assigned amounts
        categories.forEach(cat => {
          const lastMonthAmount = cat.last_month_assigned || 0;
          const currentAssigned = cat.assigned || 0;
          const needed = Math.max(0, lastMonthAmount - currentAssigned);
          
          if (needed > 0 && remainingFunds >= needed) {
            results.push({
              categoryId: cat.id,
              categoryName: cat.name,
              amount: needed,
              reason: 'Same as last month',
              priority: cat.priority || 3
            });
            totalToAssign += needed;
            remainingFunds -= needed;
          }
        });
        break;

      case 'average':
        // Use average spending from last 3 months
        categories.forEach(cat => {
          const avgSpend = cat.average_spending || 0;
          const currentAssigned = cat.assigned || 0;
          const needed = Math.max(0, avgSpend - currentAssigned);
          
          if (needed > 0 && remainingFunds >= needed) {
            results.push({
              categoryId: cat.id,
              categoryName: cat.name,
              amount: needed,
              reason: '3-month average',
              priority: cat.priority || 3
            });
            totalToAssign += needed;
            remainingFunds -= needed;
          }
        });
        break;

      case 'reset':
        // Clear all assigned amounts
        categories.forEach(cat => {
          if ((cat.assigned || 0) > 0) {
            results.push({
              categoryId: cat.id,
              categoryName: cat.name,
              amount: -cat.assigned,
              reason: 'Reset to zero',
              priority: 1
            });
            totalToAssign += -cat.assigned;
          }
        });
        break;

      default:
        break;
    }

    // Sort by priority
    results.sort((a, b) => (a.priority || 99) - (b.priority || 99));

    setPreviewResults({
      allocations: results,
      totalToAssign,
      remainingAfter: remainingFunds,
      strategy: strategyId
    });
    setIsCalculating(false);
  };

  // Handle strategy selection
  const handleStrategySelect = (strategyId) => {
    setSelectedStrategy(strategyId);
    calculatePreview(strategyId);
  };

  // Execute auto-assign
  const handleAutoAssign = () => {
    if (previewResults && onAutoAssign) {
      onAutoAssign(previewResults.allocations);
      setShowAutoAssignOptions(false);
      setPreviewResults(null);
    }
  };

  // Calculate category stats
  const getCategoryStats = () => {
    const totalCategories = categories.length;
    const fundedCategories = categories.filter(c => (c.assigned || 0) > 0).length;
    const overspentCategories = categories.filter(c => (c.available || 0) < 0).length;
    
    return { totalCategories, fundedCategories, overspentCategories };
  };

  const stats = getCategoryStats();

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Budget Summary</h2>
        <div style={styles.month}>{month}</div>
      </div>

      {/* Main Metrics */}
      <div style={styles.metricsContainer}>
        {/* Total Available */}
        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>💰</div>
          <div style={styles.metricContent}>
            <div style={styles.metricLabel}>Total Available</div>
            <div style={styles.metricValue}>
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(totalAvailable)}
            </div>
            <div style={styles.metricSubtext}>Ready to budget</div>
          </div>
        </div>

        {/* Activity */}
        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>📊</div>
          <div style={styles.metricContent}>
            <div style={styles.metricLabel}>Activity</div>
            <div style={styles.metricValue}>
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(totalActivity)}
            </div>
            <div style={styles.metricSubtext}>
              {totalActivity >= 0 ? 'Income' : 'Spending'}
            </div>
          </div>
        </div>

        {/* Assigned */}
        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>📋</div>
          <div style={styles.metricContent}>
            <div style={styles.metricLabel}>Assigned</div>
            <div style={styles.metricValue}>
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(totalAssigned)}
            </div>
            <div style={styles.metricSubtext}>
              {assignedPercentage.toFixed(1)}% of available
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={styles.progressSection}>
        <div style={styles.progressHeader}>
          <span style={styles.progressTitle}>Budget Utilization</span>
          <span style={styles.progressPercentage}>{assignedPercentage.toFixed(1)}%</span>
        </div>
        <div style={styles.progressBarBackground}>
          <div
            style={{
              ...styles.progressBarFill,
              width: `${Math.min(assignedPercentage, 100)}%`,
              backgroundColor: assignedPercentage > 100 ? '#F87171' : '#3B82F6'
            }}
          />
        </div>
      </div>

      {/* Quick Stats */}
      <div style={styles.statsGrid}>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Average Daily Spend</span>
          <span style={styles.statValue}>
            {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            }).format(totalActivity < 0 ? Math.abs(totalActivity) / 30 : 0)}
          </span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Categories Funded</span>
          <span style={styles.statValue}>{stats.fundedCategories}/{stats.totalCategories}</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Overspent</span>
          <span style={{...styles.statValue, color: stats.overspentCategories > 0 ? '#F87171' : '#4ADE80'}}>
            {stats.overspentCategories}
          </span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Budget Health</span>
          <span style={{
            ...styles.statValue,
            color: assignedPercentage <= 100 && stats.overspentCategories === 0 ? '#4ADE80' : '#F87171'
          }}>
            {assignedPercentage <= 100 && stats.overspentCategories === 0 ? 'Healthy' : 'Needs Attention'}
          </span>
        </div>
      </div>

      {/* Auto-Assign Section */}
      <div style={styles.autoAssignSection}>
        <div style={styles.autoAssignHeader}>
          <h3 style={styles.autoAssignTitle}>🤖 Smart Auto-Assign</h3>
          <button 
            style={styles.autoAssignToggle}
            onClick={() => setShowAutoAssignOptions(!showAutoAssignOptions)}
          >
            {showAutoAssignOptions ? '▼' : '▶'} {unassigned > 0 ? `${formatCurrency(unassigned)} to assign` : 'No funds to assign'}
          </button>
        </div>

        {showAutoAssignOptions && (
          <div style={styles.autoAssignOptions}>
            {/* Strategy Selection */}
            <div style={styles.strategyGrid}>
              {strategies.map(strategy => (
                <button
                  key={strategy.id}
                  style={{
                    ...styles.strategyCard,
                    borderColor: selectedStrategy === strategy.id ? strategy.color : '#0f2e1c',
                    background: selectedStrategy === strategy.id ? `${strategy.color}20` : '#0f2e1c'
                  }}
                  onClick={() => handleStrategySelect(strategy.id)}
                >
                  <span style={styles.strategyIcon}>{strategy.icon}</span>
                  <div style={styles.strategyContent}>
                    <div style={styles.strategyName}>{strategy.name}</div>
                    <div style={styles.strategyDescription}>{strategy.description}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Preview Results */}
            {isCalculating && (
              <div style={styles.calculating}>Calculating optimal allocation...</div>
            )}

            {previewResults && !isCalculating && (
              <div style={styles.previewContainer}>
                <div style={styles.previewHeader}>
                  <span style={styles.previewTitle}>Smart Allocation Preview</span>
                  <span style={styles.previewSummary}>
                    Total: {formatCurrency(previewResults.totalToAssign)} • 
                    Remaining: {formatCurrency(previewResults.remainingAfter)}
                  </span>
                </div>

                <div style={styles.previewList}>
                  {previewResults.allocations.map((item, index) => (
                    <div key={index} style={styles.previewItem}>
                      <div style={styles.previewItemInfo}>
                        <span style={styles.previewItemName}>{item.categoryName}</span>
                        <span style={styles.previewItemReason}>{item.reason}</span>
                      </div>
                      <div style={{
                        ...styles.previewItemAmount,
                        color: item.amount > 0 ? '#4ADE80' : '#F87171'
                      }}>
                        {item.amount > 0 ? '+' : ''}{formatCurrency(item.amount)}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={styles.previewActions}>
                  <button
                    style={styles.applyButton}
                    onClick={handleAutoAssign}
                    disabled={previewResults.totalToAssign > unassigned}
                  >
                    Apply Smart Allocation
                  </button>
                  <button
                    style={styles.cancelPreviewButton}
                    onClick={() => {
                      setShowAutoAssignOptions(false);
                      setPreviewResults(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>

                {previewResults.totalToAssign > unassigned && (
                  <div style={styles.warningMessage}>
                    ⚠️ Not enough funds for this allocation. Need {formatCurrency(previewResults.totalToAssign - unassigned)} more.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div style={styles.quickActions}>
        <h3 style={styles.quickActionsTitle}>Quick Actions</h3>
        <button
          style={styles.quickActionButton}
          onClick={() => {
            if (window.onAddIncomeClick) {
              window.onAddIncomeClick();
            }
          }}
        >
          <span style={styles.quickActionIcon}>💰</span>
          <span>Add Income</span>
        </button>
        <button
          style={styles.quickActionButton}
          onClick={() => {
            if (window.onRecordPaymentClick) {
              window.onRecordPaymentClick();
            }
          }}
        >
          <span style={styles.quickActionIcon}>💳</span>
          <span>Record Payment</span>
        </button>
        <button
          style={styles.quickActionButton}
          onClick={() => {
            if (window.onMoveMoneyClick) {
              window.onMoveMoneyClick();
            }
          }}
        >
          <span style={styles.quickActionIcon}>🔄</span>
          <span>Move Money</span>
        </button>
      </div>
    </div>
  );
};

// Helper function for currency formatting
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

const styles = {
  container: {
    width: '100%',
    maxWidth: '400px',
    background: '#0f2e1c',
    borderRadius: '1rem',
    padding: '1.5rem',
    border: '1px solid #374151',
    position: 'sticky',
    top: '2rem'
  },
  header: {
    marginBottom: '1.5rem'
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'white',
    margin: '0 0 0.25rem 0'
  },
  month: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  metricsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '1.5rem'
  },
  metricCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '1rem',
    background: '#0f2e1c',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  metricIcon: {
    fontSize: '2rem'
  },
  metricContent: {
    flex: 1
  },
  metricLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem'
  },
  metricValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white',
    lineHeight: '1.2'
  },
  metricSubtext: {
    fontSize: '0.75rem',
    color: '#6B7280',
    marginTop: '0.25rem'
  },
  progressSection: {
    marginBottom: '1.5rem'
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem'
  },
  progressTitle: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  progressPercentage: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: 'white'
  },
  progressBarBackground: {
    height: '8px',
    background: '#374151',
    borderRadius: '4px',
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
    marginBottom: '1.5rem'
  },
  statItem: {
    padding: '0.75rem',
    background: '#0f2e1c',
    borderRadius: '0.5rem',
    textAlign: 'center'
  },
  statLabel: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem'
  },
  statValue: {
    fontSize: '1rem',
    fontWeight: '600',
    color: 'white'
  },
  autoAssignSection: {
    marginBottom: '1.5rem',
    background: '#0f2e1c',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    overflow: 'hidden'
  },
  autoAssignHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    background: '#0f2e1c',
    borderBottom: '1px solid #374151',
    cursor: 'pointer'
  },
  autoAssignTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: 'white',
    margin: 0
  },
  autoAssignToggle: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '0.9rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem'
  },
  autoAssignOptions: {
    padding: '1rem'
  },
  strategyGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '0.75rem',
    marginBottom: '1rem'
  },
  strategyCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem',
    background: '#111827',
    border: '2px solid #374151',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s ease'
  },
  strategyIcon: {
    fontSize: '1.5rem'
  },
  strategyContent: {
    flex: 1
  },
  strategyName: {
    fontSize: '0.95rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '0.25rem'
  },
  strategyDescription: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  calculating: {
    padding: '1rem',
    textAlign: 'center',
    color: '#9CA3AF',
    fontStyle: 'italic'
  },
  previewContainer: {
    marginTop: '1rem',
    padding: '1rem',
    background: '#111827',
    borderRadius: '0.5rem',
    border: '1px solid #374151'
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
  },
  previewTitle: {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#3B82F6'
  },
  previewSummary: {
    fontSize: '0.8rem',
    color: '#9CA3AF'
  },
  previewList: {
    maxHeight: '200px',
    overflowY: 'auto',
    marginBottom: '1rem'
  },
  previewItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0',
    borderBottom: '1px solid #374151'
  },
  previewItemInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  previewItemName: {
    fontSize: '0.9rem',
    fontWeight: '500',
    color: 'white'
  },
  previewItemReason: {
    fontSize: '0.7rem',
    color: '#9CA3AF'
  },
  previewItemAmount: {
    fontSize: '0.9rem',
    fontWeight: '600'
  },
  previewActions: {
    display: 'flex',
    gap: '0.5rem'
  },
  applyButton: {
    flex: 1,
    padding: '0.5rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.25rem',
    fontSize: '0.85rem',
    fontWeight: '500',
    cursor: 'pointer',
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  },
  cancelPreviewButton: {
    flex: 1,
    padding: '0.5rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.25rem',
    fontSize: '0.85rem',
    cursor: 'pointer'
  },
  warningMessage: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #EF4444',
    borderRadius: '0.25rem',
    color: '#EF4444',
    fontSize: '0.8rem',
    textAlign: 'center'
  },
  quickActions: {
    borderTop: '1px solid #374151',
    paddingTop: '1.5rem'
  },
  quickActionsTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '1rem'
  },
  quickActionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    padding: '0.75rem',
    background: '#0f2e1c',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.95rem',
    marginBottom: '0.5rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      background: '#374151'
    }
  },
  quickActionIcon: {
    fontSize: '1.1rem'
  }
};

export default SummaryView;