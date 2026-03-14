// src/views/CreditCardManager.jsx
import React, { useState } from 'react';

export default function CreditCardManager({ 
  cards = [], 
  transactions = [],
  onMakePayment,
  onEditCard,
  onAddCard,
  onViewTransactions,
  onOpenPlanner
}) {
  const [selectedCard, setSelectedCard] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState({});
  const [filter, setFilter] = useState('all'); // 'all', 'urgent', 'due-soon'

  // Calculate card statistics
  const calculateCardStats = (card) => {
    const cardTransactions = transactions.filter(t => t.account_id === card.id);
    
    // Current statement balance (transactions this month)
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    
    const statementBalance = cardTransactions
      .filter(t => t.date >= firstOfMonth)
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Minimum payment (typically 1-3% of balance)
    const minPayment = card.minimumPayment || Math.max(25, Math.abs(card.balance) * 0.02);
    
    // Days until due date
    const dueDate = new Date(card.dueDate);
    const today = new Date();
    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    // Utilization percentage
    const utilization = (Math.abs(card.balance) / (card.limit || 1000)) * 100;
    
    // Interest calculation (if not paid in full)
    const monthlyRate = (card.apr || 18.99) / 100 / 12;
    const interestIfNotPaid = Math.abs(card.balance) * monthlyRate;
    
    return {
      statementBalance: Math.abs(statementBalance || card.lastStatementBalance || card.balance),
      minPayment: Math.round(minPayment * 100) / 100,
      daysUntilDue,
      isDueSoon: daysUntilDue <= 7 && daysUntilDue > 0,
      isOverdue: daysUntilDue < 0,
      utilization,
      utilizationColor: utilization > 80 ? '#EF4444' : utilization > 50 ? '#F59E0B' : '#10B981',
      interestIfNotPaid: Math.round(interestIfNotPaid * 100) / 100
    };
  };

  // Filter cards based on selection
  const getFilteredCards = () => {
    return cards.filter(card => {
      const stats = calculateCardStats(card);
      switch(filter) {
        case 'urgent':
          return stats.isOverdue;
        case 'due-soon':
          return stats.isDueSoon && !stats.isOverdue;
        default:
          return true;
      }
    });
  };

  const handlePayment = (cardId) => {
    const card = cards.find(c => c.id === cardId);
    const stats = calculateCardStats(card);
    setSelectedCard(cardId);
    setPaymentAmount({
      amount: stats.statementBalance,
      minPayment: stats.minPayment,
      cardId
    });
    setShowPaymentModal(true);
  };

  const submitPayment = async () => {
    if (onMakePayment) {
      const result = await onMakePayment({
        cardId: selectedCard,
        amount: paymentAmount.amount,
        date: new Date().toISOString().split('T')[0],
        accountId: selectedCard
      });
      if (result?.success) {
        setShowPaymentModal(false);
      }
    }
  };

  const handleEditClick = (e, card) => {
    e.stopPropagation();
    if (onEditCard) {
      onEditCard(card);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(Math.abs(amount || 0));
  };

  const filteredCards = getFilteredCards();
  const totalBalance = cards.reduce((sum, c) => sum + Math.abs(c.balance || 0), 0);
  const totalLimit = cards.reduce((sum, c) => sum + (c.limit || 0), 0);
  const overallUtilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
  const urgentCount = cards.filter(c => {
    const stats = calculateCardStats(c);
    return stats.isOverdue || stats.isDueSoon;
  }).length;

  return (
    <div style={styles.container}>
      {/* Header with Navigation */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>💳 Credit Card Dashboard</h2>
          <p style={styles.subtitle}>Manage all your credit cards in one place</p>
        </div>
        <div style={styles.headerActions}>
          <button
            onClick={onOpenPlanner}
            style={styles.plannerButton}
          >
            📈 Open Planner
          </button>
          <button
            onClick={onAddCard}
            style={styles.addButton}
          >
            ➕ Add Credit Card
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💰</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Total Balance</div>
            <div style={styles.summaryValue}>{formatCurrency(totalBalance)}</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📊</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Total Credit Limit</div>
            <div style={styles.summaryValue}>{formatCurrency(totalLimit)}</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📈</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Overall Utilization</div>
            <div style={styles.summaryValue}>{overallUtilization.toFixed(1)}%</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>⚠️</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Need Attention</div>
            <div style={styles.summaryValue}>{urgentCount}</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={styles.filterTabs}>
        <button
          onClick={() => setFilter('all')}
          style={{
            ...styles.filterTab,
            ...(filter === 'all' ? styles.activeFilter : {})
          }}
        >
          All Cards ({cards.length})
        </button>
        <button
          onClick={() => setFilter('due-soon')}
          style={{
            ...styles.filterTab,
            ...(filter === 'due-soon' ? styles.activeFilter : {})
          }}
        >
          Due Soon ({cards.filter(c => {
            const stats = calculateCardStats(c);
            return stats.isDueSoon && !stats.isOverdue;
          }).length})
        </button>
        <button
          onClick={() => setFilter('urgent')}
          style={{
            ...styles.filterTab,
            ...(filter === 'urgent' ? styles.activeFilter : {})
          }}
        >
          Overdue ({cards.filter(c => {
            const stats = calculateCardStats(c);
            return stats.isOverdue;
          }).length})
        </button>
      </div>

      {/* Cards Grid */}
      {filteredCards.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>💳</div>
          <h3 style={styles.emptyTitle}>No credit cards found</h3>
          <p style={styles.emptyText}>
            {filter === 'all' 
              ? 'Get started by adding your first credit card'
              : 'No cards match the selected filter'}
          </p>
          {filter === 'all' && (
            <button onClick={onAddCard} style={styles.emptyAddButton}>
              ➕ Add Your First Credit Card
            </button>
          )}
        </div>
      ) : (
        <div style={styles.cardsGrid}>
          {filteredCards.map(card => {
            const stats = calculateCardStats(card);
            const isSelected = selectedCard === card.id;

            return (
              <div
                key={card.id}
                style={{
                  ...styles.cardItem,
                  ...(isSelected ? styles.selectedCard : {}),
                  borderLeft: `4px solid ${
                    stats.isOverdue ? '#EF4444' : 
                    stats.isDueSoon ? '#F59E0B' : 
                    stats.utilizationColor
                  }`
                }}
                onClick={() => setSelectedCard(isSelected ? null : card.id)}
              >
                {/* Edit Button */}
                <button
                  onClick={(e) => handleEditClick(e, card)}
                  style={styles.editButton}
                  title="Edit Card"
                >
                  ✏️
                </button>

                {/* Card Header */}
                <div style={styles.cardHeader}>
                  <div>
                    <h3 style={styles.cardName}>{card.name}</h3>
                    <div style={styles.cardInstitution}>{card.institution || 'Credit Card'}</div>
                  </div>
                  <div style={{
                    ...styles.utilizationBadge,
                    background: stats.utilizationColor + '20',
                    color: stats.utilizationColor
                  }}>
                    {stats.utilization.toFixed(1)}% utilized
                  </div>
                </div>

                {/* Balance */}
                <div style={styles.balanceSection}>
                  <div style={styles.balanceLabel}>Current Balance</div>
                  <div style={{
                    ...styles.balanceAmount,
                    color: card.balance < 0 ? '#EF4444' : '#10B981'
                  }}>
                    {formatCurrency(card.balance)}
                  </div>
                  <div style={styles.limitText}>
                    of {formatCurrency(card.limit || 0)} limit
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={styles.progressBar}>
                  <div style={{
                    ...styles.progressFill,
                    width: `${Math.min(stats.utilization, 100)}%`,
                    background: stats.utilizationColor
                  }} />
                </div>

                {/* Due Date */}
                <div style={{
                  ...styles.dueDateSection,
                  background: stats.isOverdue ? '#EF444420' : 
                             stats.isDueSoon ? '#F59E0B20' : 'transparent'
                }}>
                  <span>Due: {card.dueDate ? new Date(card.dueDate).toLocaleDateString() : 'Not set'}</span>
                  <span style={{
                    color: stats.isOverdue ? '#EF4444' : 
                           stats.isDueSoon ? '#F59E0B' : '#9CA3AF',
                    fontWeight: 'bold'
                  }}>
                    {stats.isOverdue ? 'OVERDUE' : 
                     stats.daysUntilDue > 0 ? `${stats.daysUntilDue} days left` : 
                     'Due today'}
                  </span>
                </div>

                {/* Quick Stats */}
                <div style={styles.quickStats}>
                  <div style={styles.stat}>
                    <span>Min Payment</span>
                    <strong>{formatCurrency(stats.minPayment)}</strong>
                  </div>
                  <div style={styles.stat}>
                    <span>APR</span>
                    <strong>{card.apr || 18.99}%</strong>
                  </div>
                  <div style={styles.stat}>
                    <span>Interest</span>
                    <strong style={{ color: '#F59E0B' }}>
                      {formatCurrency(stats.interestIfNotPaid)}/mo
                    </strong>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={styles.cardActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePayment(card.id);
                    }}
                    style={styles.paymentButton}
                  >
                    💰 Make Payment
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewTransactions(card.id);
                    }}
                    style={styles.transactionsButton}
                  >
                    📋 Transactions
                  </button>
                </div>

                {/* Expanded Details */}
                {isSelected && (
                  <div style={styles.expandedDetails}>
                    <h4 style={styles.expandedTitle}>Payment Strategy</h4>
                    <div style={styles.strategyGrid}>
                      <div style={styles.strategyCard}>
                        <div style={styles.strategyLabel}>Pay in Full By</div>
                        <div style={styles.strategyValue}>
                          {card.dueDate ? new Date(card.dueDate).toLocaleDateString() : 'Not set'}
                        </div>
                        <div style={styles.strategyNote}>
                          Save {formatCurrency(stats.interestIfNotPaid)} in interest
                        </div>
                      </div>
                      <div style={styles.strategyCard}>
                        <div style={styles.strategyLabel}>Payoff Time</div>
                        <div style={styles.strategyValue}>
                          {Math.ceil(Math.abs(card.balance) / stats.minPayment)} months
                        </div>
                        <div style={styles.strategyNote}>
                          with minimum payments
                        </div>
                      </div>
                    </div>

                    {/* Recent Transactions Preview */}
                    {transactions.filter(t => t.account_id === card.id).length > 0 && (
                      <div style={styles.recentTransactions}>
                        <h4 style={styles.expandedTitle}>Recent Transactions</h4>
                        {transactions
                          .filter(t => t.account_id === card.id)
                          .slice(0, 3)
                          .map(t => (
                            <div key={t.id} style={styles.transactionItem}>
                              <span>{new Date(t.date).toLocaleDateString()}</span>
                              <span>{t.description || 'Transaction'}</span>
                              <span style={{ color: t.amount < 0 ? '#EF4444' : '#10B981' }}>
                                {formatCurrency(t.amount)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div style={styles.modalOverlay} onClick={() => setShowPaymentModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Make a Payment</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Payment Amount</label>
              <div style={styles.inputWrapper}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={paymentAmount.amount}
                  onChange={(e) => setPaymentAmount({...paymentAmount, amount: parseFloat(e.target.value)})}
                  min={paymentAmount.minPayment}
                  step="0.01"
                  style={styles.modalInput}
                  autoFocus
                />
              </div>
              <div style={styles.paymentHints}>
                <span>Min: {formatCurrency(paymentAmount.minPayment)}</span>
                <button
                  onClick={() => setPaymentAmount({...paymentAmount, amount: paymentAmount.amount})}
                  style={styles.fullPaymentHint}
                >
                  Full: {formatCurrency(paymentAmount.amount)}
                </button>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Payment Date</label>
              <input
                type="date"
                value={new Date().toISOString().split('T')[0]}
                style={styles.modalInput}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={submitPayment}
                style={styles.submitButton}
              >
                Submit Payment
              </button>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1400px',
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
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    margin: '0 0 0.25rem 0',
    background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    margin: 0
  },
  headerActions: {
    display: 'flex',
    gap: '1rem'
  },
  plannerButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  addButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
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
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white'
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
    fontSize: '0.875rem',
    transition: 'all 0.2s'
  },
  activeFilter: {
    background: '#3B82F6',
    color: 'white'
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '1.5rem'
  },
  cardItem: {
    background: '#1F2937',
    borderRadius: '1rem',
    padding: '1.5rem',
    border: '1px solid #374151',
    position: 'relative',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    }
  },
  selectedCard: {
    border: '2px solid #3B82F6'
  },
  editButton: {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '0.25rem',
    borderRadius: '0.25rem',
    ':hover': {
      background: '#374151',
      color: 'white'
    }
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
    marginRight: '2rem'
  },
  cardName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    margin: '0 0 0.25rem 0',
    color: 'white'
  },
  cardInstitution: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  utilizationBadge: {
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: '600'
  },
  balanceSection: {
    marginBottom: '1rem'
  },
  balanceLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem'
  },
  balanceAmount: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    lineHeight: '1.2'
  },
  limitText: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginTop: '0.25rem'
  },
  progressBar: {
    height: '0.5rem',
    background: '#374151',
    borderRadius: '0.25rem',
    overflow: 'hidden',
    marginBottom: '1rem'
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  dueDateSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
    fontSize: '0.875rem'
  },
  quickStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
    marginBottom: '1rem'
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  cardActions: {
    display: 'flex',
    gap: '0.5rem'
  },
  paymentButton: {
    flex: 1,
    padding: '0.5rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  transactionsButton: {
    flex: 1,
    padding: '0.5rem',
    background: 'transparent',
    border: '1px solid #3B82F6',
    color: '#3B82F6',
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
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.75rem',
    marginBottom: '1rem'
  },
  strategyCard: {
    background: '#111827',
    padding: '0.75rem',
    borderRadius: '0.5rem'
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
    color: 'white',
    marginBottom: '0.25rem'
  },
  strategyNote: {
    fontSize: '0.625rem',
    color: '#10B981'
  },
  recentTransactions: {
    background: '#111827',
    padding: '0.75rem',
    borderRadius: '0.5rem'
  },
  transactionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0',
    borderBottom: '1px solid #374151',
    fontSize: '0.75rem',
    ':last-child': {
      borderBottom: 'none'
    }
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
  emptyAddButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    cursor: 'pointer'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: '#1F2937',
    borderRadius: '1rem',
    padding: '2rem',
    maxWidth: '400px',
    width: '90%'
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: '0 0 1.5rem 0',
    color: 'white'
  },
  formGroup: {
    marginBottom: '1.5rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  },
  inputWrapper: {
    position: 'relative'
  },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF'
  },
  modalInput: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  paymentHints: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  fullPaymentHint: {
    background: 'none',
    border: 'none',
    color: '#3B82F6',
    cursor: 'pointer',
    fontSize: '0.75rem'
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem'
  },
  submitButton: {
    flex: 2,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#6B7280',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer'
  }
};