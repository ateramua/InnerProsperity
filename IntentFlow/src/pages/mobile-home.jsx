// src/pages/mobile-home.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import AddTransactionModal from '../components/mobile/AddTransactionModal';
import AddAccountModal from '../components/mobile/AddAccountModal';
import DatabaseProxy from '../services/databaseProxy.mjs';

export default function MobileHome() {
  const [activeTab, setActiveTab] = useState('overview');
  const [accounts, setAccounts] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const router = useRouter();
  const { user, logout } = useAuth();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // Load accounts summary
      const accountsResult = await DatabaseProxy.getAccounts(user?.id);
      if (accountsResult?.success) {
        setAccounts(accountsResult.data || []);
      }

      // Load recent transactions
      const transactionsResult = await DatabaseProxy.getTransactions(user?.id);
      if (transactionsResult?.success) {
        // Get last 10 transactions
        setRecentTransactions(transactionsResult.data.slice(0, 10) || []);
      }

      // Load categories for the transaction modal
      const categoriesResult = await DatabaseProxy.getCategories(user?.id);
      if (categoriesResult?.success) {
        setCategories(categoriesResult.data || []);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/mobile-login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleAddTransaction = async (transactionData) => {
    try {
      const result = await DatabaseProxy.addTransaction(transactionData);
      if (result?.success) {
        await loadDashboardData();
        setShowAddOptions(false);
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
    }
  };

  const handleAddAccount = async (accountData) => {
    try {
      const dataWithUser = {
        ...accountData,
        user_id: user?.id
      };

      const result = await DatabaseProxy.createAccount(dataWithUser);

      if (result?.success) {
        await loadDashboardData();
        setShowAddOptions(false);
        alert('Account added successfully!');
      } else {
        alert('Failed to add account');
      }
    } catch (error) {
      console.error('Error adding account:', error);
      alert('Error adding account');
      throw error;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const monthlyIncome = recentTransactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const monthlyExpenses = recentTransactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading your finances...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.greeting}>Hello, {user?.username || 'User'} 👋</h1>
          <p style={styles.date}>{new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })}</p>
        </div>
        <button onClick={handleLogout} style={styles.logoutButton}>
          <span style={styles.logoutIcon}>🚪</span>
        </button>
      </div>

      {/* Total Balance Card */}
      <div style={styles.balanceCard}>
        <p style={styles.balanceLabel}>Total Balance</p>
        <h2 style={styles.balanceAmount}>{formatCurrency(totalBalance)}</h2>
        <div style={styles.balanceChange}>
          <span style={styles.balanceChangeIcon}>📈</span>
          <span style={styles.balanceChangeText}>+2.3% from last month</span>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statIcon}>💰</span>
          <div>
            <p style={styles.statLabel}>Income</p>
            <p style={styles.statValue}>{formatCurrency(monthlyIncome)}</p>
          </div>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statIcon}>💸</span>
          <div>
            <p style={styles.statLabel}>Expenses</p>
            <p style={styles.statValue}>{formatCurrency(monthlyExpenses)}</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={styles.tabBar}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'overview' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'accounts' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('accounts')}
        >
          Accounts
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'transactions' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
      </div>

      {/* Tab Content */}
      <div style={styles.tabContent}>
        {activeTab === 'overview' && (
          <div>
            {/* Budget Progress */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Budget Progress</h3>
              <div style={styles.budgetItem}>
                <div style={styles.budgetHeader}>
                  <span>Housing</span>
                  <span>$1,200 / $1,500</span>
                </div>
                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: '80%' }} />
                </div>
              </div>
              <div style={styles.budgetItem}>
                <div style={styles.budgetHeader}>
                  <span>Food</span>
                  <span>$450 / $600</span>
                </div>
                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: '75%' }} />
                </div>
              </div>
              <div style={styles.budgetItem}>
                <div style={styles.budgetHeader}>
                  <span>Transportation</span>
                  <span>$180 / $200</span>
                </div>
                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: '90%' }} />
                </div>
              </div>
              <button style={styles.viewAllButton}>View All Budgets →</button>
            </div>

            {/* Recent Transactions */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Recent Transactions</h3>
              {recentTransactions.length === 0 ? (
                <p style={styles.emptyText}>No recent transactions</p>
              ) : (
                recentTransactions.map((tx, index) => (
                  <div key={index} style={styles.transactionItem}>
                    <div style={styles.transactionLeft}>
                      <div style={styles.transactionIcon}>
                        {tx.amount > 0 ? '📥' : '📤'}
                      </div>
                      <div>
                        <p style={styles.transactionDescription}>
                          {tx.description || 'Transaction'}
                        </p>
                        <p style={styles.transactionDate}>
                          {formatDate(tx.date)}
                        </p>
                      </div>
                    </div>
                    <p style={{
                      ...styles.transactionAmount,
                      color: tx.amount > 0 ? '#4ADE80' : '#F87171'
                    }}>
                      {tx.amount > 0 ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'accounts' && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Your Accounts</h3>

            {/* Add Credit Cards section */}
            <div style={styles.creditCardSection}>
              <h4 style={styles.subsectionTitle}>Credit Cards</h4>
              <button
                style={styles.creditCardLink}
                onClick={() => router.push('/mobile-credit-cards')}
              >
                <span style={styles.linkIcon}>💳</span>
                <span>Manage Credit Cards</span>
                <span style={styles.linkArrow}>→</span>
              </button>
            </div>

            {/* Regular accounts */}
            {accounts.length === 0 ? (
              <p style={styles.emptyText}>No accounts found</p>
            ) : (
              accounts.map((account, index) => (
                <div key={index} style={styles.accountItem}>
                  <div style={styles.accountLeft}>
                    <span style={styles.accountIcon}>
                      {account.type === 'checking' ? '🏦' :
                        account.type === 'savings' ? '💰' :
                          account.type === 'credit' ? '💳' : '📊'}
                    </span>
                    <div>
                      <p style={styles.accountName}>{account.name}</p>
                      <p style={styles.accountType}>{account.type}</p>
                    </div>
                  </div>
                  <p style={{
                    ...styles.accountBalance,
                    color: account.balance >= 0 ? '#4ADE80' : '#F87171'
                  }}>
                    {formatCurrency(account.balance)}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'transactions' && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>All Transactions</h3>
            {recentTransactions.length === 0 ? (
              <p style={styles.emptyText}>No transactions yet</p>
            ) : (
              recentTransactions.map((tx, index) => (
                <div key={index} style={styles.transactionItem}>
                  <div style={styles.transactionLeft}>
                    <div style={styles.transactionIcon}>
                      {tx.amount > 0 ? '📥' : '📤'}
                    </div>
                    <div>
                      <p style={styles.transactionDescription}>
                        {tx.description || 'Transaction'}
                      </p>
                      <p style={styles.transactionCategory}>
                        {tx.category || 'Uncategorized'}
                      </p>
                    </div>
                  </div>
                  <div style={styles.transactionRight}>
                    <p style={{
                      ...styles.transactionAmount,
                      color: tx.amount > 0 ? '#4ADE80' : '#F87171'
                    }}>
                      {tx.amount > 0 ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                    </p>
                    <p style={styles.transactionDate}>
                      {formatDate(tx.date)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div style={styles.bottomNav}>
        <button style={{ ...styles.navItem, ...(router.pathname === '/mobile-home' ? styles.activeNavItem : {}) }}
          onClick={() => router.push('/mobile-home')}>
          <span style={styles.navIcon}>🏠</span>
          <span style={styles.navLabel}>Home</span>
        </button>
        <button style={{ ...styles.navItem, ...(router.pathname === '/mobile-budget' ? styles.activeNavItem : {}) }}
          onClick={() => router.push('/mobile-budget')}>
          <span style={styles.navIcon}>📊</span>
          <span style={styles.navLabel}>ProsperityMap</span>  {/* Changed from "Budget" */}
        </button>
        <button style={styles.navItem} onClick={() => setShowAddOptions(true)}>
          <span style={styles.navIcon}>➕</span>
          <span style={styles.navLabel}>Add</span>
        </button>
        <button style={{ ...styles.navItem, ...(router.pathname === '/mobile-credit-cards' ? styles.activeNavItem : {}) }}
          onClick={() => router.push('/mobile-credit-cards')}>
          <span style={styles.navIcon}>💳</span>
          <span style={styles.navLabel}>Cards</span>
        </button>
        <button style={{ ...styles.navItem, ...(router.pathname === '/mobile-cashflow' ? styles.activeNavItem : {}) }}
          onClick={() => router.push('/mobile-cashflow')}>
          <span style={styles.navIcon}>💰</span>
          <span style={styles.navLabel}>Cash Flow</span>
        </button>
        <button style={{ ...styles.navItem, ...(router.pathname === '/mobile-cashflow-forecast' ? styles.activeNavItem : {}) }}
          onClick={() => router.push('/mobile-cashflow-forecast')}>
          <span style={styles.navIcon}>📈</span>
          <span style={styles.navLabel}>Forecast</span>
        </button>
        <button style={{ ...styles.navItem, ...(router.pathname === '/mobile-settings' ? styles.activeNavItem : {}) }}
          onClick={() => router.push('/mobile-settings')}>
          <span style={styles.navIcon}>⚙️</span>
          <span style={styles.navLabel}>Settings</span>
        </button>
      </div>

      {/* Floating Action Button with Options */}
      {showAddOptions ? (
        <div style={styles.fabMenu}>
          <button style={styles.fabOption} onClick={() => {
            setShowAddOptions(false);
            setShowAddAccountModal(true);
          }}>
            <span style={styles.fabOptionIcon}>🏦</span>
            <span style={styles.fabOptionLabel}>Add Account</span>
          </button>
          <button style={styles.fabOption} onClick={() => {
            setShowAddOptions(false);
            setShowAddModal(true);
          }}>
            <span style={styles.fabOptionIcon}>📝</span>
            <span style={styles.fabOptionLabel}>Add Transaction</span>
          </button>
          <button style={styles.fabClose} onClick={() => setShowAddOptions(false)}>
            ✕
          </button>
        </div>
      ) : (
        <button style={styles.fab} onClick={() => setShowAddOptions(true)}>
          <span style={styles.fabIcon}>+</span>
        </button>
      )}

      {/* Add Transaction Modal */}
      <AddTransactionModal
        isVisible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setShowAddOptions(false);
        }}
        onSave={handleAddTransaction}
        accounts={accounts}
        categories={categories}
      />

      {/* Add Account Modal */}
      <AddAccountModal
        isVisible={showAddAccountModal}
        onClose={() => {
          setShowAddAccountModal(false);
          setShowAddOptions(false);
        }}
        onSave={handleAddAccount}
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
  },
  greeting: {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: 0,
    marginBottom: '4px',
  },
  date: {
    fontSize: '14px',
    color: '#9CA3AF',
    margin: 0,
  },
  logoutButton: {
    width: '48px',
    height: '48px',
    borderRadius: '24px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  logoutIcon: {
    fontSize: '20px',
  },
  balanceCard: {
    background: 'linear-gradient(135deg, #0047AB, #0A2472)',
    margin: '20px',
    padding: '24px',
    borderRadius: '24px',
    boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
  },
  balanceLabel: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.7)',
    margin: '0 0 8px 0',
  },
  balanceAmount: {
    fontSize: '36px',
    fontWeight: 'bold',
    margin: '0 0 12px 0',
  },
  balanceChange: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  balanceChangeIcon: {
    fontSize: '16px',
  },
  balanceChangeText: {
    fontSize: '14px',
    color: '#4ADE80',
  },
  statsRow: {
    display: 'flex',
    gap: '16px',
    padding: '0 20px',
    marginBottom: '24px',
  },
  statCard: {
    flex: 1,
    background: '#1F2937',
    padding: '16px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  statIcon: {
    fontSize: '24px',
  },
  statLabel: {
    fontSize: '12px',
    color: '#9CA3AF',
    margin: 0,
  },
  statValue: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: 0,
  },
  tabBar: {
    display: 'flex',
    margin: '0 20px',
    background: '#1F2937',
    borderRadius: '30px',
    padding: '4px',
  },
  tab: {
    flex: 1,
    padding: '12px',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '26px',
    cursor: 'pointer',
  },
  activeTab: {
    background: '#3B82F6',
    color: 'white',
  },
  tabContent: {
    padding: '20px',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: '0 0 16px 0',
  },
  creditCardSection: {
    marginBottom: '20px',
    padding: '12px',
    background: '#1F2937',
    borderRadius: '12px',
  },
  subsectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    margin: '0 0 12px 0',
    color: '#9CA3AF',
  },
  creditCardLink: {
    width: '100%',
    padding: '14px',
    background: '#3B82F6',
    border: 'none',
    borderRadius: '12px',
    color: 'white',
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
  },
  linkIcon: {
    fontSize: '20px',
  },
  linkArrow: {
    fontSize: '18px',
  },
  budgetItem: {
    marginBottom: '16px',
  },
  budgetHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    marginBottom: '8px',
  },
  progressBar: {
    height: '8px',
    background: '#374151',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
    borderRadius: '4px',
  },
  viewAllButton: {
    background: 'none',
    border: 'none',
    color: '#3B82F6',
    fontSize: '14px',
    marginTop: '8px',
    cursor: 'pointer',
  },
  transactionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #374151',
  },
  transactionLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  transactionIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: '#374151',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
  },
  transactionDescription: {
    fontSize: '16px',
    fontWeight: '500',
    margin: '0 0 4px 0',
  },
  transactionDate: {
    fontSize: '12px',
    color: '#9CA3AF',
    margin: 0,
  },
  transactionCategory: {
    fontSize: '12px',
    color: '#9CA3AF',
    margin: 0,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 4px 0',
  },
  emptyText: {
    fontSize: '14px',
    color: '#9CA3AF',
    textAlign: 'center',
    padding: '40px 0',
  },
  accountItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    background: '#1F2937',
    borderRadius: '12px',
    marginBottom: '12px',
  },
  accountLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  accountIcon: {
    fontSize: '24px',
  },
  accountName: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 4px 0',
  },
  accountType: {
    fontSize: '12px',
    color: '#9CA3AF',
    margin: 0,
    textTransform: 'capitalize',
  },
  accountBalance: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: 0,
  },
  bottomNav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    background: '#1F2937',
    padding: '8px 12px',
    paddingBottom: '24px',
    borderTop: '1px solid #374151',
    overflowX: 'auto',
    gap: '16px',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  navItem: {
    flex: '0 0 auto',
    minWidth: '60px',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 8px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  activeNavItem: {
    color: '#3B82F6',
  },
  navIcon: {
    fontSize: '20px',
  },
  navLabel: {
    fontSize: '10px',
    whiteSpace: 'nowrap',
  },
  fab: {
    position: 'fixed',
    bottom: '90px',
    right: '20px',
    width: '56px',
    height: '56px',
    borderRadius: '28px',
    background: '#3B82F6',
    border: 'none',
    color: 'white',
    fontSize: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
    cursor: 'pointer',
    zIndex: 10,
  },
  fabIcon: {
    fontSize: '24px',
    lineHeight: 1,
  },
  fabMenu: {
    position: 'fixed',
    bottom: '90px',
    right: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    zIndex: 10,
    alignItems: 'flex-end',
  },
  fabOption: {
    padding: '14px 20px',
    background: '#1F2937',
    border: '1px solid #3B82F6',
    borderRadius: '30px',
    color: 'white',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    minWidth: '160px',
    justifyContent: 'flex-start',
    transition: 'transform 0.2s',
  },
  fabOptionIcon: {
    fontSize: '20px',
  },
  fabOptionLabel: {
    fontSize: '14px',
    fontWeight: '500',
  },
  fabClose: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: '#EF4444',
    border: 'none',
    color: 'white',
    fontSize: '16px',
    cursor: 'pointer',
    alignSelf: 'center',
    marginTop: '4px',
  },
};

// 👇 THIS CODE GOES RIGHT HERE 👇
// Add keyframe animation for spinner
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}