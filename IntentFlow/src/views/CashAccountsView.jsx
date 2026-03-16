// src/views/CashAccountsView.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const CashAccountsView = ({ accounts: propAccounts }) => {
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [newAccountData, setNewAccountData] = useState({
    name: '',
    type: 'checking',
    account_type_category: 'budget',
    balance: 0,
    currency: 'USD',
    institution: ''
  });

  // Add style for spinner animation using useEffect
  useEffect(() => {
    // Create style element only on client side
    if (typeof document !== 'undefined') {
      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
      
      // Cleanup
      return () => {
        document.head.removeChild(style);
      };
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [propAccounts]);

  const loadAccounts = async () => {
    console.log('💰 CashAccountsView - Loading accounts...');
    setLoading(true);
    
    try {
      if (propAccounts && Array.isArray(propAccounts) && propAccounts.length > 0) {
        console.log('💰 Using propAccounts:', propAccounts.length);
        const cashAccounts = propAccounts.filter(a => 
          a.type === 'checking' || a.type === 'savings'
        );
        setAccounts(cashAccounts);
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

      const accountsResult = await window.electronAPI.getAccountsSummary(userId);
      console.log('💰 Accounts result:', accountsResult);

      if (accountsResult?.success) {
        const allAccounts = accountsResult.data || [];
        console.log('💰 All accounts count:', allAccounts.length);
        
        const cashAccounts = allAccounts.filter(a => 
          a.type === 'checking' || a.type === 'savings'
        );
        console.log('💰 Cash accounts count:', cashAccounts.length);
        
        setAccounts(cashAccounts);
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

  const handleCreateAccount = async () => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in to create an account');
        return;
      }

      const userId = userResult.data.id;
      const accountData = {
        ...newAccountData,
        userId: userId,
        type: newAccountData.type,
        account_type_category: 'budget'
      };

      const result = await window.electronAPI.createAccount(accountData);
      if (result.success) {
        setShowNewAccountModal(false);
        await loadAccounts();
        setNewAccountData({
          name: '',
          type: 'checking',
          account_type_category: 'budget',
          balance: 0,
          currency: 'USD',
          institution: ''
        });
        alert('✅ Account created successfully!');
      } else {
        alert(`Failed to create account: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating account:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const handleAccountClick = (accountId) => {
    router.push(`/accounts/${accountId}`);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const getAccountIcon = (type) => {
    return type === 'checking' ? '🏦' : '💰';
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingState}>
          <div style={styles.loadingSpinner}></div>
          <p>Loading accounts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorState}>
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
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Accounts</h1>
          <p style={styles.description}>Manage your checking and savings accounts</p>
        </div>
        <button
          onClick={() => setShowNewAccountModal(true)}
          style={styles.addButton}
        >
          <span>+</span> New Account
        </button>
      </div>

      <div style={styles.accountsContainer}>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>CHECKING ACCOUNTS</h2>
          <div style={styles.accountList}>
            {accounts.filter(a => a.type === 'checking').map(account => (
              <div
                key={account.id}
                style={styles.accountRow}
                onClick={() => handleAccountClick(account.id)}
              >
                <div style={styles.accountInfo}>
                  <span style={styles.accountIcon}>{getAccountIcon(account.type)}</span>
                  <div>
                    <div style={styles.accountName}>{account.name}</div>
                    <div style={styles.accountMeta}>
                      {account.institution || 'No institution'}
                    </div>
                  </div>
                </div>
                <div style={styles.accountBalance}>
                  <div style={styles.balanceAmount}>
                    {formatCurrency(account.balance)}
                  </div>
                </div>
              </div>
            ))}
            {accounts.filter(a => a.type === 'checking').length === 0 && (
              <div style={styles.emptyState}>
                No checking accounts yet. Click "New Account" to add one.
              </div>
            )}
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>SAVINGS ACCOUNTS</h2>
          <div style={styles.accountList}>
            {accounts.filter(a => a.type === 'savings').map(account => (
              <div
                key={account.id}
                style={styles.accountRow}
                onClick={() => handleAccountClick(account.id)}
              >
                <div style={styles.accountInfo}>
                  <span style={styles.accountIcon}>{getAccountIcon(account.type)}</span>
                  <div>
                    <div style={styles.accountName}>{account.name}</div>
                    <div style={styles.accountMeta}>
                      {account.institution || 'No institution'}
                    </div>
                  </div>
                </div>
                <div style={styles.accountBalance}>
                  <div style={styles.balanceAmount}>
                    {formatCurrency(account.balance)}
                  </div>
                </div>
              </div>
            ))}
            {accounts.filter(a => a.type === 'savings').length === 0 && (
              <div style={styles.emptyState}>
                No savings accounts yet. Click "New Account" to add one.
              </div>
            )}
          </div>
        </div>
      </div>

      {showNewAccountModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>Create New Account</h2>

            <div style={styles.formGroup}>
              <label style={styles.label}>Account Name</label>
              <input
                type="text"
                value={newAccountData.name}
                onChange={(e) => setNewAccountData({ ...newAccountData, name: e.target.value })}
                style={styles.input}
                placeholder="e.g., Main Checking"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Account Type</label>
              <select
                value={newAccountData.type}
                onChange={(e) => setNewAccountData({ ...newAccountData, type: e.target.value })}
                style={styles.select}
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Current Balance</label>
              <input
                type="number"
                value={newAccountData.balance}
                onChange={(e) => setNewAccountData({ ...newAccountData, balance: parseFloat(e.target.value) || 0 })}
                style={styles.input}
                step="0.01"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Institution (Optional)</label>
              <input
                type="text"
                value={newAccountData.institution}
                onChange={(e) => setNewAccountData({ ...newAccountData, institution: e.target.value })}
                style={styles.input}
                placeholder="e.g., Chase Bank"
              />
            </div>

            <div style={styles.modalActions}>
              <button onClick={handleCreateAccount} style={styles.saveButton}>
                Create Account
              </button>
              <button onClick={() => setShowNewAccountModal(false)} style={styles.cancelButton}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    width: '100%',
    padding: '2rem',
    color: 'white'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem'
  },
  description: {
    fontSize: '1rem',
    color: '#9CA3AF'
  },
  addButton: {
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  accountsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem'
  },
  section: {
    marginBottom: '1rem'
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: '#9CA3AF'
  },
  accountList: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    overflow: 'hidden'
  },
  accountRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #374151',
    cursor: 'pointer',
    transition: 'background 0.2s',
    ':hover': {
      background: '#374151'
    }
  },
  accountInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  accountIcon: {
    fontSize: '1.5rem'
  },
  accountName: {
    fontWeight: '600',
    color: 'white'
  },
  accountMeta: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  accountBalance: {
    textAlign: 'right'
  },
  balanceAmount: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#4ADE80'
  },
  emptyState: {
    padding: '2rem',
    textAlign: 'center',
    color: '#6B7280'
  },
  loadingState: {
    padding: '3rem',
    textAlign: 'center',
    color: '#9CA3AF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem'
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #3B82F6',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '1rem'
  },
  errorState: {
    padding: '3rem',
    textAlign: 'center',
    color: '#F87171',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem'
  },
  retryButton: {
    padding: '0.5rem 1rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: '#1F2937',
    padding: '2rem',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '500px'
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: 'white'
  },
  formGroup: {
    marginBottom: '1rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem'
  },
  saveButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  }
};

export default CashAccountsView;