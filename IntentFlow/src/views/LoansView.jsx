// src/views/LoansView.jsx
import React from 'react';

const LoansView = ({ accounts }) => {
  const loanAccounts = accounts?.filter(a => 
    a.type === 'loan' || a.type === 'mortgage'
  ) || [];

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Loans</h1>
      <p style={styles.description}>Loan and mortgage accounts</p>
      
      {loanAccounts.length === 0 ? (
        <div style={styles.placeholder}>
          No loan accounts found
        </div>
      ) : (
        <div style={styles.accountList}>
          {loanAccounts.map(account => (
            <div key={account.id} style={styles.accountCard}>
              <div style={styles.accountIcon}>
                {account.type === 'mortgage' ? '🏠' : '📉'}
              </div>
              <div style={styles.accountInfo}>
                <div style={styles.accountName}>{account.name}</div>
                <div style={styles.accountDetails}>
                  <span style={styles.accountType}>{account.type}</span>
                  {account.institution && <span>• {account.institution}</span>}
                  {account.interest_rate > 0 && (
                    <span style={styles.interestRate}>
                      • {account.interest_rate}% APR
                    </span>
                  )}
                </div>
              </div>
              <div style={{
                ...styles.accountBalance,
                color: account.balance < 0 ? '#F87171' : '#4ADE80'
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
      {loanAccounts.length > 0 && (
        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Total Loan Balance</div>
            <div style={styles.summaryValue}>
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(loanAccounts.reduce((sum, a) => sum + a.balance, 0))}
            </div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Number of Loans</div>
            <div style={styles.summaryValue}>{loanAccounts.length}</div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Average Interest Rate</div>
            <div style={styles.summaryValue}>
              {loanAccounts.length > 0 
                ? (loanAccounts.reduce((sum, a) => sum + (a.interest_rate || 0), 0) / loanAccounts.length).toFixed(2) + '%'
                : '0%'}
            </div>
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
  accountDetails: {
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: '#9CA3AF',
    flexWrap: 'wrap'
  },
  accountType: {
    textTransform: 'capitalize'
  },
  interestRate: {
    color: '#F59E0B'
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
    borderLeft: '4px solid #F59E0B'
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

export default LoansView;