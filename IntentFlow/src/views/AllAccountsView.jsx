// src/views/AllAccountsView.jsx
import React, { useState, useEffect, useMemo } from 'react';
import ConnectBankCTA from '../components/ConnectBankCTA';
import EditAccountModal from './EditAccountModal';
import PlaidLinkedBadge from '../components/PlaidLinkedBadge';

const AllAccountsView = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedType, setSelectedType] = useState('all');

  // Add style injection
  useEffect(() => {
    const styleId = "spin-animation-style";
    
    if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
      const styleSheet = document.createElement("style");
      styleSheet.id = styleId;
      styleSheet.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(styleSheet);
    }
    
    return () => {
      if (typeof document !== 'undefined') {
        const existing = document.getElementById(styleId);
        if (existing) {
          document.head.removeChild(existing);
        }
      }
    };
  }, []);

  // Fetch all accounts
  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('📊 Fetching accounts...');
      
      // First get current user
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        console.error('❌ No user logged in');
        setError('Please log in to view accounts');
        setLoading(false);
        return;
      }
      
      const userId = userResult.data.id;
      console.log('👤 User ID:', userId);
      
      // Get accounts summary
      const result = await window.electronAPI.getAccountsSummary(userId);
      console.log('📊 Accounts result:', result);
      
      if (result.success) {
        const allAccounts = result.data || [];
        console.log('✅ Loaded accounts:', allAccounts.length);
        console.table(allAccounts.map(a => ({ id: a.id, name: a.name, type: a.type, balance: a.balance })));
        setAccounts(allAccounts);
      } else {
        console.error('❌ Failed to load accounts:', result.error);
        setError(result.error || 'Failed to load accounts');
      }
    } catch (err) {
      console.error('❌ Error fetching accounts:', err);
      setError('Failed to load accounts: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    
    // Listen for account changes
    const handleAccountsChanged = () => {
      console.log('🔄 Accounts changed, refreshing...');
      fetchAccounts();
    };
    
    window.addEventListener('accounts-changed', handleAccountsChanged);
    window.addEventListener('accounts-updated', handleAccountsChanged);
    
    return () => {
      window.removeEventListener('accounts-changed', handleAccountsChanged);
      window.removeEventListener('accounts-updated', handleAccountsChanged);
    };
  }, []);

  // Handle update account
  const handleUpdateAccount = async (accountId, updates) => {
    try {
      console.log('📝 Updating account:', accountId, updates);
      
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return;
      }
      
      const userId = userResult.data.id;
      
      const result = await window.electronAPI.updateAccount(accountId, userId, updates);
      
      if (result.success) {
        console.log('✅ Account updated successfully');
        await fetchAccounts();
        setEditingAccount(null);
        window.dispatchEvent(new Event('accounts-updated'));
        alert('✅ Account updated successfully!');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('❌ Error updating account:', error);
      alert('Failed to update account: ' + error.message);
    }
  };

  // Handle delete account
  const handleDeleteAccount = async (accountId) => {
    if (!confirm('Are you sure you want to delete this account? This will also delete all associated transactions.')) {
      return;
    }

    try {
      console.log('🗑️ Deleting account:', accountId);
      
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return;
      }
      
      const userId = userResult.data.id;
      
      const result = await window.electronAPI.deleteAccount(accountId, userId);
      
      if (result.success) {
        console.log('✅ Account deleted successfully');
        await fetchAccounts();
        window.dispatchEvent(new Event('accounts-changed'));
        alert('✅ Account deleted successfully');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('❌ Error deleting account:', error);
      alert('Failed to delete account: ' + error.message);
    }
  };

  // Handle edit button click
  const handleEditClick = (account) => {
    console.log('✏️ Editing account:', account);
    setEditingAccount(account);
    setShowEditModal(true);
  };

  // Handle save edit from modal
  const handleSaveEdit = async (accountId, updatedData) => {
    console.log('💾 Saving edit for account:', accountId, updatedData);
    await handleUpdateAccount(accountId, updatedData);
    setShowEditModal(false);
    setEditingAccount(null);
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Math.abs(amount || 0));
  };

  // Get account icon
  const getAccountIcon = (type) => {
    const icons = {
      checking: '💳',
      savings: '🏦',
      credit: '💳',
      loan: '📝',
      investment: '📈',
      cash: '💰',
      other: '📦'
    };
    return icons[type] || '💰';
  };

  // Get account color
  const getAccountColor = (type) => {
    const colors = {
      checking: '#0047AB',
      savings: '#10B981',
      credit: '#F59E0B',
      loan: '#EF4444',
      investment: '#8B5CF6',
      cash: '#6B7280',
      other: '#9CA3AF'
    };
    return colors[type] || '#9CA3AF';
  };

  // Filter accounts
  const filteredAccounts = selectedType === 'all'
    ? accounts
    : accounts.filter(acc => acc.type === selectedType);

  const accountsByInstitution = useMemo(() => {
    const map = new Map();
    for (const acc of filteredAccounts) {
      const key = (acc.institution || 'No institution').trim() || 'No institution';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(acc);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredAccounts]);

  // Calculate totals by type
  const totals = accounts.reduce((sums, acc) => {
    const balance = Math.abs(acc.balance || 0);
    if (acc.type === 'checking') sums.checking = (sums.checking || 0) + balance;
    if (acc.type === 'savings') sums.savings = (sums.savings || 0) + balance;
    if (acc.type === 'credit') sums.credit = (sums.credit || 0) + balance;
    if (acc.type === 'loan') sums.loan = (sums.loan || 0) + balance;
    if (acc.type === 'investment') sums.investment = (sums.investment || 0) + balance;
    sums.total += balance;
    return sums;
  }, { checking: 0, savings: 0, credit: 0, loan: 0, investment: 0, total: 0 });

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading your accounts...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>💰 All Accounts</h1>
          <p style={styles.subtitle}>Manage all your financial accounts in one place</p>
        </div>
      </div>

      {/* Summary Cards - FIXED: Added text overflow handling */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💳</div>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Checking</span>
            <span style={styles.summaryValue}>{formatCurrency(totals.checking)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>🏦</div>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Savings</span>
            <span style={styles.summaryValue}>{formatCurrency(totals.savings)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💳</div>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Credit Cards</span>
            <span style={styles.summaryValue}>{formatCurrency(totals.credit)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📝</div>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Loans</span>
            <span style={styles.summaryValue}>{formatCurrency(totals.loan)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📈</div>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Investments</span>
            <span style={styles.summaryValue}>{formatCurrency(totals.investment)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💰</div>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Total Assets</span>
            <span style={styles.summaryValue}>{formatCurrency(totals.total)}</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={styles.filterSection}>
        <div style={styles.filterTabs}>
          <button
            onClick={() => setSelectedType('all')}
            style={{
              ...styles.filterTab,
              ...(selectedType === 'all' ? styles.activeFilterTab : {})
            }}
          >
            All ({accounts.length})
          </button>
          <button
            onClick={() => setSelectedType('checking')}
            style={{
              ...styles.filterTab,
              ...(selectedType === 'checking' ? styles.activeFilterTab : {})
            }}
          >
            Checking ({accounts.filter(a => a.type === 'checking').length})
          </button>
          <button
            onClick={() => setSelectedType('savings')}
            style={{
              ...styles.filterTab,
              ...(selectedType === 'savings' ? styles.activeFilterTab : {})
            }}
          >
            Savings ({accounts.filter(a => a.type === 'savings').length})
          </button>
          <button
            onClick={() => setSelectedType('credit')}
            style={{
              ...styles.filterTab,
              ...(selectedType === 'credit' ? styles.activeFilterTab : {})
            }}
          >
            Credit Cards ({accounts.filter(a => a.type === 'credit').length})
          </button>
          <button
            onClick={() => setSelectedType('loan')}
            style={{
              ...styles.filterTab,
              ...(selectedType === 'loan' ? styles.activeFilterTab : {})
            }}
          >
            Loans ({accounts.filter(a => a.type === 'loan').length})
          </button>
          <button
            onClick={() => setSelectedType('investment')}
            style={{
              ...styles.filterTab,
              ...(selectedType === 'investment' ? styles.activeFilterTab : {})
            }}
          >
            Investments ({accounts.filter(a => a.type === 'investment').length})
          </button>
        </div>
      </div>

      {/* Accounts Table */}
      {error ? (
        <div style={styles.errorContainer}>
          <p style={styles.errorText}>Error: {error}</p>
          <button onClick={fetchAccounts} style={styles.retryButton}>Retry</button>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyStateIcon}>🏦</div>
          <h3 style={styles.emptyStateTitle}>No accounts found</h3>
          <p style={styles.emptyStateText}>
            {selectedType === 'all' ? (
              <ConnectBankCTA label="accounts" />
            ) : (
              `No ${selectedType} accounts found. Add one to get started.`
            )}
          </p>
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>Account</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Institution</th>
                <th style={styles.th}>Balance</th>
                <th style={styles.th}>Details</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accountsByInstitution.map(([institution, group]) => (
                <React.Fragment key={institution}>
                  <tr style={styles.institutionHeaderRow}>
                    <td colSpan={6} style={styles.institutionHeader}>
                      {institution}
                      <span style={styles.institutionCount}> ({group.length})</span>
                    </td>
                  </tr>
                  {group.map((account) => (
                <tr key={account.id} style={styles.tableRow}>
                  <td style={styles.td}>
                    <div style={styles.accountNameCell}>
                      <span style={styles.accountIcon}>{getAccountIcon(account.type)}</span>
                      <strong>
                        {account.name}
                        <PlaidLinkedBadge account={account} />
                      </strong>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.typeBadge,
                      background: `${getAccountColor(account.type)}20`,
                      color: getAccountColor(account.type)
                    }}>
                      {account.type}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {account.institution || '—'}
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.balance,
                      color: account.type === 'credit' || account.type === 'loan' ? '#EF4444' : '#4ADE80'
                    }}>
                      {formatCurrency(account.balance)}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.detailsList}>
                      {account.credit_limit && (
                        <span style={styles.detailBadge}>
                          Limit: {formatCurrency(account.credit_limit)}
                        </span>
                      )}
                      {account.interest_rate && (
                        <span style={styles.detailBadge}>
                          {account.interest_rate}% APR
                        </span>
                      )}
                      {account.due_date && (
                        <span style={styles.detailBadge}>
                          Due: {account.due_date}
                        </span>
                      )}
                      {account.apr && !account.interest_rate && (
                        <span style={styles.detailBadge}>
                          {account.apr}% APR
                        </span>
                      )}
                      {account.account_number && (
                        <span style={styles.detailBadge}>
                          Acct: ••••{account.account_number.slice(-4)}
                        </span>
                      )}
                      {account.account_holder_name && (
                        <span style={styles.detailBadge}>
                          Holder: {account.account_holder_name}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actionButtons}>
                      <button
                        onClick={() => handleEditClick(account)}
                        style={styles.editButton}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(account.id)}
                        style={styles.deleteButton}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Account Modal */}
      <EditAccountModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingAccount(null);
        }}
        onSave={handleSaveEdit}
        onDelete={handleDeleteAccount}
        account={editingAccount}
      />
    </div>
  );
};

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1400px',
    margin: '0 auto',
    color: '#0047AB'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    color: '#9CA3AF'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #374151',
    borderTopColor: '#0047AB',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '1rem'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    flexWrap: 'wrap',
    gap: '1rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    margin: 0,
    color: '#0047AB'
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginTop: '0.5rem'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem'
  },
  summaryCard: {
    background: '#0047AB',
    padding: '1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    minWidth: 0, // Allows flex item to shrink below content size
    overflow: 'hidden' // Prevents overflow
  },
  summaryIcon: {
    fontSize: '2rem',
    flexShrink: 0 // Prevents icon from shrinking
  },
  summaryContent: {
    flex: 1,
    minWidth: 0, // Allows text truncation
    overflow: 'hidden' // Prevents overflow
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.75)',
    marginBottom: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    display: 'block',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  summaryValue: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    display: 'block',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: '#FFFFFF'
  },
  filterSection: {
    marginBottom: '2rem'
  },
  filterTabs: {
    display: 'flex',
    gap: '0.5rem',
    borderBottom: '1px solid #374151',
    paddingBottom: '0.5rem',
    flexWrap: 'wrap'
  },
  filterTab: {
    padding: '0.5rem 1rem',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    borderRadius: '0.375rem',
    transition: 'all 0.2s'
  },
  activeFilterTab: {
    color: '#0047AB',
    background: 'rgba(59, 130, 246, 0.1)'
  },
  tableContainer: {
    overflowX: 'auto',
    background: '#0047AB',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '800px'
  },
  tableHeader: {
    borderBottom: '1px solid #374151',
    background: '#0047AB'
  },
  th: {
    padding: '1rem',
    textAlign: 'left',
    color: '#9CA3AF',
    fontWeight: '600',
    fontSize: '0.875rem'
  },
  institutionHeaderRow: {
    background: '#1F2937',
  },
  institutionHeader: {
    padding: '0.65rem 1rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#93C5FD',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  institutionCount: {
    fontWeight: 500,
    color: '#6B7280',
    textTransform: 'none',
  },
  tableRow: {
    borderBottom: '1px solid #374151',
    transition: 'background 0.2s',
    ':hover': {
      background: '#2D3748'
    }
  },
  td: {
    padding: '1rem',
    verticalAlign: 'middle'
  },
  accountNameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  accountIcon: {
    fontSize: '1.25rem'
  },
  typeBadge: {
    padding: '0.25rem 0.75rem',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'capitalize',
    display: 'inline-block'
  },
  balance: {
    fontWeight: '600',
    fontSize: '1rem',
    whiteSpace: 'nowrap'
  },
  detailsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  detailBadge: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    background: '#374151',
    padding: '0.125rem 0.5rem',
    borderRadius: '0.25rem',
    display: 'inline-block',
    width: 'fit-content',
    whiteSpace: 'nowrap'
  },
  actionButtons: {
    display: 'flex',
    gap: '0.5rem'
  },
  editButton: {
    padding: '0.25rem 0.75rem',
    background: '#0047AB',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    transition: 'all 0.2s',
    ':hover': {
      background: '#001a40'
    }
  },
  deleteButton: {
    padding: '0.25rem 0.75rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    transition: 'all 0.2s',
    ':hover': {
      background: '#DC2626'
    }
  },
  editInput: {
    padding: '0.25rem 0.5rem',
    background: '#0047AB',
    border: '1px solid #0047AB',
    borderRadius: '0.375rem',
    color: 'white',
    fontSize: '0.875rem',
    outline: 'none'
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem',
    background: '#0047AB',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  emptyStateIcon: {
    fontSize: '4rem',
    marginBottom: '1rem'
  },
  emptyStateTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: '0 0 0.5rem 0',
    color: 'white'
  },
  emptyStateText: {
    color: '#9CA3AF',
    marginBottom: '1.5rem'
  },
  errorContainer: {
    textAlign: 'center',
    padding: '2rem',
    background: '#0047AB',
    borderRadius: '0.75rem',
    border: '1px solid #EF4444'
  },
  errorText: {
    color: '#EF4444',
    marginBottom: '1rem'
  },
  retryButton: {
    padding: '0.5rem 1rem',
    background: '#374151',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer'
  }
};

export default AllAccountsView;