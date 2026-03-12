// src/views/CashView.jsx
import React from 'react';

const CashView = ({ accounts }) => {
  const cashAccounts = accounts?.filter(a => 
    a.type === 'checking' || a.type === 'savings' || a.type === 'cash'
  ) || [];

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Cash Accounts</h1>
      <p style={styles.description}>Checking and Savings accounts</p>
      
      {cashAccounts.length === 0 ? (
        <div style={styles.placeholder}>
          No cash accounts found
        </div>
      ) : (
        <div style={styles.accountList}>
          {cashAccounts.map(account => (
            <div key={account.id} style={styles.accountCard}>
              <div style={styles.accountIcon}>
                {account.type === 'checking' ? '🏦' : 
                 account.type === 'savings' ? '💰' : '💵'}
              </div>
              <div style={styles.accountInfo}>
                <div style={styles.accountName}>{account.name}</div>
                <div style={styles.accountType}>
                  {account.type} {account.institution && `• ${account.institution}`}
                </div>
              </div>
              <div style={{
                ...styles.accountBalance,
                color: account.balance >= 0 ? '#4ADE80' : '#F87171'
              }}>
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD'
                }).format(account.balance)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      {cashAccounts.length > 0 && (
        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Total Cash</div>
            <div style={styles.summaryValue}>
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(cashAccounts.reduce((sum, a) => sum + a.balance, 0))}
            </div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Number of Accounts</div>
            <div style={styles.summaryValue}>{cashAccounts.length}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    width: '100%'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
    color: 'white'
  },
  description: {
    fontSize: '1rem',
    color: '#9CA3AF',
    marginBottom: '2rem'
  },
  placeholder: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    padding: '3rem',
    textAlign: 'center',
    color: '#6B7280',
    border: '2px dashed #374151'
  },
  accountList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginBottom: '2rem'
  },
  accountCard: {
    display: 'flex',
    alignItems: 'center',
    padding: '1.5rem',
    background: '#1F2937',
    borderRadius: '0.75rem',
    gap: '1rem',
    border: '1px solid #374151'
  },
  accountIcon: {
    fontSize: '2.5rem'
  },
  accountInfo: {
    flex: 1
  },
  accountName: {
    fontWeight: '600',
    color: 'white',
    fontSize: '1.1rem',
    marginBottom: '0.25rem'
  },
  accountType: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    textTransform: 'capitalize'
  },
  accountBalance: {
    fontSize: '1.5rem',
    fontWeight: '600'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginTop: '2rem'
  },
  summaryCard: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    borderLeft: '4px solid #3B82F6'
  },
  summaryLabel: {
    color: '#9CA3AF',
    fontSize: '0.875rem',
    marginBottom: '0.5rem'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white'
  }
};

export default CashView;