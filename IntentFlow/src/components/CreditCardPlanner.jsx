import React, { useState, useEffect } from 'react';

export default function CreditCardPlanner({ categories, onPaymentPlanned }) {
  const [creditCards, setCreditCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [paymentPlan, setPaymentPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load credit card accounts and data
  useEffect(() => {
    loadCreditCardData();
  }, []);

  const loadCreditCardData = async () => {
    setIsLoading(true);
    try {
      // Try to get from database first
      if (window.electronAPI?.getCreditCards) {
        const cards = await window.electronAPI.getCreditCards();
        setCreditCards(cards);
      } else {
        // Mock data for development
        const mockCards = [
          {
            id: 1,
            name: 'Chase Sapphire',
            balance: 1250.50,
            statementBalance: 1250.50,
            dueDate: '2024-04-15',
            availableCredit: 5000,
            interestRate: 18.99,
            minimumPayment: 35,
            reservedFunds: 800 // From budget
          },
          {
            id: 2,
            name: 'Apple Card',
            balance: 450.75,
            statementBalance: 450.75,
            dueDate: '2024-04-20',
            availableCredit: 3000,
            interestRate: 15.99,
            minimumPayment: 25,
            reservedFunds: 450.75
          }
        ];
        setCreditCards(mockCards);
      }
    } catch (error) {
      console.error('Error loading credit cards:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculatePaymentStrategy = (card) => {
    // Find the credit card payment category in budget
    const paymentCategory = categories.find(c => 
      c.name.toLowerCase().includes('credit card') || 
      c.category_type === 'debt'
    );

    const reservedFunds = paymentCategory?.available || card.reservedFunds || 0;
    const daysUntilDue = Math.ceil((new Date(card.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
    
    const canPayInFull = reservedFunds >= card.statementBalance;
    const shortfall = card.statementBalance - reservedFunds;
    
    // Calculate optimal payment date (few days before due date)
    const optimalDate = new Date(card.dueDate);
    optimalDate.setDate(optimalDate.getDate() - 3);
    
    // Calculate interest if not paid in full
    const monthlyInterestRate = card.interestRate / 100 / 12;
    const estimatedInterest = canPayInFull ? 0 : (card.statementBalance * monthlyInterestRate);

    return {
      cardId: card.id,
      cardName: card.name,
      statementBalance: card.statementBalance,
      reservedFunds,
      canPayInFull,
      shortfall: canPayInFull ? 0 : shortfall,
      daysUntilDue,
      optimalPaymentDate: optimalDate.toISOString().split('T')[0],
      recommendedPayment: canPayInFull ? card.statementBalance : reservedFunds,
      estimatedInterest,
      minimumPayment: card.minimumPayment,
      status: canPayInFull ? 'safe' : shortfall > 0 ? 'danger' : 'warning',
      suggestions: canPayInFull 
        ? ['You have enough reserved to pay in full. Great job!']
        : [
            `Need $${shortfall.toFixed(2)} more to pay in full`,
            `Consider moving from: ${getSuggestionsForCategories(categories, shortfall)}`,
            `Pay at least $${card.minimumPayment} to avoid late fees`
          ]
    };
  };

  const getSuggestionsForCategories = (categories, neededAmount) => {
    // Find categories with available funds
    const availableCategories = categories
      .filter(c => c.available > 0 && c.category_type !== 'debt')
      .sort((a, b) => b.available - a.available)
      .slice(0, 3)
      .map(c => c.name)
      .join(', ');
    
    return availableCategories || 'discretionary spending';
  };

  const handleCardSelect = (card) => {
    setSelectedCard(card);
    const plan = calculatePaymentStrategy(card);
    setPaymentPlan(plan);
  };

  const handleSchedulePayment = async () => {
    if (!paymentPlan) return;

    try {
      // In a real app, this would:
      // 1. Schedule the payment in the database
      // 2. Possibly integrate with bank API to schedule transfer
      // 3. Update the budget to show scheduled payment
      
      alert(`✅ Payment scheduled for ${paymentPlan.optimalPaymentDate}`);
      
      if (onPaymentPlanned) {
        onPaymentPlanned(paymentPlan);
      }
    } catch (error) {
      console.error('Error scheduling payment:', error);
      alert('Failed to schedule payment. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Analyzing your credit cards...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>💳 Credit Card Strategist</h2>
        <p style={styles.subtitle}>
          Plan your payments to avoid interest and optimize cash flow
        </p>
      </div>

      {/* Credit Card List */}
      <div style={styles.cardList}>
        {creditCards.map(card => {
          const daysUntilDue = Math.ceil((new Date(card.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
          const isUrgent = daysUntilDue <= 7;
          const reserved = categories.find(c => c.name.toLowerCase().includes('credit card'))?.available || 0;
          const canPay = reserved >= card.statementBalance;

          return (
            <div
              key={card.id}
              onClick={() => handleCardSelect(card)}
              style={{
                ...styles.cardItem,
                borderLeft: `4px solid ${
                  isUrgent ? '#EF4444' : canPay ? '#10B981' : '#F59E0B'
                }`,
                background: selectedCard?.id === card.id ? '#374151' : '#1F2937'
              }}
            >
              <div style={styles.cardHeader}>
                <div>
                  <div style={styles.cardName}>{card.name}</div>
                  <div style={styles.cardBalance}>
                    Balance: ${card.balance.toFixed(2)}
                  </div>
                </div>
                <div style={styles.cardDue}>
                  <div style={styles.dueLabel}>Due in</div>
                  <div style={{
                    ...styles.dueDays,
                    color: isUrgent ? '#EF4444' : '#9CA3AF'
                  }}>
                    {daysUntilDue} days
                  </div>
                </div>
              </div>

              <div style={styles.progressSection}>
                <div style={styles.progressLabel}>
                  <span>Reserved: ${reserved.toFixed(2)}</span>
                  <span>Statement: ${card.statementBalance.toFixed(2)}</span>
                </div>
                <div style={styles.progressBar}>
                  <div style={{
                    ...styles.progressFill,
                    width: `${Math.min(100, (reserved / card.statementBalance) * 100)}%`,
                    background: reserved >= card.statementBalance 
                      ? 'linear-gradient(90deg, #10B981, #34D399)'
                      : 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                  }} />
                </div>
              </div>

              {isUrgent && (
                <div style={styles.urgentBadge}>
                  ⚠️ Due soon - schedule payment
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment Plan Details */}
      {paymentPlan && (
        <div style={styles.planContainer}>
          <h3 style={styles.planTitle}>
            Payment Plan for {paymentPlan.cardName}
          </h3>

          <div style={styles.planGrid}>
            <div style={styles.planItem}>
              <div style={styles.planLabel}>Statement Balance</div>
              <div style={styles.planValue}>
                ${paymentPlan.statementBalance.toFixed(2)}
              </div>
            </div>

            <div style={styles.planItem}>
              <div style={styles.planLabel}>Reserved Funds</div>
              <div style={{
                ...styles.planValue,
                color: paymentPlan.reservedFunds >= paymentPlan.statementBalance 
                  ? '#10B981' : '#F59E0B'
              }}>
                ${paymentPlan.reservedFunds.toFixed(2)}
              </div>
            </div>

            <div style={styles.planItem}>
              <div style={styles.planLabel}>Days Until Due</div>
              <div style={styles.planValue}>
                {paymentPlan.daysUntilDue}
              </div>
            </div>

            <div style={styles.planItem}>
              <div style={styles.planLabel}>Optimal Payment Date</div>
              <div style={styles.planValue}>
                {new Date(paymentPlan.optimalPaymentDate).toLocaleDateString()}
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
            borderLeft: `4px solid ${
              paymentPlan.canPayInFull 
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
            <button
              onClick={handleSchedulePayment}
              style={{
                ...styles.primaryButton,
                opacity: paymentPlan.recommendedPayment > 0 ? 1 : 0.5
              }}
              disabled={paymentPlan.recommendedPayment <= 0}
            >
              💰 Schedule Payment of ${paymentPlan.recommendedPayment.toFixed(2)}
            </button>
            
            <button
              onClick={() => {
                const amount = prompt('Enter amount to transfer to credit card category:');
                if (amount) {
                  // This would call your assignToCategory function
                  alert(`Would transfer $${amount} to credit card payment`);
                }
              }}
              style={styles.secondaryButton}
            >
              🔄 Move Money to Credit Card
            </button>
          </div>

          {/* Interest Warning */}
          {paymentPlan.estimatedInterest > 0 && (
            <div style={styles.interestWarning}>
              ⚠️ If you don't pay in full, you'll incur approximately 
              <strong> ${paymentPlan.estimatedInterest.toFixed(2)}</strong> in interest next month
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {creditCards.length === 0 && !isLoading && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>💳</div>
          <h3 style={styles.emptyTitle}>No credit cards found</h3>
          <p style={styles.emptyText}>
            Add a credit card account to start planning interest-free payments
          </p>
          <button style={styles.addButton}>
            + Add Credit Card
          </button>
        </div>
      )}
    </div>
  );
}

// Styles object for consistent design
const styles = {
  container: {
    background: '#111827',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    border: '1px solid #374151'
  },
  header: {
    marginBottom: '2rem'
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    margin: '0 0 0.5rem 0',
    background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: '0.875rem',
    margin: 0
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginBottom: '2rem'
  },
  cardItem: {
    background: '#1F2937',
    padding: '1.25rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: '1px solid #374151'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '1rem'
  },
  cardName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '0.25rem'
  },
  cardBalance: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  cardDue: {
    textAlign: 'right'
  },
  dueLabel: {
    fontSize: '0.75rem',
    color: '#6B7280'
  },
  dueDays: {
    fontSize: '1.25rem',
    fontWeight: 'bold'
  },
  progressSection: {
    marginBottom: '0.75rem'
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
    borderRadius: '9999px',
    transition: 'width 0.3s ease'
  },
  urgentBadge: {
    fontSize: '0.75rem',
    color: '#EF4444',
    marginTop: '0.5rem'
  },
  planContainer: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  planTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: '0 0 1.5rem 0',
    color: 'white'
  },
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
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
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white'
  },
  statusMessage: {
    display: 'flex',
    gap: '1rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    marginBottom: '1.5rem'
  },
  statusIcon: {
    fontSize: '1.5rem'
  },
  statusTitle: {
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
    flex: 2,
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '500',
    cursor: 'pointer'
  },
  secondaryButton: {
    flex: 1,
    background: 'transparent',
    color: '#9CA3AF',
    border: '1px solid #374151',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    cursor: 'pointer'
  },
  interestWarning: {
    fontSize: '0.875rem',
    color: '#F59E0B',
    textAlign: 'center',
    padding: '0.75rem',
    background: 'rgba(245, 158, 11, 0.1)',
    borderRadius: '0.5rem'
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem'
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
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    cursor: 'pointer'
  },
  loadingContainer: {
    padding: '3rem',
    textAlign: 'center',
    color: '#9CA3AF'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #374151',
    borderTopColor: '#3B82F6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 1rem'
  }
};

// Add keyframes for spinner animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);