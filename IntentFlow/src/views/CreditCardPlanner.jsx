// src/views/CreditCardPlanner.jsx
import React, { useState, useEffect } from 'react';

export default function CreditCardPlanner({
  categories = [],
  creditCards = [],
  onPaymentPlanned,
  onMoveMoney,
  onViewCard,
  onViewDashboard
}) {
  const [selectedCard, setSelectedCard] = useState(null);
  const [paymentPlan, setPaymentPlan] = useState(null);
  const [optimizationStrategy, setOptimizationStrategy] = useState('avalanche'); // 'avalanche' or 'snowball'
  const [showAllCards, setShowAllCards] = useState(true);

  // Calculate payment strategies for all cards
  // Calculate payment strategies for all cards
  const calculatePaymentStrategy = (card) => {
    // Find the credit card payment category in budget
    const paymentCategory = categories.find(c =>
      c.name.toLowerCase().includes('credit card') ||
      c.category_type === 'debt' ||
      c.name.toLowerCase().includes('debt')
    );

    const reservedFunds = paymentCategory?.available || 0;

    // Safely handle due date
    let daysUntilDue = 999; // Default large number if no due date
    let isOverdue = false;
    let isUrgent = false;
    let optimalDate = null;
    let optimalDateString = null;

    if (card.dueDate) {
      try {
        const dueDate = new Date(card.dueDate);
        const today = new Date();

        // Check if date is valid
        if (!isNaN(dueDate.getTime())) {
          daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
          isOverdue = daysUntilDue < 0;
          isUrgent = daysUntilDue <= 7 && daysUntilDue > 0;

          // Calculate optimal payment date (3 days before due date to be safe)
          optimalDate = new Date(dueDate);
          optimalDate.setDate(optimalDate.getDate() - 3);
          optimalDateString = optimalDate.toISOString().split('T')[0];
        }
      } catch (e) {
        console.warn('Invalid due date for card:', card.name, card.dueDate);
      }
    }

    const canPayInFull = reservedFunds >= Math.abs(card.balance);
    const shortfall = Math.abs(card.balance) - reservedFunds;

    // Calculate interest if not paid in full
    const monthlyInterestRate = (card.apr || 18.99) / 100 / 12;
    const estimatedInterest = canPayInFull ? 0 : (Math.abs(card.balance) * monthlyInterestRate);

    // Calculate payoff timeline with minimum payments
    const minPayment = card.minimumPayment || Math.max(25, Math.abs(card.balance) * 0.02);
    const monthsToPayoff = Math.ceil(Math.abs(card.balance) / minPayment);
    const totalInterest = Array.from({ length: monthsToPayoff }).reduce((acc, _, i) => {
      const remainingBalance = Math.abs(card.balance) - (minPayment * i);
      return acc + (remainingBalance * monthlyInterestRate);
    }, 0);

    return {
      cardId: card.id,
      cardName: card.name,
      balance: Math.abs(card.balance),
      statementBalance: Math.abs(card.lastStatementBalance || card.balance),
      reservedFunds,
      canPayInFull,
      shortfall: canPayInFull ? 0 : shortfall,
      daysUntilDue,
      isUrgent,
      isOverdue,
      optimalPaymentDate: optimalDateString,
      recommendedPayment: canPayInFull ? Math.abs(card.balance) : reservedFunds,
      estimatedInterest,
      minimumPayment: minPayment,
      monthsToPayoff: canPayInFull ? 0 : monthsToPayoff,
      totalInterestIfMinimum: totalInterest,
      apr: card.apr || 18.99,
      utilization: (Math.abs(card.balance) / (card.limit || 1000)) * 100,
      status: canPayInFull ? 'safe' : shortfall > 0 ? 'danger' : 'warning',
      suggestions: canPayInFull
        ? ['✅ You have enough reserved to pay in full!']
        : [
          `⚠️ Need $${shortfall.toFixed(2)} more to pay in full`,
          `💰 Pay at least $${minPayment.toFixed(2)} by ${optimalDateString || 'the due date'} to avoid late fees`,
          ...getSuggestionsForCategories(categories, shortfall)
        ]
    };
  };

  const getSuggestionsForCategories = (categories, neededAmount) => {
    // Find categories with available funds
    const availableCategories = categories
      .filter(c => (c.available || 0) > 0 && c.category_type !== 'debt')
      .sort((a, b) => (b.available || 0) - (a.available || 0))
      .slice(0, 3);

    if (availableCategories.length === 0) {
      return ['Consider reducing discretionary spending this month'];
    }

    return [
      `Move from: ${availableCategories.map(c => c.name).join(', ')}`,
      `Total available: $${availableCategories.reduce((sum, c) => sum + (c.available || 0), 0).toFixed(2)}`
    ];
  };

  // Calculate overall strategy
  const calculateOverallStrategy = () => {
    const cardsWithStrategy = creditCards.map(card => ({
      ...card,
      strategy: calculatePaymentStrategy(card)
    }));

    // Sort based on selected strategy
    if (optimizationStrategy === 'avalanche') {
      // Highest interest first
      return cardsWithStrategy.sort((a, b) => (b.apr || 0) - (a.apr || 0));
    } else {
      // Smallest balance first
      return cardsWithStrategy.sort((a, b) => Math.abs(a.balance) - Math.abs(b.balance));
    }
  };

  const handleCardSelect = (card) => {
    setSelectedCard(card);
    const plan = calculatePaymentStrategy(card);
    setPaymentPlan(plan);
  };

  const handleSchedulePayment = () => {
    if (!paymentPlan) return;

    if (onPaymentPlanned) {
      onPaymentPlanned({
        ...paymentPlan,
        date: paymentPlan.optimalPaymentDate,
        amount: paymentPlan.recommendedPayment
      });
    }
  };

  const handleMoveMoney = () => {
    if (!paymentPlan || paymentPlan.shortfall <= 0) return;

    if (onMoveMoney) {
      onMoveMoney(paymentPlan.cardId, paymentPlan.shortfall);
    }
  };

  const prioritizedCards = calculateOverallStrategy();
  const totalBalance = creditCards.reduce((sum, c) => sum + Math.abs(c.balance || 0), 0);
  const totalUrgent = creditCards.filter(c => {
    const days = Math.ceil((new Date(c.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
    return days <= 7 && days > 0;
  }).length;

  return (
    <div style={styles.container}>
      {/* Header with Navigation */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={onViewDashboard} style={styles.backButton}>
            ← Dashboard
          </button>
          <h2 style={styles.title}>📈 Credit Card Strategist</h2>
        </div>
        <div style={styles.strategyToggle}>
          <button
            onClick={() => setOptimizationStrategy('avalanche')}
            style={{
              ...styles.strategyButton,
              ...(optimizationStrategy === 'avalanche' ? styles.activeStrategy : {})
            }}
          >
            Avalanche (High Interest First)
          </button>
          <button
            onClick={() => setOptimizationStrategy('snowball')}
            style={{
              ...styles.strategyButton,
              ...(optimizationStrategy === 'snowball' ? styles.activeStrategy : {})
            }}
          >
            Snowball (Small Balance First)
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Total Credit Card Debt</div>
          <div style={styles.summaryValue}>${totalBalance.toFixed(2)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Cards Needing Attention</div>
          <div style={styles.summaryValue}>{totalUrgent}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Optimization Strategy</div>
          <div style={styles.summaryValue}>
            {optimizationStrategy === 'avalanche' ? '📉 Avalanche' : '❄️ Snowball'}
          </div>
        </div>
      </div>

      {/* Priority List */}
      <div style={styles.prioritySection}>
        <h3 style={styles.sectionTitle}>
          {optimizationStrategy === 'avalanche'
            ? '🎯 Pay These First (Highest Interest)'
            : '🎯 Pay These First (Smallest Balance)'}
        </h3>
        <div style={styles.cardList}>
          {prioritizedCards.map((card, index) => {
            const strategy = card.strategy || calculatePaymentStrategy(card);
            const isSelected = selectedCard?.id === card.id;

            return (
              <div
                key={card.id}
                style={{
                  ...styles.cardItem,
                  ...(isSelected ? styles.selectedCard : {}),
                  borderLeft: `4px solid ${strategy.isOverdue ? '#EF4444' :
                      strategy.isUrgent ? '#F59E0B' :
                        strategy.canPayInFull ? '#10B981' : '#3B82F6'
                    }`
                }}
                onClick={() => handleCardSelect(card)}
              >
                <div style={styles.cardHeader}>
                  <div style={styles.cardRank}>
                    <span style={styles.rankNumber}>#{index + 1}</span>
                    <span style={styles.cardName}>{card.name}</span>
                  </div>
                  <div style={styles.cardApr}>{card.apr || 18.99}% APR</div>
                </div>

                <div style={styles.cardDetails}>
                  <div style={styles.cardBalance}>
                    <span>Balance: </span>
                    <strong>${Math.abs(card.balance).toFixed(2)}</strong>
                  </div>
                  <div style={styles.cardDue}>
                    <span>Due: </span>
                    <strong style={{
                      color: strategy.isOverdue ? '#EF4444' :
                        strategy.isUrgent ? '#F59E0B' : 'white'
                    }}>
                      {new Date(card.dueDate).toLocaleDateString()}
                      {strategy.isOverdue ? ' (OVERDUE)' :
                        strategy.isUrgent ? ` (${strategy.daysUntilDue} days)` : ''}
                    </strong>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={styles.progressSection}>
                  <div style={styles.progressLabel}>
                    <span>Reserved: ${strategy.reservedFunds.toFixed(2)}</span>
                    <span>Need: ${strategy.balance.toFixed(2)}</span>
                  </div>
                  <div style={styles.progressBar}>
                    <div style={{
                      ...styles.progressFill,
                      width: `${Math.min(100, (strategy.reservedFunds / strategy.balance) * 100)}%`,
                      background: strategy.canPayInFull
                        ? 'linear-gradient(90deg, #10B981, #34D399)'
                        : 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                    }} />
                  </div>
                </div>

                {/* Quick Stats */}
                <div style={styles.cardStats}>
                  <div style={styles.stat}>
                    <span>Min Payment</span>
                    <strong>${strategy.minimumPayment.toFixed(2)}</strong>
                  </div>
                  <div style={styles.stat}>
                    <span>Payoff Time</span>
                    <strong>{strategy.monthsToPayoff} months</strong>
                  </div>
                  <div style={styles.stat}>
                    <span>Interest</span>
                    <strong style={{ color: strategy.canPayInFull ? '#10B981' : '#F59E0B' }}>
                      ${strategy.estimatedInterest.toFixed(2)}/mo
                    </strong>
                  </div>
                </div>

                {strategy.isUrgent && !isSelected && (
                  <div style={styles.urgentBadge}>
                    ⚠️ Due soon - click for details
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Payment Plan */}
      {paymentPlan && selectedCard && (
        <div style={styles.planContainer}>
          <h3 style={styles.planTitle}>
            Payment Plan for {paymentPlan.cardName}
          </h3>

          <div style={styles.planGrid}>
            <div style={styles.planItem}>
              <div style={styles.planLabel}>Current Balance</div>
              <div style={styles.planValue}>${paymentPlan.balance.toFixed(2)}</div>
            </div>
            <div style={styles.planItem}>
              <div style={styles.planLabel}>Reserved Funds</div>
              <div style={{
                ...styles.planValue,
                color: paymentPlan.canPayInFull ? '#10B981' : '#F59E0B'
              }}>
                ${paymentPlan.reservedFunds.toFixed(2)}
              </div>
            </div>
            <div style={styles.planItem}>
              <div style={styles.planLabel}>APR</div>
              <div style={styles.planValue}>{paymentPlan.apr}%</div>
            </div>
            <div style={styles.planItem}>
              <div style={styles.planLabel}>Due Date</div>
              <div style={styles.planValue}>
                {new Date(selectedCard.dueDate).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Status Message */}
          <div style={{
            ...styles.statusMessage,
            background: paymentPlan.canPayInFull
              ? 'rgba(16, 185, 129, 0.1)'
              : paymentPlan.shortfall > 0
                ? 'rgba(239, 68, 68, 0.1)'
                : 'rgba(245, 158, 11, 0.1)',
            borderLeft: `4px solid ${paymentPlan.canPayInFull
                ? '#10B981'
                : paymentPlan.shortfall > 0
                  ? '#EF4444'
                  : '#F59E0B'
              }`
          }}>
            <div style={styles.statusIcon}>
              {paymentPlan.canPayInFull ? '✅' : paymentPlan.shortfall > 0 ? '⚠️' : '💡'}
            </div>
            <div>
              <div style={styles.statusTitle}>
                {paymentPlan.canPayInFull
                  ? 'You can pay in full!'
                  : paymentPlan.shortfall > 0
                    ? `Shortfall: $${paymentPlan.shortfall.toFixed(2)}`
                    : 'Partial payment recommended'}
              </div>
              <ul style={styles.suggestions}>
                {paymentPlan.suggestions.map((suggestion, i) => (
                  <li key={i}>{suggestion}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Comparison: Pay in Full vs Minimum */}
          <div style={styles.comparisonGrid}>
            <div style={styles.comparisonCard}>
              <h4 style={styles.comparisonTitle}>Pay in Full</h4>
              <div style={styles.comparisonAmount}>
                ${paymentPlan.balance.toFixed(2)}
              </div>
              <div style={styles.comparisonBenefit}>
                Save ${paymentPlan.estimatedInterest.toFixed(2)} in interest
              </div>
              <button
                onClick={handleSchedulePayment}
                style={styles.primaryButton}
                disabled={!paymentPlan.canPayInFull}
              >
                Schedule Full Payment
              </button>
            </div>
            <div style={styles.comparisonCard}>
              <h4 style={styles.comparisonTitle}>Minimum Payment</h4>
              <div style={styles.comparisonAmount}>
                ${paymentPlan.minimumPayment.toFixed(2)}
              </div>
              <div style={styles.comparisonBenefit}>
                Pay off in {paymentPlan.monthsToPayoff} months
              </div>
              <button
                onClick={() => handleSchedulePayment()}
                style={styles.secondaryButton}
              >
                Pay Minimum
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={styles.actionButtons}>
            {paymentPlan.shortfall > 0 && (
              <button
                onClick={handleMoveMoney}
                style={styles.moveMoneyButton}
              >
                🔄 Move ${paymentPlan.shortfall.toFixed(2)} from Budget
              </button>
            )}
            <button
              onClick={() => onViewCard && onViewCard(selectedCard.id)}
              style={styles.viewCardButton}
            >
              View Card Details & Transactions
            </button>
          </div>

          {/* Interest Warning */}
          {!paymentPlan.canPayInFull && paymentPlan.estimatedInterest > 0 && (
            <div style={styles.interestWarning}>
              ⚠️ If you only pay the minimum, you'll pay approximately
              <strong> ${paymentPlan.totalInterestIfMinimum.toFixed(2)}</strong> in total interest
              over {paymentPlan.monthsToPayoff} months
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {creditCards.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>💳</div>
          <h3 style={styles.emptyTitle}>No credit cards found</h3>
          <p style={styles.emptyText}>
            Add a credit card to start planning interest-free payments
          </p>
          <button
            onClick={() => onViewDashboard && onViewDashboard()}
            style={styles.addButton}
          >
            ← Go to Dashboard to Add Card
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
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    ':hover': {
      background: '#374151',
      color: 'white'
    }
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 'bold',
    margin: 0,
    background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
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
    fontSize: '0.875rem',
    transition: 'all 0.2s'
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
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  summaryLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white'
  },
  prioritySection: {
    marginBottom: '2rem'
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: 'white'
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  cardItem: {
    background: '#1F2937',
    padding: '1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  selectedCard: {
    border: '2px solid #3B82F6',
    transform: 'scale(1.02)'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
  },
  cardRank: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  rankNumber: {
    background: '#374151',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    color: '#9CA3AF'
  },
  cardName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: 'white'
  },
  cardApr: {
    fontSize: '1rem',
    fontWeight: '500',
    color: '#F59E0B'
  },
  cardDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '1rem'
  },
  cardBalance: {
    fontSize: '1rem',
    color: '#9CA3AF'
  },
  cardDue: {
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
    background: '#374151',
    height: '0.5rem',
    borderRadius: '9999px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  cardStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem',
    marginBottom: '0.5rem'
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  urgentBadge: {
    fontSize: '0.75rem',
    color: '#F59E0B',
    marginTop: '0.5rem'
  },
  planContainer: {
    background: '#1F2937',
    padding: '2rem',
    borderRadius: '1rem',
    border: '1px solid #374151',
    marginTop: '2rem'
  },
  planTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: '0 0 1.5rem 0',
    color: 'white'
  },
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1.5rem',
    marginBottom: '1.5rem'
  },
  planItem: {
    textAlign: 'center'
  },
  planLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem'
  },
  planValue: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: 'white'
  },
  statusMessage: {
    display: 'flex',
    gap: '1rem',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    marginBottom: '1.5rem'
  },
  statusIcon: {
    fontSize: '2rem'
  },
  statusTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '0.5rem'
  },
  suggestions: {
    margin: 0,
    paddingLeft: '1.25rem',
    color: '#D1D5DB',
    fontSize: '0.875rem'
  },
  comparisonGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1rem',
    marginBottom: '1.5rem'
  },
  comparisonCard: {
    background: '#111827',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    textAlign: 'center'
  },
  comparisonTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    margin: '0 0 1rem 0',
    color: '#9CA3AF'
  },
  comparisonAmount: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white',
    marginBottom: '0.5rem'
  },
  comparisonBenefit: {
    fontSize: '0.875rem',
    color: '#10B981',
    marginBottom: '1rem'
  },
  primaryButton: {
    width: '100%',
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  },
  secondaryButton: {
    width: '100%',
    padding: '0.75rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  actionButtons: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1rem'
  },
  moveMoneyButton: {
    flex: 1,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  viewCardButton: {
    flex: 1,
    padding: '0.75rem',
    background: 'transparent',
    border: '1px solid #3B82F6',
    color: '#3B82F6',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  interestWarning: {
    fontSize: '0.875rem',
    color: '#F59E0B',
    textAlign: 'center',
    padding: '1rem',
    background: 'rgba(245, 158, 11, 0.1)',
    borderRadius: '0.5rem'
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem',
    background: '#1F2937',
    borderRadius: '1rem'
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: '1rem'
  },
  emptyTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '0.5rem'
  },
  emptyText: {
    color: '#9CA3AF',
    marginBottom: '1.5rem'
  },
  addButton: {
    padding: '0.75rem 1.5rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    cursor: 'pointer'
  }
}; 