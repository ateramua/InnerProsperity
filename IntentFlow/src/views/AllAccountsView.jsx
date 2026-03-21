// src/views/AllAccountsView.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const AllAccountsView = ({ accounts: propAccounts, onAccountUpdate, onAccountDelete }) => {
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    balance: '',
    institution: ''
  });

  // Load accounts when component mounts or prop changes
  useEffect(() => {
    loadAccounts();
  }, [propAccounts]);

  const loadAccounts = async () => {
    console.log('💰 AllAccountsView - Loading accounts...');
    setLoading(true);

    try {
      // If we have accounts from props and they're not empty, use them
      if (propAccounts && Array.isArray(propAccounts) && propAccounts.length > 0) {
        console.log('💰 Using propAccounts:', propAccounts.length);
        setAccounts(propAccounts);
        setLoading(false);
        return;
      }

      console.log('💰 No propAccounts, fetching directly...');

      if (!window.electronAPI) {
        console.error('❌ electronAPI not available');
        setError('Application API not available');
        setLoading(false);
        return;
      }

      // Get current user
      const userResult = await window.electronAPI.getCurrentUser();
      console.log('💰 User result:', userResult);

      if (!userResult?.success || !userResult?.data) {
        console.error('❌ No user logged in');
        setError('Please log in to view accounts');
        setLoading(false);
        return;
      }

      const userId = userResult.data.id;
      console.log('💰 User ID:', userId);

      // Fetch all accounts using the same method that works in CashAccountsView
      const accountsResult = await window.electronAPI.getAccountsSummary(userId);
      console.log('💰 Accounts result:', accountsResult);

      if (accountsResult?.success) {
        const allAccounts = accountsResult.data || [];
        console.log('💰 All accounts count:', allAccounts.length);
        setAccounts(allAccounts);
      } else {
        console.error('❌ Failed to load accounts:', accountsResult?.error);
        setError(accountsResult?.error || 'Failed to load accounts');
      }
    } catch (error) {
      console.error('❌ Error loading accounts:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccountClick = (account) => {
    console.log('🔵 Clicked account:', account.id, account.name);
    console.log('🔵 Clicked account - full object:', account);
    console.log('🔵 Account ID:', account.id);
    console.log('🔵 Account name:', account.name);
    console.log('🔵 Navigation to:', `/accounts/${account.id}`);
    router.push(`/accounts/${account.id}`);
  };

  const handleEditClick = (e, account) => {
    e.stopPropagation();
    setEditingAccount(account.id);
    setEditForm({
      name: account.name,
      balance: account.balance,
      institution: account.institution || ''
    });
  };

  const handleDeleteClick = async (e, accountId) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this account? This action cannot be undone.')) {
      try {
        const result = await window.electronAPI.deleteAccount(accountId);
        if (result.success) {
          alert('✅ Account deleted successfully');
          if (onAccountDelete) {
            onAccountDelete(accountId);
          } else {
            // Refresh the list if no callback provided
            loadAccounts();
          }
        } else {
          alert('❌ Error deleting account: ' + result.error);
        }
      } catch (error) {
        console.error('Error deleting account:', error);
        alert('❌ Error deleting account: ' + error.message);
      }
    }
  };

const handleSaveEdit = async (accountId) => {
    try {
        const userResult = await window.electronAPI.getCurrentUser();
        if (!userResult?.success || !userResult?.data) {
            alert('You must be logged in');
            return;
        }
        const userId = userResult.data.id;

        const updates = {
            name: editForm.name,
            balance: parseFloat(editForm.balance),
            institution: editForm.institution || null
        };

        const result = await window.electronAPI.updateAccount(accountId, userId, updates);
        if (result.success) {
            setEditingAccount(null);
            alert('✅ Account updated successfully');
            window.dispatchEvent(new CustomEvent('accounts-updated'));
            if (onAccountUpdate) {
                onAccountUpdate(accountId, updates);
            } else {
                loadAccounts();
            }
        } else {
            alert('❌ Error updating account: ' + result.error);
        }
    } catch (error) {
        console.error('Error updating account:', error);
        alert('❌ Error updating account: ' + error.message);
    }
};
  const handleCancelEdit = (e) => {
    e.stopPropagation();
    setEditingAccount(null);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getAccountTypeColor = (type) => {
    switch (type) {
      case 'credit': return '#7C3AED';
      case 'checking': return '#3B82F6';
      case 'savings': return '#10B981';
      default: return '#6B7280';
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>All Accounts</h1>
        <p style={styles.description}>Loading your accounts...</p>
        <div style={styles.placeholder}>
          <div style={styles.loadingSpinner}></div>
          <p>Loading accounts...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>All Accounts</h1>
        <p style={styles.description}>Error loading accounts</p>
        <div style={styles.placeholder}>
          <p>❌ {error}</p>
          <button onClick={loadAccounts} style={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>All Accounts</h1>
      <p style={styles.description}>Click any account to view transactions • Hover for edit/delete options</p>

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
                <th style={styles.tableHeader}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr
                  key={account.id}
                  style={styles.tableRow}
                  onClick={() => editingAccount !== account.id && handleAccountClick(account)}
                  className="account-row"
                >
                  {editingAccount === account.id ? (
                    // Edit Mode
                    <>
                      <td style={styles.tableCell}>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          style={styles.editInput}
                          placeholder="Account name"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td style={styles.tableCell}>
                        <span style={{
                          ...styles.accountType,
                          backgroundColor: getAccountTypeColor(account.type)
                        }}>
                          {account.type}
                        </span>
                      </td>
                      <td style={styles.tableCell}>
                        <input
                          type="number"
                          value={editForm.balance}
                          onChange={(e) => setEditForm({ ...editForm, balance: e.target.value })}
                          style={styles.editInput}
                          placeholder="0.00"
                          step="0.01"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td style={styles.tableCell}>
                        <input
                          type="text"
                          value={editForm.institution}
                          onChange={(e) => setEditForm({ ...editForm, institution: e.target.value })}
                          style={styles.editInput}
                          placeholder="Institution"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td style={styles.tableCell}>
                        <div style={styles.actionButtons}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveEdit(account.id);
                            }}
                            style={styles.saveButton}
                          >
                            💾 Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            style={styles.cancelButton}
                          >
                            ✖ Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    // View Mode
                    <>
                      <td style={styles.tableCell}>{account.name}</td>
                      <td style={styles.tableCell}>
                        <span style={{
                          ...styles.accountType,
                          backgroundColor: getAccountTypeColor(account.type)
                        }}>
                          {account.type}
                        </span>
                      </td>
                      <td style={{
                        ...styles.tableCell,
                        ...styles.tableCellBalance,
                        color: account.balance >= 0 ? '#4ADE80' : '#F87171'
                      }}>
                        {formatCurrency(account.balance)}
                      </td>
                      <td style={styles.tableCell}>{account.institution || '-'}</td>
                      <td style={styles.tableCell}>
                        <div style={styles.actionButtons}>
                          <button
                            onClick={(e) => handleEditClick(e, account)}
                            style={styles.editButton}
                            title="Edit account"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={(e) => handleDeleteClick(e, account.id)}
                            style={styles.deleteButton}
                            title="Delete account"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Add these new styles
const styles = {
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #3B82F6',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 1rem'
  },
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
    border: '2px dashed #374151',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem'
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
    // borderBottom: '1px solid #374151',
    // cursor: 'pointer',
    // transition: 'background 0.2s',
    // ':hover': {
    //   background: '#374151'
    // },
    // ':last-child': {
    //   borderBottom: 'none'
    // }
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
  },
  actionButtons: {
    display: 'flex',
    gap: '0.5rem'
  },
  editButton: {
    background: 'none',
    border: '1px solid #3B82F6',
    color: '#3B82F6',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      background: '#3B82F6',
      color: 'white'
    }
  },
  deleteButton: {
    background: 'none',
    border: '1px solid #EF4444',
    color: '#EF4444',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      background: '#EF4444',
      color: 'white'
    }
  },
  editInput: {
    width: '100%',
    padding: '0.5rem',
    background: '#111827',
    border: '1px solid #3B82F6',
    borderRadius: '0.25rem',
    color: 'white',
    fontSize: '0.95rem'
  },
  saveButton: {
    background: '#10B981',
    border: 'none',
    color: 'white',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    marginRight: '0.25rem'
  },
  cancelButton: {
    background: '#6B7280',
    border: 'none',
    color: 'white',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    cursor: 'pointer'
  },
  // New styles for loading and error states
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #3B82F6',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 1rem'
  },
  retryButton: {
    padding: '0.5rem 1rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    marginTop: '1rem',
    fontSize: '0.875rem'
  }
};

export default AllAccountsView;