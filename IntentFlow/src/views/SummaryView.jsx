// src/views/SummaryView.jsx
import React, { useState, useEffect, useCallback } from 'react';

const SummaryView = ({
  totalAvailable = 0,
  totalActivity = 0,
  totalAssigned = 0,
  unassigned = 0,
  month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
  categories = [],
  onAutoAssign = null,
  underfundedTotal = 0,
}) => {
  const [showAutoAssignOptions, setShowAutoAssignOptions] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState('priority_weighted');
  const [previewResults, setPreviewResults] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [priorityWeights, setPriorityWeights] = useState({
    urgency: 0.4,
    importance: 0.35,
    risk: 0.25
  });

  // Format currency helper
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // ==================== YNAB CONSTRAINT ENGINE ====================
  
  /**
   * Calculate Required Contribution based on target type
   * This is the core constraint engine
   */
  const calculateRequiredContribution = useCallback((category) => {
    if (!category.target_amount || category.target_amount === 0) {
      return { needed: 0, type: 'none', priority: 0 };
    }

    const assigned = category.assigned || 0;
    const activity = category.activity || 0;
    const available = assigned + activity;
    const targetAmount = category.target_amount;

    switch (category.target_type) {
      // 🎯 Target Savings Balance - "I want $X total"
      case 'target_balance':
      case 'balance':
        const needed = Math.max(0, targetAmount - available);
        const progress = (available / targetAmount) * 100;
        return {
          needed,
          type: 'target_balance',
          priority: progress < 30 ? 1 : progress < 70 ? 2 : 3,
          urgency: 1 - (available / targetAmount),
          message: `Need ${formatCurrency(needed)} to reach ${formatCurrency(targetAmount)}`
        };

      // 📅 Needed for Spending (by date) - Dynamic amortization
      case 'target_balance_by_date':
      case 'by_date':
        if (!category.target_date) return { needed: 0, type: 'by_date', priority: 0 };
        
        const today = new Date();
        const targetDate = new Date(category.target_date);
        const monthsRemaining = Math.max(0, (targetDate.getFullYear() - today.getFullYear()) * 12 + 
          (targetDate.getMonth() - today.getMonth()));
        
        const totalNeeded = Math.max(0, targetAmount - available);
        const monthlyNeeded = monthsRemaining > 0 ? totalNeeded / monthsRemaining : totalNeeded;
        const dateProgress = (available / targetAmount) * 100;
        
        return {
          needed: monthlyNeeded,
          totalNeeded,
          type: 'by_date',
          priority: monthsRemaining <= 1 ? 1 : monthsRemaining <= 3 ? 2 : 3,
          urgency: 1 / Math.max(1, monthsRemaining),
          message: `Need ${formatCurrency(monthlyNeeded)}/month for ${monthsRemaining} months`
        };

      // 🔁 Monthly Funding Goal - "I need $X every month"
      case 'needed_for_spending':
      case 'monthly':
        const monthlyNeededAmount = Math.max(0, targetAmount - assigned);
        const monthlyProgress = (assigned / targetAmount) * 100;
        return {
          needed: monthlyNeededAmount,
          type: 'monthly',
          priority: monthlyProgress < 50 ? 1 : monthlyProgress < 100 ? 2 : 3,
          urgency: 1 - (assigned / targetAmount),
          message: `Need ${formatCurrency(monthlyNeededAmount)} for this month`
        };

      // 💰 Monthly Savings Builder - Fixed amount each month
      case 'monthly_savings_builder':
        const builderNeeded = Math.max(0, targetAmount - assigned);
        return {
          needed: builderNeeded,
          type: 'savings_builder',
          priority: 2,
          urgency: 0.5,
          message: `Set aside ${formatCurrency(targetAmount)} this month`
        };

      default:
        return { needed: 0, type: 'none', priority: 0 };
    }
  }, [formatCurrency]);

  /**
   * Calculate Priority Score = Urgency × Importance × Risk
   * This creates a weighted score for smart allocation
   */
  const calculatePriorityScore = useCallback((category) => {
    const constraint = calculateRequiredContribution(category);
    if (constraint.needed <= 0) return 0;

    // Overspent categories get highest urgency
    const isOverspent = (category.available || 0) < 0;
    if (isOverspent) return 100;

    // Base urgency from constraint
    let urgency = constraint.urgency || 0;
    
    // Importance based on target type
    let importance = 0;
    switch (constraint.type) {
      case 'by_date':
        importance = 1.0; // Highest - time-bound
        break;
      case 'monthly':
        importance = 0.8; // High - recurring
        break;
      case 'target_balance':
        importance = 0.6; // Medium - savings
        break;
      case 'savings_builder':
        importance = 0.5; // Medium-low
        break;
      default:
        importance = 0.3;
    }

    // Risk factor (how far behind vs time remaining)
    let risk = 0;
    if (constraint.type === 'by_date' && constraint.totalNeeded) {
      const monthsRemaining = category.target_date ? 
        Math.max(0, (new Date(category.target_date) - new Date()) / (1000 * 60 * 60 * 24 * 30)) : 1;
      risk = Math.min(1, constraint.totalNeeded / (constraint.totalNeeded + (category.available || 0)));
      if (monthsRemaining <= 1) risk *= 1.5;
    } else {
      risk = Math.min(1, constraint.needed / (constraint.needed + (category.assigned || 0)));
    }

    // Weighted score
    const score = (urgency * priorityWeights.urgency) + 
                  (importance * priorityWeights.importance) + 
                  (risk * priorityWeights.risk);
    
    return Math.min(100, Math.max(0, score * 100));
  }, [calculateRequiredContribution, priorityWeights]);

  /**
   * Smart Allocation Engine - Distributes funds to maximize goal satisfaction
   */
  const generateSmartAllocation = useCallback(() => {
    setIsCalculating(true);
    
    let remainingFunds = unassigned;
    const results = [];
    
    // Get all categories that need funding
    const categoriesToFund = categories.filter(cat => {
      if (cat.archived) return false;
      const constraint = calculateRequiredContribution(cat);
      return constraint.needed > 0;
    });
    
    // Calculate priority scores for each category
    const scoredCategories = categoriesToFund.map(cat => ({
      ...cat,
      priorityScore: calculatePriorityScore(cat),
      constraint: calculateRequiredContribution(cat)
    }));
    
    // Sort by priority score (highest first)
    scoredCategories.sort((a, b) => b.priorityScore - a.priorityScore);
    
    // Allocate funds
    for (const cat of scoredCategories) {
      if (remainingFunds <= 0) break;
      
      const needed = cat.constraint.needed;
      const amountToFund = Math.min(needed, remainingFunds);
      
      if (amountToFund > 0) {
        results.push({
          categoryId: cat.id,
          categoryName: cat.name,
          amount: amountToFund,
          needed: needed,
          priorityScore: cat.priorityScore,
          targetType: cat.constraint.type,
          targetMessage: cat.constraint.message,
          urgency: cat.constraint.urgency,
          progress: cat.target_amount ? ((cat.assigned || 0) / cat.target_amount) * 100 : 0
        });
        remainingFunds -= amountToFund;
      }
    }
    
    const totalToAssign = results.reduce((sum, item) => sum + item.amount, 0);
    
    setPreviewResults({
      allocations: results,
      totalToAssign,
      remainingAfter: remainingFunds,
      strategy: 'priority_weighted',
      categoriesCount: results.length,
      message: results.length === 0 ? '🎉 All goals are on track!' : null
    });
    
    setIsCalculating(false);
  }, [categories, unassigned, calculateRequiredContribution, calculatePriorityScore]);

  /**
   * Underfunded Only Strategy - Fund only categories that are behind
   */
  const generateUnderfundedAllocation = useCallback(() => {
    setIsCalculating(true);
    
    let remainingFunds = unassigned;
    const results = [];
    
    const underfundedCategories = categories.filter(cat => {
      if (cat.archived) return false;
      const constraint = calculateRequiredContribution(cat);
      return constraint.needed > 0 && constraint.needed > 0;
    });
    
    for (const cat of underfundedCategories) {
      if (remainingFunds <= 0) break;
      
      const constraint = calculateRequiredContribution(cat);
      const amountToFund = Math.min(constraint.needed, remainingFunds);
      
      if (amountToFund > 0) {
        results.push({
          categoryId: cat.id,
          categoryName: cat.name,
          amount: amountToFund,
          needed: constraint.needed,
          targetType: constraint.type,
          targetMessage: constraint.message
        });
        remainingFunds -= amountToFund;
      }
    }
    
    setPreviewResults({
      allocations: results,
      totalToAssign: results.reduce((sum, item) => sum + item.amount, 0),
      remainingAfter: remainingFunds,
      strategy: 'underfunded',
      categoriesCount: results.length
    });
    
    setIsCalculating(false);
  }, [categories, unassigned, calculateRequiredContribution]);

  /**
   * Deadline Driven Strategy - Prioritize by closest deadline
   */
  const generateDeadlineAllocation = useCallback(() => {
    setIsCalculating(true);
    
    let remainingFunds = unassigned;
    const results = [];
    
    const byDateCategories = categories.filter(cat => 
      (cat.target_type === 'target_balance_by_date' || cat.target_type === 'by_date') &&
      cat.target_date && cat.target_amount > 0
    ).sort((a, b) => new Date(a.target_date) - new Date(b.target_date));
    
    for (const cat of byDateCategories) {
      if (remainingFunds <= 0) break;
      
      const constraint = calculateRequiredContribution(cat);
      const amountToFund = Math.min(constraint.needed, remainingFunds);
      
      if (amountToFund > 0) {
        results.push({
          categoryId: cat.id,
          categoryName: cat.name,
          amount: amountToFund,
          needed: constraint.needed,
          targetType: constraint.type,
          targetMessage: constraint.message,
          deadline: cat.target_date
        });
        remainingFunds -= amountToFund;
      }
    }
    
    setPreviewResults({
      allocations: results,
      totalToAssign: results.reduce((sum, item) => sum + item.amount, 0),
      remainingAfter: remainingFunds,
      strategy: 'deadline',
      categoriesCount: results.length
    });
    
    setIsCalculating(false);
  }, [categories, unassigned, calculateRequiredContribution]);

  /**
   * Last Month Strategy - Match previous month's assignments
   */
  const generateLastMonthAllocation = useCallback(() => {
    setIsCalculating(true);
    
    let remainingFunds = unassigned;
    const results = [];
    
    for (const cat of categories) {
      if (remainingFunds <= 0) break;
      
      const lastMonthAmount = cat.last_month_assigned || 0;
      const currentAssigned = cat.assigned || 0;
      const needed = Math.max(0, lastMonthAmount - currentAssigned);
      
      if (needed > 0 && remainingFunds >= needed) {
        results.push({
          categoryId: cat.id,
          categoryName: cat.name,
          amount: needed,
          needed: needed,
          targetMessage: `Last month: ${formatCurrency(lastMonthAmount)}`
        });
        remainingFunds -= needed;
      }
    }
    
    setPreviewResults({
      allocations: results,
      totalToAssign: results.reduce((sum, item) => sum + item.amount, 0),
      remainingAfter: remainingFunds,
      strategy: 'lastMonth',
      categoriesCount: results.length
    });
    
    setIsCalculating(false);
  }, [categories, unassigned, formatCurrency]);

  /**
   * Reset Strategy - Clear all assigned amounts
   */
  const generateResetAllocation = useCallback(() => {
    setIsCalculating(true);
    
    const results = [];
    for (const cat of categories) {
      const currentAssigned = cat.assigned || 0;
      if (currentAssigned !== 0) {
        results.push({
          categoryId: cat.id,
          categoryName: cat.name,
          amount: -currentAssigned,
          targetMessage: `Reset to zero (was ${formatCurrency(currentAssigned)})`
        });
      }
    }
    
    setPreviewResults({
      allocations: results,
      totalToAssign: -Math.abs(results.reduce((sum, item) => sum + item.amount, 0)),
      remainingAfter: unassigned + Math.abs(results.reduce((sum, item) => sum + item.amount, 0)),
      strategy: 'reset',
      categoriesCount: results.length
    });
    
    setIsCalculating(false);
  }, [categories, unassigned, formatCurrency]);

  // Strategies configuration
  const strategies = [
    {
      id: 'priority_weighted',
      name: '🎯 Smart Priority Engine',
      description: `Intelligent allocation based on urgency × importance × risk`,
      icon: '🧠',
      color: '#8B5CF6',
      action: generateSmartAllocation
    },
    {
      id: 'underfunded',
      name: '💰 Fund Underfunded',
      description: `Complete all targets (${formatCurrency(underfundedTotal)} needed)`,
      icon: '💰',
      color: '#3B82F6',
      action: generateUnderfundedAllocation
    },
    {
      id: 'deadline',
      name: '⏰ Deadline Driven',
      description: 'Prioritize goals with closest deadlines',
      icon: '⏰',
      color: '#EF4444',
      action: generateDeadlineAllocation
    },
    {
      id: 'lastMonth',
      name: '📅 Last Month\'s Amount',
      description: 'Use amounts from last month',
      icon: '📅',
      color: '#06B6D4',
      action: generateLastMonthAllocation
    },
    {
      id: 'reset',
      name: '🔄 Reset All Assigned',
      description: 'Clear all assigned amounts to zero',
      icon: '🔄',
      color: '#F59E0B',
      action: generateResetAllocation
    }
  ];

  // Handle strategy selection
  const handleStrategySelect = (strategyId) => {
    setSelectedStrategy(strategyId);
    const strategy = strategies.find(s => s.id === strategyId);
    if (strategy && strategy.action) {
      strategy.action();
    }
  };

  // Execute auto-assign
  const handleAutoAssign = () => {
    if (previewResults && onAutoAssign) {
      if (previewResults.strategy === 'reset') {
        const totalResetAmount = Math.abs(previewResults.totalToAssign);
        const confirmation = confirm(
          `⚠️ RESET ALL ASSIGNED AMOUNTS ⚠️\n\n` +
          `This will reset ${previewResults.allocations.length} categories to $0 assigned.\n` +
          `Total amount freed up: ${formatCurrency(totalResetAmount)}\n\n` +
          `This action will:\n` +
          `• Set all category assigned amounts to $0\n` +
          `• Increase Ready to Assign by ${formatCurrency(totalResetAmount)}\n` +
          `• NOT affect transaction history or activity\n\n` +
          `Are you sure you want to continue?`
        );
        if (!confirmation) return;
      }
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
    const onTrackCategories = categories.filter(c => {
      const constraint = calculateRequiredContribution(c);
      return constraint.needed === 0;
    }).length;
    
    return { totalCategories, fundedCategories, overspentCategories, onTrackCategories };
  };

  const assignedPercentage = totalAvailable > 0 ? (totalAssigned / totalAvailable) * 100 : 0;
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
        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>💰</div>
          <div style={styles.metricContent}>
            <div style={styles.metricLabel}>Ready to Assign</div>
            <div style={{
              ...styles.metricValue,
              color: unassigned >= 0 ? '#4ADE80' : '#F87171'
            }}>
              {formatCurrency(unassigned)}
            </div>
            <div style={styles.metricSubtext}>
              {unassigned >= 0 ? 'Available to budget' : 'Overspending detected'}
            </div>
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>📊</div>
          <div style={styles.metricContent}>
            <div style={styles.metricLabel}>Total Activity</div>
            <div style={styles.metricValue}>{formatCurrency(totalActivity)}</div>
            <div style={styles.metricSubtext}>{totalActivity >= 0 ? 'Income' : 'Spending'}</div>
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>📋</div>
          <div style={styles.metricContent}>
            <div style={styles.metricLabel}>Total Assigned</div>
            <div style={styles.metricValue}>{formatCurrency(totalAssigned)}</div>
            <div style={styles.metricSubtext}>{assignedPercentage.toFixed(1)}% of available</div>
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
          <span style={styles.statLabel}>Goals On Track</span>
          <span style={{ ...styles.statValue, color: '#4ADE80' }}>
            {stats.onTrackCategories}/{stats.totalCategories}
          </span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Categories Funded</span>
          <span style={styles.statValue}>{stats.fundedCategories}/{stats.totalCategories}</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Overspent</span>
          <span style={{ ...styles.statValue, color: stats.overspentCategories > 0 ? '#F87171' : '#4ADE80' }}>
            {stats.overspentCategories}
          </span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Underfunded</span>
          <span style={{ ...styles.statValue, color: underfundedTotal > 0 ? '#F59E0B' : '#4ADE80' }}>
            {formatCurrency(underfundedTotal)}
          </span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Budget Health</span>
          <span style={{
            ...styles.statValue,
            color: assignedPercentage <= 100 && stats.overspentCategories === 0 && underfundedTotal === 0 ? '#4ADE80' : '#F87171'
          }}>
            {assignedPercentage <= 100 && stats.overspentCategories === 0 && underfundedTotal === 0 ? 'Healthy' : 'Needs Attention'}
          </span>
        </div>
      </div>

      {/* Smart Auto-Assign Section */}
      <div style={styles.autoAssignSection}>
        <div style={styles.autoAssignHeader}>
          <h3 style={styles.autoAssignTitle}>🧠 Smart Auto-Assign</h3>
          <button
            style={styles.autoAssignToggle}
            onClick={() => setShowAutoAssignOptions(!showAutoAssignOptions)}
          >
            {showAutoAssignOptions ? '▼' : '▶'}
            {unassigned > 0
              ? `${formatCurrency(unassigned)} to assign`
              : unassigned < 0
                ? `Overspent ${formatCurrency(Math.abs(unassigned))}`
                : 'No funds to assign'}
            {underfundedTotal > 0 && unassigned > 0 && (
              <span style={{ color: '#F59E0B', marginLeft: '8px', fontSize: '0.7rem' }}>
                (${underfundedTotal.toFixed(0)} needed)
              </span>
            )}
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
                    borderColor: selectedStrategy === strategy.id ? strategy.color : '#374151',
                    background: selectedStrategy === strategy.id ? `${strategy.color}20` : '#111827'
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

            {/* Priority Weight Sliders (only for smart priority engine) */}
            {selectedStrategy === 'priority_weighted' && (
              <div style={styles.weightControls}>
                <div style={styles.weightLabel}>Priority Weights:</div>
                <div style={styles.sliderGroup}>
                  <label>Urgency: {(priorityWeights.urgency * 100).toFixed(0)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={priorityWeights.urgency}
                    onChange={(e) => setPriorityWeights({
                      ...priorityWeights,
                      urgency: parseFloat(e.target.value),
                      importance: 1 - parseFloat(e.target.value) - priorityWeights.risk
                    })}
                    style={styles.slider}
                  />
                </div>
                <div style={styles.sliderGroup}>
                  <label>Importance: {(priorityWeights.importance * 100).toFixed(0)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={priorityWeights.importance}
                    onChange={(e) => setPriorityWeights({
                      ...priorityWeights,
                      importance: parseFloat(e.target.value),
                      urgency: 1 - parseFloat(e.target.value) - priorityWeights.risk
                    })}
                    style={styles.slider}
                  />
                </div>
                <div style={styles.sliderGroup}>
                  <label>Risk: {(priorityWeights.risk * 100).toFixed(0)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={priorityWeights.risk}
                    onChange={(e) => setPriorityWeights({
                      ...priorityWeights,
                      risk: parseFloat(e.target.value),
                      urgency: 1 - priorityWeights.importance - parseFloat(e.target.value)
                    })}
                    style={styles.slider}
                  />
                </div>
              </div>
            )}

            {/* Loading State */}
            {isCalculating && (
              <div style={styles.calculating}>
                <div style={styles.spinner}></div>
                <span>Analyzing goals and creating optimal funding plan...</span>
              </div>
            )}

            {/* Preview Results */}
            {previewResults && !isCalculating && (
              <div style={styles.previewContainer}>
                <div style={styles.previewHeader}>
                  <div>
                    <span style={styles.previewTitle}>
                      {previewResults.strategy === 'priority_weighted' ? '🧠 Smart Priority Plan' :
                       previewResults.strategy === 'underfunded' ? '💰 Underfunded Categories' :
                       previewResults.strategy === 'deadline' ? '⏰ Deadline Driven' :
                       previewResults.strategy === 'lastMonth' ? '📅 Last Month' : '🔄 Reset Plan'}
                    </span>
                    {previewResults.message && (
                      <div style={styles.previewMessage}>{previewResults.message}</div>
                    )}
                  </div>
                  <span style={styles.previewSummary}>
                    {previewResults.strategy === 'reset' ? (
                      <>
                        Freed: {formatCurrency(Math.abs(previewResults.totalToAssign))} →
                        New RTA: {formatCurrency(previewResults.remainingAfter)}
                      </>
                    ) : (
                      <>
                        Total: {formatCurrency(previewResults.totalToAssign)} •
                        Remaining: {formatCurrency(previewResults.remainingAfter)} •
                        {previewResults.categoriesCount} categories
                      </>
                    )}
                  </span>
                </div>

                {previewResults.allocations.length > 0 && (
                  <div style={styles.previewList}>
                    {previewResults.allocations.slice(0, 10).map((item, index) => (
                      <div key={index} style={styles.previewItem}>
                        <div style={styles.previewItemInfo}>
                          <span style={styles.previewItemName}>{item.categoryName}</span>
                          {item.targetMessage && (
                            <span style={styles.previewItemReason}>{item.targetMessage}</span>
                          )}
                          {item.priorityScore !== undefined && (
                            <div style={styles.priorityBadge}>
                              Score: {Math.round(item.priorityScore)}
                            </div>
                          )}
                          {item.progress !== undefined && (
                            <div style={styles.previewProgressBar}>
                              <div style={{
                                ...styles.previewProgressFill,
                                width: `${item.progress}%`,
                                backgroundColor: item.progress >= 100 ? '#10B981' : 
                                               item.progress >= 75 ? '#3B82F6' : 
                                               item.progress >= 50 ? '#F59E0B' : '#EF4444'
                              }} />
                            </div>
                          )}
                        </div>
                        <div style={{
                          ...styles.previewItemAmount,
                          color: item.amount > 0 ? '#4ADE80' : '#F87171'
                        }}>
                          {item.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(item.amount))}
                        </div>
                      </div>
                    ))}
                    {previewResults.allocations.length > 10 && (
                      <div style={styles.previewMore}>
                        ...and {previewResults.allocations.length - 10} more categories
                      </div>
                    )}
                  </div>
                )}

                <div style={styles.previewActions}>
                  <button
                    style={{
                      ...styles.applyButton,
                      backgroundColor: previewResults.strategy === 'reset' ? '#F59E0B' : '#8B5CF6'
                    }}
                    onClick={handleAutoAssign}
                    disabled={previewResults.allocations.length === 0}
                  >
                    {previewResults.strategy === 'reset' ? '🔄 Reset All Assigned' : '✓ Apply Smart Allocation'}
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

                {previewResults.strategy !== 'reset' && previewResults.totalToAssign > unassigned && unassigned > 0 && (
                  <div style={styles.warningMessage}>
                    ⚠️ Insufficient funds: Need {formatCurrency(previewResults.totalToAssign - unassigned)} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== STYLES ====================
const styles = {
  container: {
    width: '100%',
    maxWidth: '400px',
    background: '#0047AB',
    borderRadius: '1rem',
    padding: '1.5rem',
    border: '1px solid #374151',
    position: 'sticky',
    top: '2rem'
  },
  header: { marginBottom: '1.5rem' },
  title: { fontSize: '1.25rem', fontWeight: '600', color: 'white', margin: '0 0 0.25rem 0' },
  month: { fontSize: '0.875rem', color: '#000000' },
  metricsContainer: { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' },
  metricCard: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: '#0A2472', borderRadius: '0.75rem', border: '1px solid #0A2472' },
  metricIcon: { fontSize: '2rem' },
  metricContent: { flex: 1 },
  metricLabel: { fontSize: '0.875rem', color: '#9CA3AF', marginBottom: '0.25rem' },
  metricValue: { fontSize: '1.5rem', fontWeight: 'bold', color: 'white', lineHeight: '1.2' },
  metricSubtext: { fontSize: '0.75rem', color: '#6B7280', marginTop: '0.25rem' },
  progressSection: { marginBottom: '1.5rem' },
  progressHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' },
  progressTitle: { fontSize: '0.875rem', color: '#0A2472' },
  progressPercentage: { fontSize: '0.875rem', fontWeight: '600', color: 'white' },
  progressBarBackground: { height: '8px', background: '#0A2472', borderRadius: '4px', overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: '4px', transition: 'width 0.3s ease' },
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' },
  statItem: { padding: '0.75rem', background: '#0A2472', borderRadius: '0.5rem', textAlign: 'center' },
  statLabel: { display: 'block', fontSize: '0.75rem', color: '#9CA3AF', marginBottom: '0.25rem' },
  statValue: { fontSize: '1rem', fontWeight: '600', color: 'white' },
  autoAssignSection: { marginBottom: '1.5rem', background: '#0A2472', borderRadius: '0.75rem', border: '1px solid #374151', overflow: 'hidden' },
  autoAssignHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#0A2472', borderBottom: '1px solid #0A2472', cursor: 'pointer' },
  autoAssignTitle: { fontSize: '1rem', fontWeight: '600', color: 'white', margin: 0 },
  autoAssignToggle: { background: '#0A2472', border: 'none', color: '#9CA3AF', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' },
  autoAssignOptions: { padding: '1rem' },
  strategyGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', marginBottom: '1rem' },
  strategyCard: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: '#111827', border: '2px solid #374151', borderRadius: '0.5rem', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s ease' },
  strategyIcon: { fontSize: '1.5rem' },
  strategyContent: { flex: 1 },
  strategyName: { fontSize: '0.95rem', fontWeight: '600', color: 'white', marginBottom: '0.25rem' },
  strategyDescription: { fontSize: '0.75rem', color: '#9CA3AF' },
  weightControls: { background: '#0F172A', padding: '12px', borderRadius: '8px', marginBottom: '12px' },
  weightLabel: { fontSize: '12px', color: '#94A3B8', marginBottom: '8px' },
  sliderGroup: { marginBottom: '8px' },
  slider: { width: '100%', margin: '4px 0' },
  calculating: { padding: '1rem', textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' },
  spinner: { width: '16px', height: '16px', border: '2px solid #374151', borderTopColor: '#8B5CF6', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  previewContainer: { marginTop: '1rem', padding: '1rem', background: '#111827', borderRadius: '0.5rem', border: '1px solid #374151' },
  previewHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' },
  previewTitle: { fontSize: '0.9rem', fontWeight: '600', color: '#8B5CF6' },
  previewMessage: { fontSize: '0.7rem', color: '#4ADE80', marginTop: '0.25rem' },
  previewSummary: { fontSize: '0.7rem', color: '#9CA3AF' },
  previewList: { maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' },
  previewItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #374151' },
  previewItemInfo: { flex: 1, marginRight: '1rem' },
  previewItemName: { fontSize: '0.85rem', fontWeight: '500', color: 'white', display: 'block' },
  previewItemReason: { fontSize: '0.65rem', color: '#9CA3AF', display: 'block' },
  priorityBadge: { fontSize: '0.6rem', color: '#8B5CF6', marginTop: '2px' },
  previewProgressBar: { marginTop: '0.25rem', height: '3px', background: '#374151', borderRadius: '2px', overflow: 'hidden' },
  previewProgressFill: { height: '100%', borderRadius: '2px', transition: 'width 0.2s ease' },
  previewItemAmount: { fontSize: '0.85rem', fontWeight: '600', whiteSpace: 'nowrap' },
  previewMore: { textAlign: 'center', padding: '0.5rem', color: '#9CA3AF', fontSize: '0.7rem', fontStyle: 'italic' },
  previewActions: { display: 'flex', gap: '0.5rem' },
  applyButton: { flex: 1, padding: '0.5rem', background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '0.25rem', fontSize: '0.8rem', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' },
  cancelPreviewButton: { flex: 1, padding: '0.5rem', background: '#4B5563', color: 'white', border: 'none', borderRadius: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' },
  warningMessage: { marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #EF4444', borderRadius: '0.25rem', color: '#EF4444', fontSize: '0.7rem', textAlign: 'center' }
};

// Add keyframe animation
if (typeof document !== 'undefined') {
  const styleId = 'summary-spinner';
  if (!document.getElementById(styleId)) {
    const styleSheet = document.createElement('style');
    styleSheet.id = styleId;
    styleSheet.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(styleSheet);
  }
}

export default SummaryView;