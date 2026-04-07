// src/views/CreditCardPlanner.jsx
import React, { useState, useEffect } from 'react';

export default function CreditCardPlanner({
  categories = [],
  creditCards = [],
  onPaymentPlanned,
  onMoveMoney,
  onViewCard,
  onViewDashboard,
  monthlyBudget = 1000
}) {
  const [selectedCard, setSelectedCard] = useState(null);
  const [paymentPlan, setPaymentPlan] = useState(null);
  const [optimizationStrategy, setOptimizationStrategy] = useState('avalanche'); // 'avalanche', 'snowball', 'zero-interest'
  const [targetMonths, setTargetMonths] = useState(12); // for zero-interest strategy

  // Calculate payment strategies for all cards
  const calculatePaymentStrategy = (card) => {
    // Find the credit card payment category in budget
    const paymentCategory = categories.find(c =>
      c.name.toLowerCase().includes('credit card') ||
      c.category_type === 'debt' ||
      c.name.toLowerCase().includes('debt')
    );

    const reservedFunds = paymentCategory?.available || 0;
    const balance = Math.abs(card.balance);

    // Safely handle due date
    let daysUntilDue = 999;
    let isOverdue = false;
    let isUrgent = false;
    let optimalDate = null;
    let optimalDateString = null;

    if (card.dueDate) {
      try {
        const dueDate = new Date(card.dueDate);
        const today = new Date();

        if (!isNaN(dueDate.getTime())) {
          daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
          isOverdue = daysUntilDue < 0;
          isUrgent = daysUntilDue <= 7 && daysUntilDue > 0;

          optimalDate = new Date(dueDate);
          optimalDate.setDate(optimalDate.getDate() - 3);
          optimalDateString = optimalDate.toISOString().split('T')[0];
        }
      } catch (e) {
        console.warn('Invalid due date for card:', card.name, card.dueDate);
      }
    }

    const canPayInFull = reservedFunds >= balance;
    const shortfall = balance - reservedFunds;

    // Calculate interest if not paid in full
    const monthlyInterestRate = (card.apr || 18.99) / 100 / 12;
    const estimatedInterest = canPayInFull ? 0 : (balance * monthlyInterestRate);

    // Calculate payoff timeline with minimum payments
    const minPayment = card.minimumPayment || Math.max(25, balance * 0.02);
    
    let monthsToPayoff = 0;
    let totalInterest = 0;
    
    if (monthlyInterestRate === 0) {
      monthsToPayoff = Math.ceil(balance / minPayment);
      totalInterest = 0;
    } else {
      if (minPayment > balance * monthlyInterestRate) {
        monthsToPayoff = Math.ceil(
          -Math.log(1 - (balance * monthlyInterestRate) / minPayment) / Math.log(1 + monthlyInterestRate)
        );
      } else {
        monthsToPayoff = Infinity;
      }
      totalInterest = monthsToPayoff * minPayment - balance;
    }

    // Calculate zero-interest accelerator payment
    let targetPayment = null;
    let targetTotalInterest = null;
    let interestSaved = null;
    
    if (targetMonths > 0) {
      if (monthlyInterestRate > 0) {
        const r = monthlyInterestRate;
        const n = targetMonths;
        targetPayment = (r * balance) / (1 - Math.pow(1 + r, -n));
        if (targetPayment < minPayment) targetPayment = minPayment;
        targetTotalInterest = targetPayment * targetMonths - balance;
      } else {
        targetPayment = balance / targetMonths;
        targetTotalInterest = 0;
      }
      interestSaved = totalInterest - targetTotalInterest;
    }

    return {
      cardId: card.id,
      cardName: card.name,
      balance: balance,
      statementBalance: Math.abs(card.lastStatementBalance || card.balance),
      reservedFunds,
      canPayInFull,
      shortfall: canPayInFull ? 0 : shortfall,
      daysUntilDue,
      isUrgent,
      isOverdue,
      optimalPaymentDate: optimalDateString,
      recommendedPayment: canPayInFull ? balance : reservedFunds,
      estimatedInterest,
      minimumPayment: minPayment,
      monthsToPayoff: canPayInFull ? 0 : monthsToPayoff,
      totalInterestIfMinimum: totalInterest,
      apr: card.apr || 18.99,
      utilization: (balance / (card.limit || 1000)) * 100,
      status: canPayInFull ? 'safe' : shortfall > 0 ? 'danger' : 'warning',
      // Zero-interest accelerator fields
      targetPayment,
      targetTotalInterest,
      interestSaved,
      suggestions: getSuggestionsForCategories(categories, shortfall, canPayInFull, totalInterest, targetPayment, minPayment, interestSaved)
    };
  };

  const getSuggestionsForCategories = (categories, neededAmount, canPayInFull, totalInterest, targetPayment, minPayment, interestSaved) => {
    const suggestions = [];
    
    if (canPayInFull) {
      suggestions.push('✅ You have enough reserved to pay in full!');
    } else {
      suggestions.push(`⚠️ Need $${neededAmount.toFixed(2)} more to pay in full`);
    }
    
    if (targetPayment && targetPayment > minPayment) {
      suggestions.push(`⚡ Zero-Interest Accelerator: Pay $${targetPayment.toFixed(2)}/month to pay off in ${targetMonths} months`);
      if (interestSaved > 0) {
        suggestions.push(`💰 Save $${interestSaved.toFixed(2)} in interest with accelerated payments`);
      }
    } else if (minPayment) {
      suggestions.push(`💰 Pay at least $${minPayment.toFixed(2)} to avoid late fees`);
    }
    
    // Find categories with available funds
    const availableCategories = categories
      .filter(c => (c.available || 0) > 0 && c.category_type !== 'debt')
      .sort((a, b) => (b.available || 0) - (a.available || 0))
      .slice(0, 3);

    if (availableCategories.length > 0 && neededAmount > 0) {
      suggestions.push(`Move from: ${availableCategories.map(c => c.name).join(', ')}`);
      suggestions.push(`Total available: $${availableCategories.reduce((sum, c) => sum + (c.available || 0), 0).toFixed(2)}`);
    }
    
    return suggestions;
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
    } else if (optimizationStrategy === 'snowball') {
      // Smallest balance first
      return cardsWithStrategy.sort((a, b) => Math.abs(a.balance) - Math.abs(b.balance));
    } else {
      // Zero-interest accelerator: highest interest cost first (balance * APR)
      return cardsWithStrategy.sort((a, b) => 
        (Math.abs(b.balance) * (b.apr || 0)) - (Math.abs(a.balance) * (a.apr || 0))
      );
    }
  };

  const handleCardSelect = (card) => {
    setSelectedCard(card);
    const plan = calculatePaymentStrategy(card);
    setPaymentPlan(plan);
  };

  const handleSchedulePayment = (amount) => {
    if (!paymentPlan) return;

    if (onPaymentPlanned) {
      onPaymentPlanned({
        ...paymentPlan,
        date: paymentPlan.optimalPaymentDate,
        amount: amount || paymentPlan.recommendedPayment
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
  const totalMinimum = creditCards.reduce((sum, c) => {
    const minPayment = c.minimumPayment || Math.max(25, Math.abs(c.balance) * 0.02);
    return sum + minPayment;
  }, 0);
  const totalUrgent = creditCards.filter(c => {
    const days = Math.ceil((new Date(c.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
    return days <= 7 && days > 0;
  }).length;
  const extraCapacity = Math.max(0, monthlyBudget - totalMinimum);

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
          <button
            onClick={() => setOptimizationStrategy('zero-interest')}
            style={{
              ...styles.strategyButton,
              ...(optimizationStrategy === 'zero-interest' ? styles.activeStrategy : {})
            }}
          >
            ⚡ Zero‑Interest Accelerator
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
          <div style={styles.summaryLabel}>Minimum Monthly</div>
          <div style={styles.summaryValue}>${totalMinimum.toFixed(2)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Monthly Budget</div>
          <div style={styles.summaryValue}>${monthlyBudget.toFixed(2)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Extra Capacity</div>
          <div style={styles.summaryValue}>${extraCapacity.toFixed(2)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Cards Needing Attention</div>
          <div style={styles.summaryValue}>{totalUrgent}</div>
        </div>
      </div>

      {/* Priority List */}
      <div style={styles.prioritySection}>
        <h3 style={styles.sectionTitle}>
          {optimizationStrategy === 'avalanche' && '🎯 Attack Highest Interest First'}
          {optimizationStrategy === 'snowball' && '❄️ Knock Out Smallest Balances First'}
          {optimizationStrategy === 'zero-interest' && `⚡ Zero‑Interest Accelerator (${targetMonths} Month Target)`}
        </h3>
        
        {optimizationStrategy === 'zero-interest' && (
          <div style={styles.targetSliderContainer}>
            <label style={styles.sliderLabel}>
              Target Payoff Months: {targetMonths}
              <input
                type="range"
                min="1"
                max="60"
                value={targetMonths}
                onChange={(e) => setTargetMonths(Number(e.target.value))}
                style={styles.slider}
              />
            </label>
          </div>
        )}
        
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
                      {card.dueDate ? new Date(card.dueDate).toLocaleDateString() : 'No due date'}
                      {strategy.isOverdue ? ' (OVERDUE)' :
                        strategy.isUrgent ? ` (${strategy.daysUntilDue} days)` : ''}
                    </strong>
                  </div>
                </div>

                {/* Progress Bar - Reserved vs Balance */}
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

                {/* Zero-Interest Accelerator Progress Bar */}
                {optimizationStrategy === 'zero-interest' && strategy.targetPayment && (
                  <div style={styles.progressSection}>
                    <div style={styles.progressLabel}>
                      <span>Min Payment: ${strategy.minimumPayment.toFixed(2)}</span>
                      <span>Target: ${strategy.targetPayment.toFixed(2)}</span>
                    </div>
                    <div style={styles.progressBar}>
                      <div style={{
                        ...styles.progressFill,
                        width: `${Math.min(100, (strategy.minimumPayment / strategy.targetPayment) * 100)}%`,
                        background: '#8B5CF6'
                      }} />
                    </div>
                  </div>
                )}

                {/* Quick Stats */}
                <div style={styles.cardStats}>
                  <div style={styles.stat}>
                    <span>Min Payment</span>
                    <strong>${strategy.minimumPayment.toFixed(2)}</strong>
                  </div>
                  <div style={styles.stat}>
                    <span>Payoff Time</span>
                    <strong>{strategy.monthsToPayoff === Infinity ? '∞' : strategy.monthsToPayoff} mo</strong>
                  </div>
                  <div style={styles.stat}>
                    <span>Interest</span>
                    <strong style={{ color: strategy.canPayInFull ? '#10B981' : '#F59E0B' }}>
                      ${strategy.estimatedInterest.toFixed(2)}/mo
                    </strong>
                  </div>
                  {optimizationStrategy === 'zero-interest' && strategy.interestSaved > 0 && (
                    <div style={styles.stat}>
                      <span>Save</span>
                      <strong style={{ color: '#10B981' }}>${strategy.interestSaved.toFixed(2)}</strong>
                    </div>
                  )}
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
              <div style={styles.planLabel}>Minimum Payment</div>
              <div style={styles.planValue}>${paymentPlan.minimumPayment.toFixed(2)}</div>
            </div>
          </div>

          {/* Zero-Interest Accelerator Detailed Plan */}
          {optimizationStrategy === 'zero-interest' && paymentPlan.targetPayment && (
            <div style={styles.zeroPlanContainer}>
              <h4 style={styles.zeroPlanTitle}>⚡ Zero‑Interest Accelerator Plan</h4>
              <div style={styles.zeroPlanGrid}>
                <div style={styles.zeroPlanItem}>
                  <div style={styles.zeroPlanLabel}>Target Monthly Payment</div>
                  <div style={styles.zeroPlanValue}>${paymentPlan.targetPayment.toFixed(2)}</div>
                </div>
                <div style={styles.zeroPlanItem}>
                  <div style={styles.zeroPlanLabel}>Payoff Time</div>
                  <div style={styles.zeroPlanValue}>{targetMonths} months</div>
                </div>
                <div style={styles.zeroPlanItem}>
                  <div style={styles.zeroPlanLabel}>Total Interest</div>
                  <div style={styles.zeroPlanValue}>${paymentPlan.targetTotalInterest.toFixed(2)}</div>
                </div>
                <div style={styles.zeroPlanItem}>
                  <div style={styles.zeroPlanLabel}>Interest Saved</div>
                  <div style={{ ...styles.zeroPlanValue, color: '#10B981' }}>
                    ${paymentPlan.interestSaved.toFixed(2)}
                  </div>
                </div>
              </div>
              <div style={styles.strategyNote}>
                💡 Pay an extra ${(paymentPlan.targetPayment - paymentPlan.minimumPayment).toFixed(2)} each month 
                to save ${paymentPlan.interestSaved.toFixed(2)} in interest and pay off {targetMonths} months faster!
              </div>
            </div>
          )}

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

          {/* Action Buttons */}
          <div style={styles.actionButtons}>
            {paymentPlan.canPayInFull && (
              <button
                onClick={() => handleSchedulePayment(paymentPlan.balance)}
                style={styles.primaryButton}
              >
                Schedule Full Payment (${paymentPlan.balance.toFixed(2)})
              </button>
            )}
            {optimizationStrategy === 'zero-interest' && paymentPlan.targetPayment && (
              <button
                onClick={() => handleSchedulePayment(paymentPlan.targetPayment)}
                style={styles.zeroInterestButton}
              >
                ⚡ Schedule Accelerated Payment (${paymentPlan.targetPayment.toFixed(2)})
              </button>
            )}
            <button
              onClick={() => handleSchedulePayment(paymentPlan.minimumPayment)}
              style={styles.secondaryButton}
            >
              Pay Minimum (${paymentPlan.minimumPayment.toFixed(2)})
            </button>
          </div>

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
    borderRadius: '0.5rem'
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
  targetSliderContainer: {
    marginBottom: '1rem',
    padding: '1rem',
    background: '#1F2937',
    borderRadius: '0.75rem'
  },
  sliderLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  },
  slider: {
    width: '200px',
    marginLeft: '1rem'
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
    gridTemplateColumns: 'repeat(4, 1fr)',
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
  zeroPlanContainer: {
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1))',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    marginBottom: '1.5rem',
    border: '1px solid rgba(139, 92, 246, 0.3)'
  },
  zeroPlanTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    margin: '0 0 1rem 0',
    color: '#8B5CF6'
  },
  zeroPlanGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem',
    marginBottom: '1rem'
  },
  zeroPlanItem: {
    textAlign: 'center'
  },
  zeroPlanLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem'
  },
  zeroPlanValue: {
    fontSize: '1.125rem',
    fontWeight: 'bold',
    color: 'white'
  },
  strategyNote: {
    fontSize: '0.875rem',
    color: '#10B981',
    textAlign: 'center',
    paddingTop: '0.75rem',
    borderTop: '1px solid #374151'
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
  actionButtons: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1rem'
  },
  primaryButton: {
    flex: 1,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  zeroInterestButton: {
    flex: 1,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  secondaryButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer'
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