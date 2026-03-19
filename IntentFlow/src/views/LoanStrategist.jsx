// src/views/LoanStrategist.jsx
import React, { useState } from 'react';

function LoanStrategist({
  loans = [],
  onPaymentPlanned,
  onMoveMoney,
  onViewDebtDetails,
  onViewDashboard,
  monthlyBudget = 1000
}) {
  console.log('📈 LoanStrategist rendered, received loans:', loans);
  console.log('📈 Number of loans:', loans.length);

  const [selectedLoan, setSelectedLoan] = useState(null);
  const [plan, setPlan] = useState(null);
  const [strategy, setStrategy] = useState('avalanche'); // 'avalanche', 'snowball', 'zero-interest'
  const [targetMonths, setTargetMonths] = useState(12); // for zero-interest strategy

  // Prepare loan data for calculations
  const allLoans = loans.map(l => ({
    ...l,
    balance: Math.abs(l.balance || l.originalBalance || 0),
    interestRate: l.interestRate || 5.0,
    minimumPayment: l.monthlyPayment || Math.max(25, Math.abs(l.balance) * 0.02),
    remainingPayments: l.remainingPayments || 60,
  }));

  // Calculate detailed stats for a loan
  const calculateLoanStats = (loan) => {
    const monthlyRate = loan.interestRate / 100 / 12;
    const balance = loan.balance;
    const minPayment = loan.minimumPayment;

    let monthsToPayoff = 0;
    let totalInterest = 0;
    if (monthlyRate === 0) {
      monthsToPayoff = Math.ceil(balance / minPayment);
      totalInterest = 0;
    } else {
      if (minPayment > balance * monthlyRate) {
        monthsToPayoff = Math.ceil(
          -Math.log(1 - (balance * monthlyRate) / minPayment) / Math.log(1 + monthlyRate)
        );
      } else {
        monthsToPayoff = Infinity;
      }
      totalInterest = monthsToPayoff * minPayment - balance;
    }

    let targetPayment = null;
    let targetTotalInterest = null;
    if (targetMonths > 0 && monthlyRate > 0) {
      const r = monthlyRate;
      const n = targetMonths;
      targetPayment = (r * balance) / (1 - Math.pow(1 + r, -n));
      if (targetPayment < minPayment) targetPayment = minPayment;
      targetTotalInterest = targetPayment * n - balance;
    } else if (targetMonths > 0) {
      targetPayment = balance / targetMonths;
      targetTotalInterest = 0;
    }

    return {
      balance,
      minPayment,
      monthsToPayoff,
      totalInterest,
      targetPayment,
      targetTotalInterest,
      interestSaved: totalInterest - targetTotalInterest,
    };
  };

  // Sort loans based on strategy
  const getPrioritizedLoans = () => {
    const withStats = allLoans.map(l => ({ ...l, stats: calculateLoanStats(l) }));
    if (strategy === 'avalanche') {
      return withStats.sort((a, b) => b.interestRate - a.interestRate);
    } else if (strategy === 'snowball') {
      return withStats.sort((a, b) => a.balance - b.balance);
    } else if (strategy === 'zero-interest') {
      return withStats.sort((a, b) => (b.balance * b.interestRate) - (a.balance * a.interestRate));
    }
    return withStats;
  };

  const prioritizedLoans = getPrioritizedLoans();

  const handleLoanSelect = (loan) => {
    setSelectedLoan(loan);
    setPlan(calculateLoanStats(loan));
  };

  const handleSchedulePayment = () => {
    if (!plan) return;
    onPaymentPlanned?.({
      debtId: selectedLoan.id,
      amount: plan.targetPayment || plan.minPayment,
      date: new Date().toISOString().split('T')[0],
      strategy,
    });
  };

  const handleMoveMoney = () => {
    if (!plan || plan.balance <= plan.minPayment) return;
    const needed = plan.balance - plan.minPayment;
    onMoveMoney?.(selectedLoan.id, needed);
  };

  // Totals
  const totalDebt = allLoans.reduce((sum, l) => sum + l.balance, 0);
  const totalMinimum = allLoans.reduce((sum, l) => sum + l.minimumPayment, 0);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={onViewDashboard} style={styles.backButton}>← Dashboard</button>
          <h2 style={styles.title}>📉 Loan Strategist</h2>
        </div>
        <div style={styles.strategyToggle}>
          <button
            onClick={() => setStrategy('avalanche')}
            style={{ ...styles.strategyButton, ...(strategy === 'avalanche' && styles.activeStrategy) }}
          >
            Avalanche (Highest Interest First)
          </button>
          <button
            onClick={() => setStrategy('snowball')}
            style={{ ...styles.strategyButton, ...(strategy === 'snowball' && styles.activeStrategy) }}
          >
            Snowball (Smallest Balance First)
          </button>
          <button
            onClick={() => setStrategy('zero-interest')}
            style={{ ...styles.strategyButton, ...(strategy === 'zero-interest' && styles.activeStrategy) }}
          >
            Zero‑Interest Accelerator
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Total Debt</div>
          <div style={styles.summaryValue}>${totalDebt.toFixed(2)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Minimum Monthly</div>
          <div style={styles.summaryValue}>${totalMinimum.toFixed(2)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Available Budget</div>
          <div style={styles.summaryValue}>${monthlyBudget.toFixed(2)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Extra Capacity</div>
          <div style={styles.summaryValue}>${Math.max(0, monthlyBudget - totalMinimum).toFixed(2)}</div>
        </div>
      </div>

      {/* Priority List */}
      <div style={styles.prioritySection}>
        <h3 style={styles.sectionTitle}>
          {strategy === 'avalanche' && '🎯 Attack Highest Interest First'}
          {strategy === 'snowball' && '❄️ Knock Out Smallest Balances First'}
          {strategy === 'zero-interest' && '⚡ Zero‑Interest Accelerator'}
        </h3>
        <div style={styles.cardList}>
          {prioritizedLoans.map((loan, index) => {
            const stats = loan.stats;
            const isSelected = selectedLoan?.id === loan.id;

            return (
              <div
                key={loan.id}
                style={{
                  ...styles.cardItem,
                  ...(isSelected && styles.selectedCard),
                  borderLeft: `4px solid ${stats.monthsToPayoff === Infinity ? '#EF4444' : '#10B981'}`,
                }}
                onClick={() => handleLoanSelect(loan)}
              >
                <div style={styles.cardHeader}>
                  <div style={styles.cardRank}>
                    <span style={styles.rankNumber}>#{index + 1}</span>
                    <span style={styles.cardName}>{loan.name}</span>
                    <span style={styles.cardType}>🏦</span>
                  </div>
                  <div style={styles.cardApr}>{loan.interestRate}% APR</div>
                </div>

                <div style={styles.cardDetails}>
                  <div style={styles.cardBalance}>
                    <span>Balance: </span>
                    <strong>${loan.balance.toFixed(2)}</strong>
                  </div>
                  <div style={styles.cardMin}>
                    <span>Min: </span>
                    <strong>${stats.minPayment.toFixed(2)}</strong>
                  </div>
                </div>

                {/* Progress bar for min payment vs target */}
                <div style={styles.progressSection}>
                  <div style={styles.progressLabel}>
                    <span>Min Payment</span>
                    <span>Target: ${stats.targetPayment?.toFixed(2) || '—'}</span>
                  </div>
                  <div style={styles.progressBar}>
                    <div style={{
                      ...styles.progressFill,
                      width: stats.targetPayment ? `${Math.min(100, (stats.minPayment / stats.targetPayment) * 100)}%` : '0%',
                      background: stats.targetPayment ? '#F59E0B' : '#10B981',
                    }} />
                  </div>
                </div>

                <div style={styles.cardStats}>
                  <div style={styles.stat}>
                    <span>Payoff (min)</span>
                    <strong>{stats.monthsToPayoff === Infinity ? '∞' : stats.monthsToPayoff} mo</strong>
                  </div>
                  <div style={styles.stat}>
                    <span>Total Interest</span>
                    <strong>${stats.totalInterest.toFixed(2)}</strong>
                  </div>
                  {strategy === 'zero-interest' && stats.targetPayment && (
                    <div style={styles.stat}>
                      <span>Save</span>
                      <strong style={{ color: '#10B981' }}>${stats.interestSaved.toFixed(2)}</strong>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Payment Plan */}
      {plan && selectedLoan && (
        <div style={styles.planContainer}>
          <h3 style={styles.planTitle}>
            Payment Plan for {selectedLoan.name}
            {strategy === 'zero-interest' && (
              <span style={styles.planSubtitle}>
                {' '}
                (Target: {targetMonths} months)
                <input
                  type="range"
                  min="1"
                  max="60"
                  value={targetMonths}
                  onChange={(e) => setTargetMonths(Number(e.target.value))}
                  style={styles.slider}
                />
              </span>
            )}
          </h3>

          <div style={styles.planGrid}>
            <div style={styles.planItem}>
              <div style={styles.planLabel}>Current Balance</div>
              <div style={styles.planValue}>${plan.balance.toFixed(2)}</div>
            </div>
            <div style={styles.planItem}>
              <div style={styles.planLabel}>Minimum Payment</div>
              <div style={styles.planValue}>${plan.minPayment.toFixed(2)}</div>
            </div>
            <div style={styles.planItem}>
              <div style={styles.planLabel}>Payoff (min)</div>
              <div style={styles.planValue}>{plan.monthsToPayoff} months</div>
            </div>
            <div style={styles.planItem}>
              <div style={styles.planLabel}>Total Interest (min)</div>
              <div style={styles.planValue}>${plan.totalInterest.toFixed(2)}</div>
            </div>
          </div>

          {strategy === 'zero-interest' && plan.targetPayment && (
            <>
              <div style={styles.zeroPlan}>
                <h4>⚡ Zero‑Interest Accelerator</h4>
                <div style={styles.planGrid}>
                  <div style={styles.planItem}>
                    <div style={styles.planLabel}>Target Payment</div>
                    <div style={styles.planValue}>${plan.targetPayment.toFixed(2)}</div>
                  </div>
                  <div style={styles.planItem}>
                    <div style={styles.planLabel}>Payoff Time</div>
                    <div style={styles.planValue}>{targetMonths} months</div>
                  </div>
                  <div style={styles.planItem}>
                    <div style={styles.planLabel}>Total Interest</div>
                    <div style={styles.planValue}>${plan.targetTotalInterest.toFixed(2)}</div>
                  </div>
                  <div style={styles.planItem}>
                    <div style={styles.planLabel}>Interest Saved</div>
                    <div style={{ ...styles.planValue, color: '#10B981' }}>${plan.interestSaved.toFixed(2)}</div>
                  </div>
                </div>
                <div style={styles.strategyNote}>
                  Pay an extra ${(plan.targetPayment - plan.minPayment).toFixed(2)} each month to save ${plan.interestSaved.toFixed(2)} in interest.
                </div>
              </div>
            </>
          )}

          <div style={styles.actionButtons}>
            {plan.targetPayment && (
              <button
                onClick={handleSchedulePayment}
                style={styles.primaryButton}
              >
                Schedule This Payment
              </button>
            )}
            <button
              onClick={() => onViewDebtDetails(selectedLoan.id)}
              style={styles.secondaryButton}
            >
              View Details
            </button>
            {monthlyBudget > totalMinimum && (
              <button onClick={handleMoveMoney} style={styles.moveMoneyButton}>
                🔄 Move Extra Funds
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {allLoans.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>🏦</div>
          <h3 style={styles.emptyTitle}>No loans found</h3>
          <p style={styles.emptyText}>
            Add a loan to start strategizing.
          </p>
          <button onClick={onViewDashboard} style={styles.addButton}>
            ← Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
    color: 'white',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    ':hover': { background: '#374151', color: 'white' },
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 'bold',
    margin: 0,
    background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  strategyToggle: {
    display: 'flex',
    gap: '0.5rem',
    background: '#1F2937',
    padding: '0.25rem',
    borderRadius: '0.5rem',
  },
  strategyButton: {
    padding: '0.5rem 1rem',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'all 0.2s',
  },
  activeStrategy: {
    background: '#3B82F6',
    color: 'white',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem',
  },
  summaryCard: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
  },
  summaryLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem',
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white',
  },
  prioritySection: {
    marginBottom: '2rem',
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: 'white',
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  cardItem: {
    background: '#1F2937',
    padding: '1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  selectedCard: {
    border: '2px solid #3B82F6',
    transform: 'scale(1.02)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  cardRank: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  rankNumber: {
    background: '#374151',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    color: '#9CA3AF',
  },
  cardName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: 'white',
  },
  cardType: {
    fontSize: '1rem',
  },
  cardApr: {
    fontSize: '1rem',
    fontWeight: '500',
    color: '#F59E0B',
  },
  cardDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  cardBalance: {
    fontSize: '1rem',
    color: '#9CA3AF',
  },
  cardMin: {
    fontSize: '1rem',
    color: '#9CA3AF',
  },
  progressSection: {
    marginBottom: '0.75rem',
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem',
  },
  progressBar: {
    background: '#374151',
    height: '0.5rem',
    borderRadius: '9999px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  cardStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.75rem',
    color: '#9CA3AF',
  },
  planContainer: {
    background: '#1F2937',
    padding: '2rem',
    borderRadius: '1rem',
    border: '1px solid #374151',
    marginTop: '2rem',
  },
  planTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: '0 0 1.5rem 0',
    color: 'white',
  },
  planSubtitle: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginLeft: '1rem',
  },
  slider: {
    marginLeft: '1rem',
    verticalAlign: 'middle',
    width: '150px',
  },
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1.5rem',
    marginBottom: '1.5rem',
  },
  planItem: {
    textAlign: 'center',
  },
  planLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem',
  },
  planValue: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: 'white',
  },
  zeroPlan: {
    background: '#111827',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    marginBottom: '1.5rem',
  },
  strategyNote: {
    marginTop: '1rem',
    fontSize: '0.875rem',
    color: '#10B981',
    textAlign: 'center',
  },
  actionButtons: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
  },
  primaryButton: {
    padding: '0.75rem 2rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '0.75rem 2rem',
    background: 'transparent',
    border: '1px solid #3B82F6',
    color: '#3B82F6',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    cursor: 'pointer',
  },
  moveMoneyButton: {
    padding: '0.75rem 2rem',
    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem',
    background: '#1F2937',
    borderRadius: '1rem',
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },
  emptyTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '0.5rem',
  },
  emptyText: {
    color: '#9CA3AF',
    marginBottom: '1.5rem',
  },
  addButton: {
    padding: '0.75rem 1.5rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    cursor: 'pointer',
  },
};

export default LoanStrategist;