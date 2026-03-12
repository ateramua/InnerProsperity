// src/views/CreditCardsView.jsx
import React from 'react';

const CreditCardsView = ({ accounts }) => {
  const creditAccounts = accounts?.filter(a => a.type === 'credit') || [];

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Credit Cards</h1>
      <p style={styles.description}>Credit card accounts</p>
      
      {creditAccounts.length === 0 ? (
        <div style={styles.placeholder}>
          No credit card accounts found
        </div>
      ) : (
        <div style={styles.accountList}>
          {creditAccounts.map(account => (
            <div key={account.id} style={styles.accountCard}>
              <div style={styles.accountIcon}>💳</div>
              <div style={styles.accountInfo}>
                <div style={styles.accountName}>{account.name}</div>
                <div style={styles.accountDetails}>
                  {account.institution && <span>{account.institution}</span>}
                  {account.credit_limit > 0 && (
                    <span style={styles.creditLimit}>
                      Limit: {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD'
                      }).format(account.credit_limit)}
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
      {creditAccounts.length > 0 && (
        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Total Credit Card Debt</div>
            <div style={styles.summaryValue}>
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(creditAccounts.reduce((sum, a) => sum + a.balance, 0))}
            </div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Number of Cards</div>
            <div style={styles.summaryValue}>{creditAccounts.length}</div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Total Credit Limit</div>
            <div style={styles.summaryValue}>
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(creditAccounts.reduce((sum, a) => sum + (a.credit_limit || 0), 0))}
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
    gap: '1rem',
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  creditLimit: {
    color: '#6B7280'
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
    borderLeft: '4px solid #8B5CF6'
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

export default CreditCardsView;