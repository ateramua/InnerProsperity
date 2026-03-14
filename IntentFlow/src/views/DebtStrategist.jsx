// src/views/DebtStrategist.jsx
import React, { useState, useEffect } from 'react';
const { DebtTypes, RepaymentStrategies, RiskLevels, createDebtFromLoan, createDebtFromCreditCard } = require('../types/debtTypes');

export default function DebtStrategist({ 
  creditCards = [], 
  loans = [],
  onPaymentPlanned,
  onMoveMoney,
  onViewDebtDetails,
  onViewDashboard,
  monthlyBudget = 1000 // Available monthly for debt payments
}) {
  const [allDebts, setAllDebts] = useState([]);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [strategy, setStrategy] = useState(RepaymentStrategies.AVALANCHE);
  const [monthlyAllocation, setMonthlyAllocation] = useState(monthlyBudget);
  const [showCombined, setShowCombined] = useState(true);

  // Combine credit cards and loans into unified debts
  useEffect(() => {
    const debts = [
      ...creditCards.map(createDebtFromCreditCard),
      ...loans.map(createDebtFromLoan)
    ];
    setAllDebts(debts);
  }, [creditCards, loans]);

  // Calculate repayment order based on strategy
  const getPrioritizedDebts = () => {
    const debts = [...allDebts];
    
    if (strategy === RepaymentStrategies.AVALANCHE) {
      return debts.sort((a, b) => b.interestRate - a.interestRate);
    } else if (strategy === RepaymentStrategies.SNOWBALL) {
      return debts.sort((a, b) => a.balance - b.balance);
    } else {
      // Hybrid: consider both rate and balance
      return debts.sort((a, b) => {
        const scoreA = a.interestRate * 0.7 + (1 / a.balance) * 0.3;
        const scoreB = b.interestRate * 0.7 + (1 / b.balance) * 0.3;
        return scoreB - scoreA;
      });
    }
  };

  // Calculate optimal payment distribution
  const calculatePaymentPlan = () => {
    const prioritized = getPrioritizedDebts();
    let remainingBudget = monthlyAllocation;
    const plan = [];

    // First, ensure minimum payments for all
    prioritized.forEach(debt => {
      if (remainingBudget >= debt.minimumPayment) {
        plan.push({
          ...debt,
          allocatedPayment: debt.minimumPayment,
          isMinimum: true,
          remainingAfterMin: remainingBudget - debt.minimumPayment
        });
        remainingBudget -= debt.minimumPayment;
      } else {
        // Not enough for minimum payment - high risk
        plan.push({
          ...debt,
          allocatedPayment: remainingBudget,
          isMinimum: false,
          shortfall: debt.minimumPayment - remainingBudget,
          isCritical: true
        });
        remainingBudget = 0;
      }
    });

    // Distribute extra to highest priority debt
    if (remainingBudget > 0 && plan.length > 0) {
      const firstDebt = plan[0];
      firstDebt.extraPayment = remainingBudget;
      firstDebt.totalPayment = firstDebt.minimumPayment + remainingBudget;
      firstDebt.isGettingExtra = true;
    }

    return plan;
  };

  const paymentPlan = calculatePaymentPlan();
  const prioritizedDebts = getPrioritizedDebts();
  
  // Calculate totals
  const totalDebt = allDebts.reduce((sum, d) => sum + d.balance, 0);
  const totalMinPayments = allDebts.reduce((sum, d) => sum + d.minimumPayment, 0);
  const canCoverMinimums = monthlyAllocation >= totalMinPayments;
  const highRiskCount = allDebts.filter(d => d.riskLevel === RiskLevels.CRITICAL || d.riskLevel === RiskLevels.HIGH).length;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={onViewDashboard} style={styles.backButton}>
            ← Dashboard
          </button>
          <h2 style={styles.title}>🎯 Debt Elimination Strategist</h2>
        </div>
        <div style={styles.strategyToggle}>
          <button
            onClick={() => setStrategy(RepaymentStrategies.AVALANCHE)}
            style={{
              ...styles.strategyButton,
              ...(strategy === RepaymentStrategies.AVALANCHE ? styles.activeStrategy : {})
            }}
          >
            📉 Avalanche (Save Most)
          </button>
          <button
            onClick={() => setStrategy(RepaymentStrategies.SNOWBALL)}
            style={{
              ...styles.strategyButton,
              ...(strategy === RepaymentStrategies.SNOWBALL ? styles.activeStrategy : {})
            }}
          >
            ❄️ Snowball (Quick Wins)
          </button>
          <button
            onClick={() => setStrategy(RepaymentStrategies.HYBRID)}
            style={{
              ...styles.strategyButton,
              ...(strategy === RepaymentStrategies.HYBRID ? styles.activeStrategy : {})
            }}
          >
            ⚖️ Hybrid (Balanced)
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💰</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Total Debt</div>
            <div style={styles.summaryValue}>${totalDebt.toFixed(2)}</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📊</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Monthly Minimum</div>
            <div style={styles.summaryValue}>${totalMinPayments.toFixed(2)}</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>⚠️</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>High Risk</div>
            <div style={styles.summaryValue}>{highRiskCount}</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>⚡</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Monthly Budget</div>
            <input
              type="number"
              value={monthlyAllocation}
              onChange={(e) => setMonthlyAllocation(parseFloat(e.target.value) || 0)}
              style={styles.budgetInput}
              step="100"
              min="0"
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={styles.filterTabs}>
        <button
          onClick={() => setShowCombined(true)}
          style={{
            ...styles.filterTab,
            ...(showCombined ? styles.activeFilter : {})
          }}
        >
          All Debt ({allDebts.length})
        </button>
        <button
          onClick={() => setShowCombined(false)}
          style={{
            ...styles.filterTab,
            ...(!showCombined ? styles.activeFilter : {})
          }}
        >
          By Type
        </button>
      </div>

      {/* Debt List */}
      <div style={styles.debtList}>
        {prioritizedDebts.map((debt, index) => {
          const plan = paymentPlan.find(p => p.id === debt.id);
          const isSelected = selectedDebt?.id === debt.id;

          return (
            <div
              key={debt.id}
              style={{
                ...styles.debtItem,
                ...(isSelected ? styles.selectedDebt : {}),
                borderLeft: `4px solid ${
                  debt.riskLevel === RiskLevels.CRITICAL ? '#EF4444' :
                  debt.riskLevel === RiskLevels.HIGH ? '#F59E0B' :
                  debt.riskLevel === RiskLevels.MEDIUM ? '#3B82F6' : '#10B981'
                }`
              }}
              onClick={() => setSelectedDebt(isSelected ? null : debt)}
            >
              {/* Rank and Type */}
              <div style={styles.debtHeader}>
                <div style={styles.debtRank}>
                  <span style={styles.rankNumber}>#{index + 1}</span>
                  <span style={styles.debtType}>
                    {debt.type === DebtTypes.CREDIT_CARD ? '💳' : '🏦'}
                  </span>
                  <span style={styles.debtName}>{debt.name}</span>
                </div>
                <div style={styles.debtRate}>{debt.interestRate}%</div>
              </div>

              {/* Balance and Payment */}
              <div style={styles.debtDetails}>
                <div style={styles.debtBalance}>
                  <span>Balance: </span>
                  <strong>${debt.balance.toFixed(2)}</strong>
                </div>
                <div style={styles.debtPayment}>
                  <span>Min Payment: </span>
                  <strong>${debt.minimumPayment.toFixed(2)}</strong>
                </div>
              </div>

              {/* Progress Bar */}
              <div style={styles.progressSection}>
                <div style={styles.progressLabel}>
                  <span>Progress: {((debt.originalBalance - debt.balance) / debt.originalBalance * 100).toFixed(1)}%</span>
                  <span>
                    {plan?.isGettingExtra ? '⚡ Extra payment' : 
                     plan?.isCritical ? '⚠️ Shortfall' : 'On track'}
                  </span>
                </div>
                <div style={styles.progressBar}>
                  <div style={{
                    ...styles.progressFill,
                    width: `${((debt.originalBalance - debt.balance) / debt.originalBalance * 100)}%`,
                    background: debt.riskLevel === RiskLevels.CRITICAL ? '#EF4444' :
                                debt.riskLevel === RiskLevels.HIGH ? '#F59E0B' : '#10B981'
                  }} />
                </div>
              </div>

              {/* Quick Stats */}
              <div style={styles.quickStats}>
                <div style={styles.stat}>
                  <span>Remaining Payments</span>
                  <strong>{debt.remainingPayments || 'N/A'}</strong>
                </div>
                <div style={styles.stat}>
                  <span>Payoff Date</span>
                  <strong>
                    {debt.remainingPayments 
                      ? new Date(Date.now() + debt.remainingPayments * 30 * 24 * 60 * 60 * 1000).toLocaleDateString()
                      : 'Variable'}
                  </strong>
                </div>
                <div style={styles.stat}>
                  <span>Allocated</span>
                  <strong style={{ color: plan?.isGettingExtra ? '#10B981' : 'white' }}>
                    ${plan?.totalPayment?.toFixed(2) || debt.minimumPayment.toFixed(2)}
                  </strong>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={styles.debtActions}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDebtDetails(debt.id);
                  }}
                  style={styles.detailsButton}
                >
                  View Details
                </button>
                {debt.type === DebtTypes.CREDIT_CARD && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveMoney && onMoveMoney(debt.id, plan?.shortfall || 0);
                    }}
                    style={styles.moveMoneyButton}
                  >
                    Move Money
                  </button>
                )}
              </div>

              {/* Expanded Details */}
              {isSelected && (
                <div style={styles.expandedDetails}>
                  <h4 style={styles.expandedTitle}>Repayment Strategy</h4>
                  <div style={styles.strategyGrid}>
                    <div style={styles.strategyCard}>
                      <div style={styles.strategyLabel}>Current Strategy</div>
                      <div style={styles.strategyValue}>
                        {strategy === RepaymentStrategies.AVALANCHE ? 'Avalanche' :
                         strategy === RepaymentStrategies.SNOWBALL ? 'Snowball' : 'Hybrid'}
                      </div>
                    </div>
                    <div style={styles.strategyCard}>
                      <div style={styles.strategyLabel}>Interest Saved</div>
                      <div style={styles.strategyValue}>
                        ${(debt.balance * debt.interestRate / 100 / 12 * (plan?.remainingPayments || 12)).toFixed(2)}
                      </div>
                    </div>
                    <div style={styles.strategyCard}>
                      <div style={styles.strategyLabel}>Payoff Acceleration</div>
                      <div style={styles.strategyValue}>
                        {plan?.isGettingExtra ? '⚡ 2x faster' : 'Normal'}
                      </div>
                    </div>
                  </div>

                  {/* Payment Schedule Preview */}
                  <div style={styles.schedulePreview}>
                    <h4 style={styles.expandedTitle}>Next 3 Payments</h4>
                    {[1,2,3].map(month => (
                      <div key={month} style={styles.scheduleItem}>
                        <span>Month {month}</span>
                        <span>${(debt.minimumPayment + (month === 1 && plan?.extraPayment ? plan.extraPayment : 0)).toFixed(2)}</span>
                        <span style={{ color: '#10B981' }}>
                          Balance: ${(debt.balance - (debt.minimumPayment * month)).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Optimization Summary */}
      <div style={styles.optimizationSummary}>
        <h3 style={styles.optimizationTitle}>📊 Optimization Summary</h3>
        <div style={styles.optimizationGrid}>
          <div style={styles.optimizationItem}>
            <div style={styles.optimizationLabel}>Monthly Allocation</div>
            <div style={styles.optimizationValue}>${monthlyAllocation.toFixed(2)}</div>
          </div>
          <div style={styles.optimizationItem}>
            <div style={styles.optimizationLabel}>Required Minimum</div>
            <div style={styles.optimizationValue}>${totalMinPayments.toFixed(2)}</div>
          </div>
          <div style={styles.optimizationItem}>
            <div style={styles.optimizationLabel}>Extra Available</div>
            <div style={{
              ...styles.optimizationValue,
              color: canCoverMinimums ? '#10B981' : '#EF4444'
            }}>
              ${(monthlyAllocation - totalMinPayments).toFixed(2)}
            </div>
          </div>
          <div style={styles.optimizationItem}>
            <div style={styles.optimizationLabel}>Projected Savings</div>
            <div style={styles.optimizationValue}>
              ${(totalDebt * 0.05).toFixed(2)} (est.)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
    color: 'white'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    flexWrap: 'wrap',
    gap: '1rem'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  backButton: {
    padding: '0.5rem 1rem',
    background: '#374151',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer'
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 'bold',
    margin: 0,
    background: 'linear-gradient(135deg, #10B981, #3B82F6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  strategyToggle: {
    display: 'flex',
    gap: '0.5rem',
    background: '#1F2937',
    padding: '0.25rem',
    borderRadius: '0.5rem'
  },
  strategyButton: {
    padding: '0.5rem 1rem',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem'
  },
  activeStrategy: {
    background: '#3B82F6',
    color: 'white'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem'
  },
  summaryCard: {
    background: '#1F2937',
    padding: '1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  summaryIcon: {
    fontSize: '2rem'
  },
  summaryContent: {
    flex: 1
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem',
    textTransform: 'uppercase'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold'
  },
  budgetInput: {
    width: '100%',
    padding: '0.25rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.25rem',
    color: 'white',
    fontSize: '1rem'
  },
  filterTabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '2rem',
    background: '#1F2937',
    padding: '0.25rem',
    borderRadius: '0.5rem',
    width: 'fit-content'
  },
  filterTab: {
    padding: '0.5rem 1rem',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem'
  },
  activeFilter: {
    background: '#3B82F6',
    color: 'white'
  },
  debtList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginBottom: '2rem'
  },
  debtItem: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  selectedDebt: {
    border: '2px solid #3B82F6',
    transform: 'scale(1.01)'
  },
  debtHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
  },
  debtRank: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  rankNumber: {
    background: '#374151',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 'bold'
  },
  debtType: {
    fontSize: '1.25rem'
  },
  debtName: {
    fontSize: '1.125rem',
    fontWeight: '600'
  },
  debtRate: {
    fontSize: '1.125rem',
    fontWeight: 'bold',
    color: '#F59E0B'
  },
  debtDetails: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1rem',
    marginBottom: '1rem'
  },
  debtBalance: {
    fontSize: '1rem',
    color: '#9CA3AF'
  },
  debtPayment: {
    fontSize: '1rem',
    color: '#9CA3AF'
  },
  progressSection: {
    marginBottom: '1rem'
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem'
  },
  progressBar: {
    height: '0.5rem',
    background: '#374151',
    borderRadius: '0.25rem',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  quickStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem',
    marginBottom: '1rem'
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  debtActions: {
    display: 'flex',
    gap: '0.5rem'
  },
  detailsButton: {
    flex: 1,
    padding: '0.5rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    cursor: 'pointer'
  },
  moveMoneyButton: {
    flex: 1,
    padding: '0.5rem',
    background: '#F59E0B',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    cursor: 'pointer'
  },
  expandedDetails: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #374151'
  },
  expandedTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    margin: '0 0 0.75rem 0',
    color: 'white'
  },
  strategyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
    marginBottom: '1rem'
  },
  strategyCard: {
    background: '#111827',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    textAlign: 'center'
  },
  strategyLabel: {
    fontSize: '0.625rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem',
    textTransform: 'uppercase'
  },
  strategyValue: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: 'white'
  },
  schedulePreview: {
    background: '#111827',
    padding: '1rem',
    borderRadius: '0.5rem'
  },
  scheduleItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    borderBottom: '1px solid #374151',
    fontSize: '0.875rem',
    ':last-child': {
      borderBottom: 'none'
    }
  },
  optimizationSummary: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  optimizationTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    margin: '0 0 1rem 0',
    color: 'white'
  },
  optimizationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem'
  },
  optimizationItem: {
    textAlign: 'center'
  },
  optimizationLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem',
    textTransform: 'uppercase'
  },
  optimizationValue: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: 'white'
  }
};