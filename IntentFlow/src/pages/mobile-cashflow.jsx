// src/pages/mobile-cashflow.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import DatabaseProxy from '../services/databaseProxy.mjs';

export default function MobileCashflow() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const accountsResult = await DatabaseProxy.getAccounts(user?.id);
      const transactionsResult = await DatabaseProxy.getTransactions(user?.id);
      
      setAccounts(accountsResult?.data || []);
      setTransactions(transactionsResult?.data || []);
    } catch (error) {
      console.error('Error loading cash flow data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate monthly cash flow
  const calculateMonthlyCashflow = () => {
    const currentMonth = selectedMonth.getMonth();
    const currentYear = selectedMonth.getFullYear();
    
    const monthTransactions = transactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
    });

    const income = monthTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const expenses = monthTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    return {
      income,
      expenses,
      netCashflow: income - expenses,
      transactionCount: monthTransactions.length
    };
  };

  const cashflow = calculateMonthlyCashflow();
  const monthName = selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading cash flow data...</p>
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
        <h1 style={styles.title}>💰 Cash Flow</h1>
        <button style={styles.menuButton}>⋮</button>
      </div>

      {/* Month Selector */}
      <div style={styles.monthSelector}>
        <button 
          style={styles.monthNavButton}
          onClick={() => {
            const newDate = new Date(selectedMonth);
            newDate.setMonth(selectedMonth.getMonth() - 1);
            setSelectedMonth(newDate);
          }}
        >
          ←
        </button>
        <span style={styles.currentMonth}>{monthName}</span>
        <button 
          style={styles.monthNavButton}
          onClick={() => {
            const newDate = new Date(selectedMonth);
            newDate.setMonth(selectedMonth.getMonth() + 1);
            setSelectedMonth(newDate);
          }}
        >
          →
        </button>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>💰</span>
          <div>
            <span style={styles.summaryLabel}>Income</span>
            <span style={styles.summaryValue}>${cashflow.income.toFixed(2)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>💸</span>
          <div>
            <span style={styles.summaryLabel}>Expenses</span>
            <span style={styles.summaryValue}>${cashflow.expenses.toFixed(2)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>⚖️</span>
          <div>
            <span style={styles.summaryLabel}>Net Cashflow</span>
            <span style={{
              ...styles.summaryValue,
              color: cashflow.netCashflow >= 0 ? '#4ADE80' : '#F87171'
            }}>
              ${cashflow.netCashflow.toFixed(2)}
            </span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>📊</span>
          <div>
            <span style={styles.summaryLabel}>Transactions</span>
            <span style={styles.summaryValue}>{cashflow.transactionCount}</span>
          </div>
        </div>
      </div>

      {/* Cash Flow Equation */}
      <div style={styles.equationCard}>
        <h3 style={styles.equationTitle}>Cash Flow Equation</h3>
        <div style={styles.equation}>
          <span style={styles.equationItem}>${cashflow.income.toFixed(2)} Income</span>
          <span style={styles.equationOperator}>−</span>
          <span style={styles.equationItem}>${cashflow.expenses.toFixed(2)} Expenses</span>
          <span style={styles.equationOperator}>=</span>
          <span style={{
            ...styles.equationResult,
            color: cashflow.netCashflow >= 0 ? '#4ADE80' : '#F87171'
          }}>
            ${cashflow.netCashflow.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Insight */}
      <div style={styles.insightCard}>
        <span style={styles.insightIcon}>💡</span>
        <div>
          <h4 style={styles.insightTitle}>Cash Flow Insight</h4>
          <p style={styles.insightText}>
            {cashflow.netCashflow > 0 
              ? `You have positive cash flow of $${cashflow.netCashflow.toFixed(2)}. Consider investing or adding to savings.`
              : cashflow.netCashflow < 0
                ? `Your expenses exceed income by $${Math.abs(cashflow.netCashflow).toFixed(2)}. Review your spending.`
                : `You broke even this month. No savings, but no debt either.`
            }
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
        <button style={{...styles.navItem, ...styles.activeNavItem}} onClick={() => router.push('/mobile-cashflow')}>
          <span style={styles.navIcon}>💰</span>
          <span style={styles.navLabel}>Cash Flow</span>
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
  monthSelector: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: '20px',
    padding: '12px',
    background: '#1F2937',
    borderRadius: '12px',
  },
  monthNavButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: '#374151',
    border: 'none',
    color: 'white',
    fontSize: '18px',
    cursor: 'pointer',
  },
  currentMonth: {
    fontSize: '14px',
    fontWeight: '500',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    padding: '0 20px',
    marginBottom: '20px',
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
    display: 'block',
    marginBottom: '2px',
  },
  summaryValue: {
    fontSize: '16px',
    fontWeight: 'bold',
    display: 'block',
  },
  equationCard: {
    margin: '0 20px 20px',
    padding: '16px',
    background: 'linear-gradient(135deg, #0047AB, #0A2472)',
    borderRadius: '12px',
  },
  equationTitle: {
    fontSize: '14px',
    fontWeight: '600',
    margin: '0 0 12px 0',
    color: 'rgba(255,255,255,0.9)',
  },
  equation: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '8px',
  },
  equationItem: {
    fontSize: '14px',
    background: 'rgba(255,255,255,0.1)',
    padding: '8px 12px',
    borderRadius: '8px',
  },
  equationOperator: {
    fontSize: '18px',
    color: '#9CA3AF',
  },
  equationResult: {
    fontSize: '16px',
    fontWeight: 'bold',
    background: 'rgba(255,255,255,0.1)',
    padding: '8px 16px',
    borderRadius: '8px',
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
    margin: 0,
    lineHeight: 1.4,
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
