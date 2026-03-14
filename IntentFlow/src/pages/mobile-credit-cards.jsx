// src/pages/mobile-credit-cards.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import DatabaseProxy from '../services/databaseProxy.mjs';

export default function MobileCreditCards() {
  const [creditCards, setCreditCards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState({});
  const [filter, setFilter] = useState('all'); // 'all', 'urgent', 'due-soon'
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    loadCreditCards();
  }, []);

  const loadCreditCards = async () => {
    setIsLoading(true);
    try {
      // For now, use mock data until database is ready
      // In production, this would be: const result = await DatabaseProxy.getCreditCards(user?.id);
      const mockCards = [
        {
          id: 'card1',
          name: 'Chase Sapphire',
          institution: 'Chase',
          balance: -1250.50,
          limit: 5000,
          apr: 18.99,
          dueDate: '2025-04-15',
          lastStatementBalance: 1250.50,
          minimumPayment: 35,
          type: 'credit'
        },
        {
          id: 'card2',
          name: 'Apple Card',
          institution: 'Goldman Sachs',
          balance: -450.75,
          limit: 3000,
          apr: 15.99,
          dueDate: '2025-04-20',
          lastStatementBalance: 450.75,
          minimumPayment: 25,
          type: 'credit'
        },
        {
          id: 'card3',
          name: 'Capital One',
          institution: 'Capital One',
          balance: -875.25,
          limit: 4000,
          apr: 16.99,
          dueDate: '2025-04-10',
          lastStatementBalance: 875.25,
          minimumPayment: 30,
          type: 'credit'
        }
      ];
      setCreditCards(mockCards);
    } catch (error) {
      console.error('Error loading credit cards:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate card statistics
  const calculateCardStats = (card) => {
    const daysUntilDue = Math.ceil((new Date(card.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
    const utilization = (Math.abs(card.balance) / card.limit) * 100;
    const monthlyInterest = (Math.abs(card.balance) * (card.apr / 100)) / 12;
    
    return {
      daysUntilDue,
      isDueSoon: daysUntilDue <= 7 && daysUntilDue > 0,
      isOverdue: daysUntilDue < 0,
      utilization,
      utilizationColor: utilization > 80 ? '#EF4444' : utilization > 50 ? '#F59E0B' : '#10B981',
      monthlyInterest,
      minPayment: card.minimumPayment || Math.max(25, Math.abs(card.balance) * 0.02)
    };
  };

  // Filter cards based on selection
  const getFilteredCards = () => {
    return creditCards.filter(card => {
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
    const card = creditCards.find(c => c.id === cardId);
    const stats = calculateCardStats(card);
    setSelectedCard(cardId);
    setPaymentAmount({
      amount: Math.abs(card.lastStatementBalance),
      minPayment: stats.minPayment,
      cardId
    });
    setShowPaymentModal(true);
  };

  const submitPayment = async () => {
    // In production, this would call your payment API
    alert(`Payment of $${paymentAmount.amount} processed successfully!`);
    setShowPaymentModal(false);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(Math.abs(amount || 0));
  };

  const filteredCards = getFilteredCards();
  const totalBalance = creditCards.reduce((sum, c) => sum + Math.abs(c.balance || 0), 0);
  const totalLimit = creditCards.reduce((sum, c) => sum + (c.limit || 0), 0);
  const overallUtilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
  const urgentCount = creditCards.filter(c => {
    const stats = calculateCardStats(c);
    return stats.isOverdue || stats.isDueSoon;
  }).length;

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading your credit cards...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => router.back()} style={styles.backButton}>
          ←
        </button>
        <h1 style={styles.title}>💳 Credit Cards</h1>
        <button style={styles.addButton}>+</button>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>💰</span>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Total Balance</span>
            <span style={styles.summaryValue}>{formatCurrency(totalBalance)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>📊</span>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Total Limit</span>
            <span style={styles.summaryValue}>{formatCurrency(totalLimit)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>📈</span>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Utilization</span>
            <span style={styles.summaryValue}>{overallUtilization.toFixed(1)}%</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>⚠️</span>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Need Attention</span>
            <span style={styles.summaryValue}>{urgentCount}</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={styles.filterBar}>
        <button
          style={{
            ...styles.filterButton,
            ...(filter === 'all' ? styles.activeFilter : {})
          }}
          onClick={() => setFilter('all')}
        >
          All ({creditCards.length})
        </button>
        <button
          style={{
            ...styles.filterButton,
            ...(filter === 'due-soon' ? styles.activeFilter : {})
          }}
          onClick={() => setFilter('due-soon')}
        >
          Due Soon
        </button>
        <button
          style={{
            ...styles.filterButton,
            ...(filter === 'urgent' ? styles.activeFilter : {})
          }}
          onClick={() => setFilter('urgent')}
        >
          Urgent
        </button>
      </div>

      {/* Credit Cards List */}
      <div style={styles.cardsList}>
        {filteredCards.length === 0 ? (
          <div style={styles.emptyState}>
            <span style={styles.emptyIcon}>💳</span>
            <h3 style={styles.emptyTitle}>No credit cards</h3>
            <p style={styles.emptyText}>Add your first credit card to start tracking</p>
            <button style={styles.emptyButton}>Add Credit Card</button>
          </div>
        ) : (
          filteredCards.map((card) => {
            const stats = calculateCardStats(card);
            const isSelected = selectedCard === card.id;

            return (
              <div key={card.id} style={styles.cardItem}>
                {/* Card Header */}
                <div style={styles.cardHeader}>
                  <div>
                    <h3 style={styles.cardName}>{card.name}</h3>
                    <p style={styles.cardInstitution}>{card.institution}</p>
                  </div>
                  <span style={{
                    ...styles.utilizationBadge,
                    backgroundColor: stats.utilizationColor + '20',
                    color: stats.utilizationColor
                  }}>
                    {stats.utilization.toFixed(1)}%
                  </span>
                </div>

                {/* Balance */}
                <div style={styles.balanceSection}>
                  <span style={styles.balanceLabel}>Current Balance</span>
                  <span style={styles.balanceAmount}>{formatCurrency(card.balance)}</span>
                  <span style={styles.limitText}>of {formatCurrency(card.limit)} limit</span>
                </div>

                {/* Progress Bar */}
                <div style={styles.progressBar}>
                  <div style={{
                    ...styles.progressFill,
                    width: `${Math.min(stats.utilization, 100)}%`,
                    backgroundColor: stats.utilizationColor
                  }} />
                </div>

                {/* Due Date */}
                <div style={{
                  ...styles.dueDateSection,
                  backgroundColor: stats.isOverdue ? '#EF444420' : 
                                 stats.isDueSoon ? '#F59E0B20' : 'transparent'
                }}>
                  <span>Due: {new Date(card.dueDate).toLocaleDateString()}</span>
                  <span style={{
                    color: stats.isOverdue ? '#EF4444' : 
                           stats.isDueSoon ? '#F59E0B' : '#9CA3AF',
                    fontWeight: 'bold'
                  }}>
                    {stats.isOverdue ? 'OVERDUE' : 
                     stats.daysUntilDue > 0 ? `${stats.daysUntilDue} days` : 
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
                    <strong>{card.apr}%</strong>
                  </div>
                  <div style={styles.stat}>
                    <span>Interest</span>
                    <strong style={{ color: '#F59E0B' }}>
                      {formatCurrency(stats.monthlyInterest)}/mo
                    </strong>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={styles.cardActions}>
                  <button
                    style={styles.paymentButton}
                    onClick={() => handlePayment(card.id)}
                  >
                    Make Payment
                  </button>
                  <button
                    style={styles.detailsButton}
                    onClick={() => setSelectedCard(isSelected ? null : card.id)}
                  >
                    Details
                  </button>
                </div>

                {/* Expanded Details */}
                {isSelected && (
                  <div style={styles.expandedDetails}>
                    <h4 style={styles.expandedTitle}>Payment Strategy</h4>
                    <div style={styles.strategyGrid}>
                      <div style={styles.strategyCard}>
                        <span style={styles.strategyLabel}>Pay in Full By</span>
                        <span style={styles.strategyValue}>
                          {new Date(card.dueDate).toLocaleDateString()}
                        </span>
                        <span style={styles.strategyNote}>
                          Save {formatCurrency(stats.monthlyInterest)}
                        </span>
                      </div>
                      <div style={styles.strategyCard}>
                        <span style={styles.strategyLabel}>Payoff Time</span>
                        <span style={styles.strategyValue}>
                          {Math.ceil(Math.abs(card.balance) / stats.minPayment)} months
                        </span>
                        <span style={styles.strategyNote}>
                          with minimum payments
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Navigation */}
      <div style={styles.bottomNav}>
        <button style={styles.navItem} onClick={() => router.push('/mobile-home')}>
          <span style={styles.navIcon}>🏠</span>
          <span style={styles.navLabel}>Home</span>
        </button>
        <button style={styles.navItem} onClick={() => router.push('/mobile-budget')}>
          <span style={styles.navIcon}>📊</span>
          <span style={styles.navLabel}>Budget</span>
        </button>
        <button style={styles.navItem}>
          <span style={styles.navIcon}>➕</span>
          <span style={styles.navLabel}>Add</span>
        </button>
        <button style={{...styles.navItem, ...styles.activeNavItem}}>
          <span style={styles.navIcon}>💳</span>
          <span style={styles.navLabel}>Cards</span>
        </button>
        <button style={styles.navItem} onClick={() => router.push('/mobile-settings')}>
          <span style={styles.navIcon}>⚙️</span>
          <span style={styles.navLabel}>Settings</span>
        </button>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div style={styles.modalOverlay} onClick={() => setShowPaymentModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Make Payment</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount</label>
              <div style={styles.amountInput}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={paymentAmount.amount}
                  onChange={(e) => setPaymentAmount({...paymentAmount, amount: parseFloat(e.target.value)})}
                  style={styles.modalInput}
                  step="0.01"
                  min={paymentAmount.minPayment}
                  autoFocus
                />
              </div>
              <div style={styles.paymentHints}>
                <span>Min: {formatCurrency(paymentAmount.minPayment)}</span>
                <span>Full: {formatCurrency(paymentAmount.amount)}</span>
              </div>
            </div>

            <div style={styles.modalActions}>
              <button style={styles.cancelButton} onClick={() => setShowPaymentModal(false)}>
                Cancel
              </button>
              <button style={styles.submitButton} onClick={submitPayment}>
                Pay Now
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
    minHeight: '100vh',
    background: '#0f2e1c',
    color: 'white',
    paddingBottom: '80px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f2e1c',
    color: 'white',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#3B82F6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  loadingText: {
    fontSize: '16px',
    color: '#9CA3AF',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    paddingTop: '60px',
    background: '#0047AB',
  },
  backButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    margin: 0,
  },
  addButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: '#3B82F6',
    border: 'none',
    color: 'white',
    fontSize: '24px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    padding: '20px',
  },
  summaryCard: {
    background: '#1F2937',
    padding: '16px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  summaryIcon: {
    fontSize: '24px',
  },
  summaryContent: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: '11px',
    color: '#9CA3AF',
    marginBottom: '2px',
  },
  summaryValue: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  filterBar: {
    display: 'flex',
    gap: '8px',
    padding: '0 20px',
    marginBottom: '20px',
  },
  filterButton: {
    flex: 1,
    padding: '8px',
    background: '#1F2937',
    border: '1px solid #374151',
    borderRadius: '20px',
    color: '#9CA3AF',
    fontSize: '12px',
    cursor: 'pointer',
  },
  activeFilter: {
    background: '#3B82F6',
    color: 'white',
    borderColor: '#3B82F6',
  },
  cardsList: {
    padding: '0 20px',
  },
  cardItem: {
    background: '#1F2937',
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '16px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  cardName: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 4px 0',
  },
  cardInstitution: {
    fontSize: '12px',
    color: '#9CA3AF',
    margin: 0,
  },
  utilizationBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
  },
  balanceSection: {
    marginBottom: '12px',
  },
  balanceLabel: {
    fontSize: '11px',
    color: '#9CA3AF',
    display: 'block',
    marginBottom: '4px',
  },
  balanceAmount: {
    fontSize: '24px',
    fontWeight: 'bold',
    display: 'block',
    marginBottom: '4px',
  },
  limitText: {
    fontSize: '11px',
    color: '#9CA3AF',
  },
  progressBar: {
    height: '6px',
    background: '#374151',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '12px',
  },
  progressFill: {
    height: '100%',
    borderRadius: '3px',
  },
  dueDateSection: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderRadius: '8px',
    marginBottom: '12px',
    fontSize: '12px',
  },
  quickStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginBottom: '12px',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    fontSize: '11px',
    color: '#9CA3AF',
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
  },
  paymentButton: {
    flex: 1,
    padding: '10px',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  detailsButton: {
    flex: 1,
    padding: '10px',
    background: '#374151',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '12px',
    cursor: 'pointer',
  },
  expandedDetails: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #374151',
  },
  expandedTitle: {
    fontSize: '14px',
    fontWeight: '600',
    margin: '0 0 12px 0',
  },
  strategyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  strategyCard: {
    background: '#111827',
    padding: '10px',
    borderRadius: '8px',
    textAlign: 'center',
  },
  strategyLabel: {
    fontSize: '10px',
    color: '#9CA3AF',
    display: 'block',
    marginBottom: '4px',
  },
  strategyValue: {
    fontSize: '12px',
    fontWeight: '600',
    display: 'block',
    marginBottom: '4px',
  },
  strategyNote: {
    fontSize: '10px',
    color: '#10B981',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  emptyIcon: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '8px',
  },
  emptyText: {
    fontSize: '14px',
    color: '#9CA3AF',
    marginBottom: '20px',
  },
  emptyButton: {
    padding: '12px 24px',
    background: '#3B82F6',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
  bottomNav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    background: '#1F2937',
    padding: '8px 0',
    paddingBottom: '24px',
    borderTop: '1px solid #374151',
  },
  navItem: {
    flex: 1,
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  },
  activeNavItem: {
    color: '#3B82F6',
  },
  navIcon: {
    fontSize: '20px',
  },
  navLabel: {
    fontSize: '10px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: '#1F2937',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '300px',
    width: '90%',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: '0 0 20px 0',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    color: '#9CA3AF',
  },
  amountInput: {
    position: 'relative',
  },
  currencySymbol: {
    position: 'absolute',
    left: '12px',
    top: '12px',
    color: '#9CA3AF',
  },
  modalInput: {
    width: '100%',
    padding: '12px',
    paddingLeft: '32px',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    color: 'white',
    fontSize: '16px',
  },
  paymentHints: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '8px',
    fontSize: '12px',
    color: '#9CA3AF',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
  },
  cancelButton: {
    flex: 1,
    padding: '12px',
    background: '#374151',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
  submitButton: {
    flex: 1,
    padding: '12px',
    background: '#3B82F6',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};