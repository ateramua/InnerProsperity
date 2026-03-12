// src/views/AllAccountsView.jsx
import React from 'react';

const AllAccountsView = ({ accounts }) => {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>All Accounts</h1>
      <p style={styles.description}>Transaction table across all accounts</p>
      
      {!accounts || accounts.length === 0 ? (
        <div style={styles.placeholder}>
          No accounts found
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead style={styles.tableHead}>
              <tr>
                <th style={styles.tableHeader}>Account</th>
                <th style={styles.tableHeader}>Type</th>
                <th style={styles.tableHeader}>Balance</th>
                <th style={styles.tableHeader}>Institution</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} style={styles.tableRow}>
                  <td style={styles.tableCell}>{account.name}</td>
                  <td style={styles.tableCell}>
                    <span style={{
                      ...styles.accountType,
                      backgroundColor: account.type === 'credit' ? '#7C3AED' : 
                                     account.type === 'checking' ? '#3B82F6' :
                                     account.type === 'savings' ? '#10B981' : '#6B7280'
                    }}>
                      {account.type}
                    </span>
                  </td>
                  <td style={{
                    ...styles.tableCell,
                    ...styles.tableCellBalance,
                    color: account.balance >= 0 ? '#4ADE80' : '#F87171'
                  }}>
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD'
                    }).format(account.balance)}
                  </td>
                  <td style={styles.tableCell}>{account.institution || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
  tableContainer: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    overflow: 'hidden',
    border: '1px solid #374151'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  tableHead: {
    background: '#111827'
  },
  tableHeader: {
    padding: '1rem',
    textAlign: 'left',
    color: '#9CA3AF',
    fontWeight: '500',
    fontSize: '0.875rem',
    borderBottom: '2px solid #374151'
  },
  tableRow: {
    borderBottom: '1px solid #374151',
    ':last-child': {
      borderBottom: 'none'
    }
  },
  tableCell: {
    padding: '1rem',
    color: '#F3F4F6',
    fontSize: '0.95rem'
  },
  tableCellBalance: {
    fontWeight: '600'
  },
  accountType: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '500',
    color: 'white',
    textTransform: 'capitalize'
  }
};

export default AllAccountsView;