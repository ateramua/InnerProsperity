// src/pages/mobile-debt.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import AddTransactionModal from '../components/mobile/AddTransactionModal';
import TransferModal from '../components/mobile/TransferModal';
import DatabaseProxy from '../services/databaseProxy.mjs';

export default function MobileDebt() {
  const [debts, setDebts] = useState([]);
  const [creditCards, setCreditCards] = useState([]);
  const [loans, setLoans] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [strategy, setStrategy] = useState('avalanche'); // 'avalanche' or 'snowball'
  const [extraPayment, setExtraPayment] = useState(0);
  const [showProjection, setShowProjection] = useState(false);
  
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    loadDebtData();
  }, []);

  const loadDebtData = async () => {
    setIsLoading(true);
    try {
      // Load credit cards
      const cardsResult = await window.electronAPI?.getCreditCards?.(user?.id);
      if (cardsResult?.success) {
        setCreditCards(cardsResult.data || []);
      }

      // Load loans
      const loansResult = await window.electronAPI?.getLoans?.(user?.id);
      if (loansResult?.success) {
        setLoans(loansResult.data || []);
      }

      // Load accounts for transfers
     const accountsResult = await DatabaseProxy.getAccounts(user?.id);
      if (accountsResult?.success) {
        setAccounts(accountsResult.data || []);
      }

      // Load categories
      const categoriesResult = await DatabaseProxy.getCategories(user?.id);
      if (categoriesResult?.success) {
        setCategories(categoriesResult.data || []);
      }

      // Combine all debts
      const allDebts = [
        ...(cardsResult?.data || []).map(card => ({
          id: card.id,
          name: card.name,
          type: 'credit',
          balance: Math.abs(card.balance || 0),
          limit: card.limit,
          apr: card.apr || 0,
          minPayment: card.minimumPayment || Math.max(25, Math.abs(card.balance || 0) * 0.02),
          dueDate: card.dueDate,
          institution: card.institution,
          color: '#F59E0B',
          icon: '💳'
        })),
        ...(loansResult?.data || []).map(loan => ({
          id: loan.id,
          name: loan.name,
          type: loan.type || 'loan',
          balance: Math.abs(loan.balance || 0),
          originalBalance: loan.originalBalance || Math.abs(loan.balance || 0),
          apr: loan.interestRate || 0,
          minPayment: loan.monthlyPayment || 0,
          term: loan.term,
          remainingPayments: loan.remainingPayments,
          lender: loan.lender,
          color: '#3B82F6',
          icon: loan.type === 'auto' ? '🚗' : 
                 loan.type === 'student' ? '🎓' : 
                 loan.type === 'mortgage' ? '🏠' : '🏦'
        }))
      ];

      setDebts(allDebts);
    } catch (error) {
      console.error('Error loading debt data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate payoff order based on strategy
  const getPrioritizedDebts = () => {
    const debtsWithInterest = debts.map(d => ({
      ...d,
      monthlyInterest: (d.balance * (d.apr / 100)) / 12
    }));

    if (strategy === 'avalanche') {
      // Highest APR first
      return [...debtsWithInterest].sort((a, b) => b.apr - a.apr);
    } else {
      // Smallest balance first
      return [...debtsWithInterest].sort((a, b) => a.balance - b.balance);
    }
  };

  // Calculate payoff projections
  const calculatePayoffProjection = () => {
    const prioritized = getPrioritizedDebts();
    let remainingBalance = [...prioritized];
    let monthlyPayment = debts.reduce((sum, d) => sum + d.minPayment, 0) + extraPayment;
    let months = 0;
    let totalInterest = 0;
    const projection = [];

    while (remainingBalance.length > 0 && months < 360) { // 30 year max
      months++;
      let monthData = {
        month: months,
        payments: [],
        totalBalance: remainingBalance.reduce((sum, d) => sum + d.balance, 0),
        totalInterest: 0
      };

      let remainingMonthly = monthlyPayment;

      // Pay minimum on all debts
      for (let debt of remainingBalance) {
        const minPayment = Math.min(debt.minPayment, debt.balance);
        if (remainingMonthly >= minPayment) {
          debt.balance -= minPayment;
          remainingMonthly -= minPayment;
          
          // Calculate interest for this debt
          const monthlyInterest = (debt.balance * (debt.apr / 100)) / 12;
          totalInterest += monthlyInterest;
          monthData.totalInterest += monthlyInterest;
          
          monthData.payments.push({
            debtId: debt.id,
            name: debt.name,
            amount: minPayment,
            type: 'minimum'
          });
        }
      }

      // Put extra toward highest priority debt
      if (remainingMonthly > 0 && remainingBalance.length > 0) {
        const targetDebt = remainingBalance[0];
        const extraAmount = Math.min(remainingMonthly, targetDebt.balance);
        targetDebt.balance -= extraAmount;
        
        monthData.payments.push({
          debtId: targetDebt.id,
          name: targetDebt.name,
          amount: extraAmount,
          type: 'extra'
        });
      }

      // Remove paid off debts
      remainingBalance = remainingBalance.filter(d => d.balance > 0.01);
      
      projection.push(monthData);
    }

    return {
      months,
      totalInterest,
      projection,
      debtFreeDate: new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000)
    };
  };

  const prioritizedDebts = getPrioritizedDebts();
  const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalMinPayment = debts.reduce((sum, d) => sum + d.minPayment, 0);
  const avgApr = debts.length > 0 ? debts.reduce((sum, d) => sum + d.apr, 0) / debts.length : 0;
  const payoffProjection = calculatePayoffProjection();

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatPercent = (value) => {
    return `${value.toFixed(1)}%`;
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const handleMakePayment = (debt) => {
    setSelectedDebt(debt);
    // Would open payment modal
    alert(`Make payment to ${debt.name}`);
  };

  const handleTransferToDebt = (debt) => {
    setSelectedDebt(debt);
    setShowTransferModal(true);
  };

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Analyzing your debt...</p>
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
        <h1 style={styles.title}>Debt Payoff Planner</h1>
        <button style={styles.menuButton}>⋮</button>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>💰</span>
          <div>
            <p style={styles.summaryLabel}>Total Debt</p>
            <p style={styles.summaryValue}>{formatCurrency(totalDebt)}</p>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>📊</span>
          <div>
            <p style={styles.summaryLabel}>Monthly Minimum</p>
            <p style={styles.summaryValue}>{formatCurrency(totalMinPayment)}</p>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>📈</span>
          <div>
            <p style={styles.summaryLabel}>Average APR</p>
            <p style={styles.summaryValue}>{formatPercent(avgApr)}</p>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>⏱️</span>
          <div>
            <p style={styles.summaryLabel}>Debt Free</p>
            <p style={styles.summaryValue}>{formatDate(payoffProjection.debtFreeDate)}</p>
          </div>
        </div>
      </div>

      {/* Strategy Selector */}
      <div style={styles.strategyCard}>
        <h3 style={styles.strategyTitle}>Payoff Strategy</h3>
        <div style={styles.strategyToggle}>
          <button
            style={{
              ...styles.strategyButton,
              ...(strategy === 'avalanche' ? styles.activeStrategy : {})
            }}
            onClick={() => setStrategy('avalanche')}
          >
            <span style={styles.strategyIcon}>📉</span>
            <span>Avalanche</span>
            <span style={styles.strategyDesc}>Highest APR first</span>
          </button>
          <button
            style={{
              ...styles.strategyButton,
              ...(strategy === 'snowball' ? styles.activeStrategy : {})
            }}
            onClick={() => setStrategy('snowball')}
          >
            <span style={styles.strategyIcon}>❄️</span>
            <span>Snowball</span>
            <span style={styles.strategyDesc}>Smallest balance first</span>
          </button>
        </div>

        {/* Extra Payment Slider */}
        <div style={styles.extraPaymentSection}>
          <label style={styles.extraLabel}>
            Extra Monthly Payment
            <span style={styles.extraValue}>{formatCurrency(extraPayment)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1000"
            step="50"
            value={extraPayment}
            onChange={(e) => setExtraPayment(parseInt(e.target.value))}
            style={styles.slider}
          />
          <div style={styles.sliderMarks}>
            <span>$0</span>
            <span>$500</span>
            <span>$1000</span>
          </div>
        </div>
      </div>

      {/* Payoff Timeline */}
      <div style={styles.timelineCard}>
        <h3 style={styles.timelineTitle}>Payoff Timeline</h3>
        <div style={styles.timelineStats}>
          <div style={styles.timelineStat}>
            <span>Months to Debt Free</span>
            <strong>{payoffProjection.months} months</strong>
          </div>
          <div style={styles.timelineStat}>
            <span>Total Interest</span>
            <strong style={{ color: '#F59E0B' }}>{formatCurrency(payoffProjection.totalInterest)}</strong>
          </div>
        </div>

        {/* Timeline Progress Bar */}
        <div style={styles.timelineProgress}>
          <div style={styles.timelineBar}>
            <div style={{
              ...styles.timelineFill,
              width: `${Math.min(100, (payoffProjection.months / 60) * 100)}%`
            }} />
          </div>
          <div style={styles.timelineMarkers}>
            <span>Now</span>
            <span>{formatDate(payoffProjection.debtFreeDate)}</span>
          </div>
        </div>

        <button 
          style={styles.viewProjectionButton}
          onClick={() => setShowProjection(!showProjection)}
        >
          {showProjection ? 'Hide Detailed Projection' : 'View Detailed Projection'}
        </button>

        {/* Detailed Projection */}
        {showProjection && (
          <div style={styles.projectionList}>
            {payoffProjection.projection.slice(0, 12).map((month, index) => (
              <div key={index} style={styles.projectionItem}>
                <div style={styles.projectionHeader}>
                  <span style={styles.projectionMonth}>Month {month.month}</span>
                  <span style={styles.projectionBalance}>
                    {formatCurrency(month.totalBalance)}
                  </span>
                </div>
                <div style={styles.projectionBar}>
                  <div style={{
                    ...styles.projectionBarFill,
                    width: `${(month.totalBalance / totalDebt) * 100}%`
                  }} />
                </div>
                <div style={styles.projectionPayments}>
                  {month.payments.map((payment, i) => (
                    <span key={i} style={{
                      ...styles.paymentBadge,
                      background: payment.type === 'extra' ? '#10B98120' : '#374151'
                    }}>
                      {payment.name}: {formatCurrency(payment.amount)}
                      {payment.type === 'extra' && ' ✨'}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {payoffProjection.months > 12 && (
              <div style={styles.projectionMore}>
                + {payoffProjection.months - 12} more months...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Debt List by Priority */}
      <div style={styles.debtList}>
        <h3 style={styles.debtListTitle}>
          {strategy === 'avalanche' ? '📉 Pay These First (Highest APR)' : '❄️ Pay These First (Smallest Balance)'}
        </h3>
        
        {prioritizedDebts.map((debt, index) => {
          const payoffMonth = payoffProjection.projection.find(m => 
            m.payments.some(p => p.debtId === debt.id && p.type === 'extra')
          )?.month || 'varies';
          
          return (
            <div key={debt.id} style={styles.debtCard}>
              <div style={styles.debtRank}>
                <span style={styles.rankNumber}>#{index + 1}</span>
                <span style={styles.debtIcon}>{debt.icon}</span>
                <div style={styles.debtInfo}>
                  <h4 style={styles.debtName}>{debt.name}</h4>
                  <p style={styles.debtMeta}>
                    {debt.type === 'credit' ? debt.institution : debt.lender} • {debt.apr}% APR
                  </p>
                </div>
              </div>

              <div style={styles.debtAmounts}>
                <div style={styles.debtBalance}>
                  <span>Balance</span>
                  <strong>{formatCurrency(debt.balance)}</strong>
                </div>
                <div style={styles.debtMinPayment}>
                  <span>Min Payment</span>
                  <strong>{formatCurrency(debt.minPayment)}</strong>
                </div>
                {debt.type === 'credit' && debt.limit && (
                  <div style={styles.debtUtilization}>
                    <span>Utilization</span>
                    <strong style={{
                      color: (debt.balance / debt.limit) > 0.8 ? '#EF4444' :
                             (debt.balance / debt.limit) > 0.5 ? '#F59E0B' : '#4ADE80'
                    }}>
                      {((debt.balance / debt.limit) * 100).toFixed(1)}%
                    </strong>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              {debt.originalBalance && (
                <div style={styles.debtProgress}>
                  <div style={styles.progressLabel}>
                    <span>Paid off</span>
                    <span>{((1 - debt.balance / debt.originalBalance) * 100).toFixed(1)}%</span>
                  </div>
                  <div style={styles.progressBar}>
                    <div style={{
                      ...styles.progressFill,
                      width: `${(1 - debt.balance / debt.originalBalance) * 100}%`
                    }} />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={styles.debtActions}>
                <button 
                  style={styles.payButton}
                  onClick={() => handleMakePayment(debt)}
                >
                  Make Payment
                </button>
                <button 
                  style={styles.transferButton}
                  onClick={() => handleTransferToDebt(debt)}
                >
                  Transfer Money
                </button>
              </div>

              {/* Due Date Warning */}
              {debt.dueDate && (
                <div style={styles.dueDate}>
                  {new Date(debt.dueDate) < new Date() ? (
                    <span style={{ color: '#EF4444' }}>⚠️ Overdue</span>
                  ) : (
                    <span>Due {new Date(debt.dueDate).toLocaleDateString()}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
        <button style={styles.navItem} onClick={() => setShowAddModal(true)}>
          <span style={styles.navIcon}>➕</span>
          <span style={styles.navLabel}>Add</span>
        </button>
        <button style={{...styles.navItem, ...styles.activeNavItem}}>
          <span style={styles.navIcon}>💰</span>
          <span style={styles.navLabel}>Debt</span>
        </button>
        <button style={styles.navItem} onClick={() => router.push('/mobile-settings')}>
          <span style={styles.navIcon}>⚙️</span>
          <span style={styles.navLabel}>Settings</span>
        </button>
      </div>

      {/* Add Transaction Modal */}
      <AddTransactionModal
        isVisible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={() => {}}
        accounts={accounts}
        categories={categories}
      />

      {/* Transfer Modal */}
      <TransferModal
        isVisible={showTransferModal}
        onClose={() => {
          setShowTransferModal(false);
          setSelectedDebt(null);
        }}
        onTransfer={async (outflow, inflow) => {
          // Would process transfer
          alert('Transfer processed');
          setShowTransferModal(false);
        }}
        accounts={accounts}
      />
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
  menuButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
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
  summaryLabel: {
    fontSize: '11px',
    color: '#9CA3AF',
    marginBottom: '2px',
  },
  summaryValue: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: 0,
  },
  strategyCard: {
    margin: '0 20px 20px',
    padding: '16px',
    background: '#1F2937',
    borderRadius: '16px',
  },
  strategyTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 12px 0',
  },
  strategyToggle: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  strategyButton: {
    flex: 1,
    padding: '12px',
    background: '#374151',
    border: 'none',
    borderRadius: '12px',
    color: '#9CA3AF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  },
  activeStrategy: {
    background: '#3B82F6',
    color: 'white',
  },
  strategyIcon: {
    fontSize: '24px',
  },
  strategyDesc: {
    fontSize: '10px',
  },
  extraPaymentSection: {
    padding: '12px 0',
  },
  extraLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    marginBottom: '8px',
  },
  extraValue: {
    color: '#4ADE80',
    fontWeight: '600',
  },
  slider: {
    width: '100%',
    height: '4px',
    background: '#374151',
    borderRadius: '2px',
    outline: 'none',
    WebkitAppearance: 'none',
  },
  sliderMarks: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: '#9CA3AF',
    marginTop: '4px',
  },
  timelineCard: {
    margin: '0 20px 20px',
    padding: '16px',
    background: '#1F2937',
    borderRadius: '16px',
  },
  timelineTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 12px 0',
  },
  timelineStats: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  timelineStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  timelineProgress: {
    marginBottom: '16px',
  },
  timelineBar: {
    height: '8px',
    background: '#374151',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '4px',
  },
  timelineFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
  },
  timelineMarkers: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: '#9CA3AF',
  },
  viewProjectionButton: {
    width: '100%',
    padding: '12px',
    background: 'none',
    border: '1px solid #3B82F6',
    borderRadius: '8px',
    color: '#3B82F6',
    fontSize: '14px',
    cursor: 'pointer',
    marginBottom: '12px',
  },
  projectionList: {
    maxHeight: '300px',
    overflowY: 'auto',
  },
  projectionItem: {
    padding: '12px 0',
    borderBottom: '1px solid #374151',
  },
  projectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  projectionMonth: {
    fontSize: '12px',
    fontWeight: '600',
  },
  projectionBalance: {
    fontSize: '12px',
    color: '#4ADE80',
  },
  projectionBar: {
    height: '2px',
    background: '#374151',
    marginBottom: '4px',
  },
  projectionBarFill: {
    height: '100%',
    background: '#3B82F6',
  },
  projectionPayments: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  paymentBadge: {
    fontSize: '9px',
    padding: '2px 6px',
    borderRadius: '10px',
    background: '#374151',
  },
  projectionMore: {
    padding: '12px',
    textAlign: 'center',
    fontSize: '12px',
    color: '#9CA3AF',
  },
  debtList: {
    padding: '0 20px',
  },
  debtListTitle: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px',
  },
  debtCard: {
    background: '#1F2937',
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '12px',
  },
  debtRank: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  rankNumber: {
    fontSize: '12px',
    padding: '4px 8px',
    background: '#374151',
    borderRadius: '12px',
  },
  debtIcon: {
    fontSize: '20px',
  },
  debtInfo: {
    flex: 1,
  },
  debtName: {
    fontSize: '16px',
    fontWeight: '600',
    margin: 0,
    marginBottom: '2px',
  },
  debtMeta: {
    fontSize: '11px',
    color: '#9CA3AF',
    margin: 0,
  },
  debtAmounts: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  debtBalance: {
    display: 'flex',
    flexDirection: 'column',
  },
  debtMinPayment: {
    display: 'flex',
    flexDirection: 'column',
  },
  debtUtilization: {
    display: 'flex',
    flexDirection: 'column',
  },
  debtProgress: {
    marginBottom: '12px',
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#9CA3AF',
    marginBottom: '4px',
  },
  progressBar: {
    height: '4px',
    background: '#374151',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#10B981',
  },
  debtActions: {
    display: 'flex',
    gap: '8px',
  },
  payButton: {
    flex: 1,
    padding: '10px',
    background: '#3B82F6',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '12px',
    cursor: 'pointer',
  },
  transferButton: {
    flex: 1,
    padding: '10px',
    background: '#374151',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '12px',
    cursor: 'pointer',
  },
  dueDate: {
    marginTop: '8px',
    fontSize: '11px',
    color: '#F59E0B',
    textAlign: 'right',
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
};