// src/pages/mobile-cashflow-forecast.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import DatabaseProxy from '../services/databaseProxy.mjs';

export default function MobileCashflowForecast() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [creditCards, setCreditCards] = useState([]);
  const [loans, setLoans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [forecastPeriods, setForecastPeriods] = useState([
    { label: '1 Month', months: 1, enabled: true },
    { label: '3 Months', months: 3, enabled: true },
    { label: '6 Months', months: 6, enabled: true },
    { label: '1 Year', months: 12, enabled: true }
  ]);
  const [forecastData, setForecastData] = useState(null);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [accountsRes, transactionsRes, creditCardsRes, loansRes] = await Promise.all([
        DatabaseProxy.getAccounts(user?.id),
        DatabaseProxy.getTransactions(user?.id),
        DatabaseProxy.getCreditCards?.(user?.id) || Promise.resolve({ success: true, data: [] }),
        DatabaseProxy.getLoans?.(user?.id) || Promise.resolve({ success: true, data: [] })
      ]);

      setAccounts(accountsRes?.data || []);
      setTransactions(transactionsRes?.data || []);
      setCreditCards(creditCardsRes?.data || []);
      setLoans(loansRes?.data || []);
    } catch (error) {
      console.error('Error loading forecast data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate historical patterns
  const calculatePatterns = () => {
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(now.getMonth() - 6);
    
    const recentTransactions = transactions.filter(t => new Date(t.date) >= sixMonthsAgo);
    
    // Calculate average monthly income
    let totalIncome = 0;
    let incomeMonths = 0;
    
    // Calculate average monthly expenses
    let totalExpenses = 0;
    let expenseMonths = 0;
    
    // Group by month
    const monthlyData = {};
    
    recentTransactions.forEach(t => {
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expenses: 0 };
      }
      
      if (t.amount > 0) {
        monthlyData[monthKey].income += t.amount;
      } else {
        monthlyData[monthKey].expenses += Math.abs(t.amount);
      }
    });
    
    const months = Object.values(monthlyData);
    const avgMonthlyIncome = months.reduce((sum, m) => sum + m.income, 0) / (months.length || 1);
    const avgMonthlyExpenses = months.reduce((sum, m) => sum + m.expenses, 0) / (months.length || 1);
    const avgMonthlySavings = avgMonthlyIncome - avgMonthlyExpenses;
    
    // Calculate current cash position
    const currentCash = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    
    // Calculate total debt
    const creditDebt = creditCards.reduce((sum, c) => sum + Math.abs(c.balance || 0), 0);
    const loanDebt = loans.reduce((sum, l) => sum + Math.abs(l.balance || 0), 0);
    const totalDebt = creditDebt + loanDebt;
    
    return {
      avgMonthlyIncome,
      avgMonthlyExpenses,
      avgMonthlySavings,
      currentCash,
      totalDebt,
      creditDebt,
      loanDebt,
      monthlyData: months
    };
  };

  // Generate forecasts
  const generateForecasts = (patterns) => {
    const now = new Date();
    const forecasts = forecastPeriods.map(period => {
      const targetDate = new Date(now);
      targetDate.setMonth(now.getMonth() + period.months);
      
      const projectedCash = patterns.currentCash + (patterns.avgMonthlySavings * period.months);
      const projectedDebt = Math.max(0, patterns.totalDebt - (patterns.avgMonthlySavings * period.months * 0.3)); // Assume 30% of savings go to debt
      const confidence = period.months <= 3 ? 85 : period.months <= 6 ? 70 : 50;
      
      return {
        ...period,
        targetDate,
        projectedCash,
        projectedDebt,
        confidence,
        isDebtFree: projectedDebt <= 0
      };
    });
    
    return forecasts;
  };

  const patterns = calculatePatterns();
  const forecasts = generateForecasts(patterns);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Calculating your financial forecast...</p>
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
        <h1 style={styles.title}>📈 Cash Flow Forecast</h1>
        <button style={styles.menuButton}>⋮</button>
      </div>

      {/* Current Position */}
      <div style={styles.currentPositionCard}>
        <h3 style={styles.cardTitle}>Current Position</h3>
        <div style={styles.positionRow}>
          <span>Cash on Hand</span>
          <span style={styles.positionValue}>{formatCurrency(patterns.currentCash)}</span>
        </div>
        <div style={styles.positionRow}>
          <span>Total Debt</span>
          <span style={{...styles.positionValue, color: '#F87171'}}>{formatCurrency(patterns.totalDebt)}</span>
        </div>
        <div style={styles.positionRow}>
          <span>Monthly Savings</span>
          <span style={{...styles.positionValue, color: patterns.avgMonthlySavings >= 0 ? '#4ADE80' : '#F87171'}}>
            {formatCurrency(patterns.avgMonthlySavings)}/mo
          </span>
        </div>
      </div>

      {/* Monthly Average Card */}
      <div style={styles.averageCard}>
        <h3 style={styles.cardTitle}>Monthly Average (Last 6 Months)</h3>
        <div style={styles.averageRow}>
          <span>Income</span>
          <span style={styles.averageValue}>{formatCurrency(patterns.avgMonthlyIncome)}</span>
        </div>
        <div style={styles.averageRow}>
          <span>Expenses</span>
          <span style={styles.averageValue}>{formatCurrency(patterns.avgMonthlyExpenses)}</span>
        </div>
        <div style={styles.averageRow}>
          <span>Savings</span>
          <span style={{
            ...styles.averageValue,
            color: patterns.avgMonthlySavings >= 0 ? '#4ADE80' : '#F87171'
          }}>
            {formatCurrency(patterns.avgMonthlySavings)}
          </span>
        </div>
      </div>

      {/* Forecast Grid */}
      <h3 style={styles.sectionTitle}>Projected Timeline</h3>
      <div style={styles.forecastGrid}>
        {forecasts.map((forecast, index) => (
          <div key={index} style={styles.forecastCard}>
            <div style={styles.forecastHeader}>
              <span style={styles.forecastPeriod}>{forecast.label}</span>
              <span style={styles.forecastDate}>{formatDate(forecast.targetDate)}</span>
            </div>
            
            <div style={styles.forecastAmount}>
              {formatCurrency(forecast.projectedCash)}
            </div>
            
            <div style={styles.forecastChange}>
              <span style={{
                color: forecast.projectedCash >= patterns.currentCash ? '#4ADE80' : '#F87171'
              }}>
                {forecast.projectedCash >= patterns.currentCash ? '+' : '-'}
                {formatCurrency(Math.abs(forecast.projectedCash - patterns.currentCash))}
              </span>
            </div>

            {/* Progress Bar */}
            <div style={styles.progressBar}>
              <div style={{
                ...styles.progressFill,
                width: `${Math.min(100, (forecast.projectedCash / (patterns.currentCash * 2)) * 100)}%`,
                background: forecast.projectedCash >= patterns.currentCash 
                  ? 'linear-gradient(90deg, #4ADE80, #10B981)'
                  : 'linear-gradient(90deg, #F87171, #EF4444)'
              }} />
            </div>

            {/* Confidence Badge */}
            <div style={styles.confidenceBadge}>
              <span style={{
                ...styles.confidenceDot,
                backgroundColor: forecast.confidence >= 80 ? '#4ADE80' :
                              forecast.confidence >= 60 ? '#F59E0B' : '#F87171'
              }} />
              <span>{forecast.confidence}% confidence</span>
            </div>

            {/* Debt Info */}
            <div style={forecast.isDebtFree ? styles.debtFreeBadge : styles.debtRemaining}>
              {forecast.isDebtFree ? (
                '🎉 Debt Free!'
              ) : (
                `Debt: ${formatCurrency(forecast.projectedDebt)}`
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Insight Card */}
      <div style={styles.insightCard}>
        <span style={styles.insightIcon}>💡</span>
        <div>
          <h4 style={styles.insightTitle}>Forecast Insight</h4>
          <p style={styles.insightText}>
            {patterns.avgMonthlySavings > 0 ? (
              `At your current savings rate of ${formatCurrency(patterns.avgMonthlySavings)}/month, 
               you'll have ${formatCurrency(patterns.currentCash + patterns.avgMonthlySavings * 12)} in one year.`
            ) : (
              `Your expenses exceed income by ${formatCurrency(Math.abs(patterns.avgMonthlySavings))}/month. 
               You'll need to increase income or reduce expenses to build savings.`
            )}
          </p>
          <p style={styles.insightSub}>
            {patterns.totalDebt > 0 && patterns.avgMonthlySavings > 0 && (
              `Debt free in ~${Math.ceil(patterns.totalDebt / patterns.avgMonthlySavings)} months if you put all savings toward debt.`
            )}
          </p>
        </div>
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
        <button style={styles.navItem} onClick={() => router.push('/mobile-credit-cards')}>
          <span style={styles.navIcon}>💳</span>
          <span style={styles.navLabel}>Cards</span>
        </button>
        <button style={{...styles.navItem, ...styles.activeNavItem}} onClick={() => router.push('/mobile-cashflow-forecast')}>
          <span style={styles.navIcon}>📈</span>
          <span style={styles.navLabel}>Forecast</span>
        </button>
        <button style={styles.navItem} onClick={() => router.push('/mobile-settings')}>
          <span style={styles.navIcon}>⚙️</span>
          <span style={styles.navLabel}>Settings</span>
        </button>
      </div>
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
  currentPositionCard: {
    margin: '20px',
    padding: '16px',
    background: 'linear-gradient(135deg, #0047AB, #0A2472)',
    borderRadius: '12px',
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: '600',
    margin: '0 0 12px 0',
    color: 'rgba(255,255,255,0.9)',
  },
  positionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    fontSize: '14px',
  },
  positionValue: {
    fontWeight: '600',
  },
  averageCard: {
    margin: '0 20px 20px',
    padding: '16px',
    background: '#1F2937',
    borderRadius: '12px',
  },
  averageRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #374151',
    fontSize: '14px',
  },
  averageValue: {
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 20px 12px',
  },
  forecastGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    padding: '0 20px',
    marginBottom: '20px',
  },
  forecastCard: {
    background: '#1F2937',
    padding: '12px',
    borderRadius: '12px',
  },
  forecastHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  forecastPeriod: {
    fontSize: '13px',
    fontWeight: '600',
  },
  forecastDate: {
    fontSize: '11px',
    color: '#9CA3AF',
  },
  forecastAmount: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  forecastChange: {
    fontSize: '11px',
    marginBottom: '8px',
  },
  progressBar: {
    height: '4px',
    background: '#374151',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressFill: {
    height: '100%',
    borderRadius: '2px',
  },
  confidenceBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '8px',
    fontSize: '10px',
    color: '#9CA3AF',
  },
  confidenceDot: {
    width: '8px',
    height: '8px',
    borderRadius: '4px',
  },
  debtFreeBadge: {
    fontSize: '11px',
    padding: '4px',
    background: '#10B98120',
    color: '#10B981',
    borderRadius: '4px',
    textAlign: 'center',
  },
  debtRemaining: {
    fontSize: '11px',
    color: '#F87171',
  },
  insightCard: {
    margin: '0 20px 20px',
    padding: '16px',
    background: '#1F2937',
    borderRadius: '12px',
    display: 'flex',
    gap: '12px',
  },
  insightIcon: {
    fontSize: '24px',
  },
  insightTitle: {
    fontSize: '14px',
    fontWeight: '600',
    margin: '0 0 4px 0',
  },
  insightText: {
    fontSize: '12px',
    color: '#9CA3AF',
    margin: '0 0 8px 0',
    lineHeight: 1.4,
  },
  insightSub: {
    fontSize: '11px',
    color: '#F59E0B',
    margin: 0,
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
    padding: '4px 0',
    paddingBottom: '20px',
    borderTop: '1px solid #374151',
    overflowX: 'auto',
  },
  navItem: {
    flex: '0 0 auto',
    minWidth: '50px',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    padding: '4px 8px',
    cursor: 'pointer',
  },
  activeNavItem: {
    color: '#3B82F6',
  },
  navIcon: {
    fontSize: '18px',
  },
  navLabel: {
    fontSize: '9px',
  },
};

// Add keyframe animation
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
