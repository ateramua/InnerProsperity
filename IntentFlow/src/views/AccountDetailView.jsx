// src/views/AccountDetailView.jsx
import React, { useState, useEffect } from 'react';

function AccountDetailView({ account: propAccount, accountId, onBack, onMakePayment }) {
  console.log('🔥 AccountDetailView mounted – timestamp', Date.now());
  console.log('🔵 Props:', { propAccount, accountId, onBack: !!onBack, onMakePayment: !!onMakePayment });

  // ----- Normalize to a single source of truth for the account ID -----
  const definitiveAccountId = accountId || propAccount?.id;
  console.log('🔍 definitiveAccountId:', definitiveAccountId);

  const [account, setAccount] = useState(propAccount || null);
  const [loading, setLoading] = useState(!propAccount && !!definitiveAccountId);
  const [error, setError] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [addTransactionError, setAddTransactionError] = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0); // NEW: for auto-refresh
  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    category: '',
    memo: '',
  });

  // ----- NEW: Listen for account updates from the main process -----
  // Inside the event listener
  useEffect(() => {
    const handleAccountsUpdated = () => {
      console.log('🔄 AccountDetailView received accounts-updated event');
      if (definitiveAccountId) {
        console.log('🔄 Incrementing refreshCounter for account:', definitiveAccountId);
        setRefreshCounter(prev => prev + 1);
      }
    };
    window.addEventListener('accounts-updated', handleAccountsUpdated);
    return () => window.removeEventListener('accounts-updated', handleAccountsUpdated);
  }, [definitiveAccountId]);

  // ----- Fetch account using definitiveAccountId (now depends on refreshCounter) -----
  useEffect(() => {
    console.log('🟢 Account fetch effect running', { propAccount, accountId, definitiveAccountId, refreshCounter });
    if (propAccount) {
      setAccount(propAccount);
      setLoading(false);
      return;
    }
    if (definitiveAccountId) {
      let isMounted = true;
      const fetchAccount = async () => {
        setLoading(true);
        setError(null);
        console.log('🔍 Fetching account with ID:', definitiveAccountId);
        try {
          const userResult = await window.electronAPI?.getCurrentUser?.();
          const userId = userResult?.data?.id || 2; // fallback – adjust as needed
          const result = await window.electronAPI?.getAccountById?.(definitiveAccountId, userId);
          console.log('🔍 Fetch result:', result);
          if (result?.success && result.data) {
            if (isMounted) setAccount(result.data);
          } else {
            if (isMounted) setError('Account not found');
          }
        } catch (err) {
          console.error('❌ Fetch error:', err);
          if (isMounted) setError('Failed to load account');
        } finally {
          if (isMounted) setLoading(false);
        }
      };
      fetchAccount();
      return () => {
        isMounted = false;
      };
    } else {
      setLoading(false);
    }
  }, [propAccount, definitiveAccountId, refreshCounter]); // added refreshCounter

  // ----- Load transactions for a given account ID -----
  const loadTransactions = async (id) => {
    const targetId = id || account?.id;
    if (!targetId) {
      console.log('📥 No account ID available to load transactions');
      return;
    }
    console.log('📥 Loading transactions for account:', targetId);
    try {
      if (window.electronAPI?.getAccountTransactions) {
        const result = await window.electronAPI.getAccountTransactions(targetId);
        console.log('📥 getAccountTransactions result:', result);
        if (result.success) {
          console.log('✅ Transactions data:', result.data);
          setTransactions(result.data);
        } else {
          console.error('❌ Failed to load transactions:', result.error);
        }
      } else {
        // Mock transactions for development – remove in production
        console.warn('⚠️ Using mock transaction data – electronAPI.getAccountTransactions not available');
        setTransactions([
          { id: 1, date: '2024-03-15', description: 'Grocery Store', amount: -125.32, category: 'Groceries' },
          { id: 2, date: '2024-03-14', description: 'Gas Station', amount: -45.67, category: 'Transportation' },
          { id: 3, date: '2024-03-10', description: 'Payment Received', amount: 500.0, category: 'Payment' },
          { id: 4, date: '2024-03-05', description: 'Restaurant', amount: -78.5, category: 'Dining' },
          { id: 5, date: '2024-03-01', description: 'Online Subscription', amount: -14.99, category: 'Entertainment' },
        ]);
      }
    } catch (error) {
      console.error('❌ Error loading transactions:', error);
    }
  };

  // ----- Load transactions when account becomes available -----
  useEffect(() => {
    console.log('🟢 Transaction effect running, account:', account);
    if (account?.id) {
      loadTransactions(account.id);
    }
  }, [account]);

  // ----- Add a new transaction -----
  const handleAddTransaction = async () => {
    setAddTransactionError(null);
    const amountNum = parseFloat(newTransaction.amount);
    if (isNaN(amountNum)) {
      setAddTransactionError('Please enter a valid amount');
      return;
    }
    if (!newTransaction.description.trim()) {
      setAddTransactionError('Description is required');
      return;
    }
    try {
      const transactionData = {
        accountId: account.id,
        date: newTransaction.date,
        description: newTransaction.description.trim(),
        amount: amountNum,
        category: newTransaction.category.trim() || null,
        memo: newTransaction.memo.trim() || null,
      };

      if (window.electronAPI?.addTransaction) {
        const result = await window.electronAPI.addTransaction(transactionData);
        if (result.success) {
          await loadTransactions(account.id);
          setShowAddTransaction(false);
          setNewTransaction({
            date: new Date().toISOString().split('T')[0],
            description: '',
            amount: '',
            category: '',
            memo: '',
          });
        } else {
          setAddTransactionError(result.error || 'Failed to add transaction');
        }
      } else {
        // Mock addition for development
        console.warn('⚠️ Using mock transaction add – electronAPI.addTransaction not available');
        setTransactions([...transactions, { ...transactionData, id: Date.now() }]);
        setShowAddTransaction(false);
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
      setAddTransactionError('An unexpected error occurred');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount || 0);
  };

  const formatAccountNumber = (number) => {
    if (!number) return 'Not provided';
    const last4 = number.slice(-4);
    return `•••• •••• •••• ${last4}`;
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading account details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>{error}</div>
        <button onClick={onBack} style={styles.backButton}>
          ← Back
        </button>
      </div>
    );
  }

  if (!account) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>Account not found</div>
        <button onClick={onBack} style={styles.backButton}>
          ← Back
        </button>
      </div>
    );
  }

  const isCreditCard = account.type === 'credit';
  const creditLimit = account.credit_limit || account.limit || 0;
  // Balance for credit cards is stored as negative (debt) or positive (overpayment).
  // Available credit = limit + balance (since balance is negative when you owe,
  // this reduces available; if balance is positive, it increases available).
  const availableCredit = isCreditCard ? creditLimit + (account.balance || 0) : 0;
  const interestRate = account.interest_rate || account.apr || null;

  return (
    <div style={styles.container}>
      {/* Header with Navigation */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>
          ← Back
        </button>
        <div style={styles.headerTitle}>
          <h2 style={styles.title}>{account.name}</h2>
          <span style={styles.accountType}>
            {isCreditCard ? '💳 Credit Card' : account.type || 'Account'}
            {account.institution && ` • ${account.institution}`}
          </span>
        </div>
        {isCreditCard && (
          <button
            onClick={() => onMakePayment && onMakePayment(account.id)}
            style={styles.paymentButton}
          >
            💰 Make Payment
          </button>
        )}
      </div>

      {/* Account Summary */}
      <div style={styles.summaryCard}>
        <div style={styles.summaryRow}>
          <div style={styles.summaryItem}>
            <div style={styles.summaryLabel}>Current Balance</div>
            <div
              style={{
                ...styles.summaryValue,
                color: account.balance < 0 ? '#EF4444' : '#10B981',
              }}
            >
              {formatCurrency(Math.abs(account.balance || 0))}
              {account.balance < 0 && (
                <span style={styles.negativeIndicator}> (you owe)</span>
              )}
            </div>
          </div>

          {isCreditCard && (
            <>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Credit Limit</div>
                <div style={styles.summaryValue}>{formatCurrency(creditLimit)}</div>
              </div>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Available Credit</div>
                <div style={styles.summaryValue}>{formatCurrency(availableCredit)}</div>
              </div>
            </>
          )}
        </div>

        {/* Credit Card Specific Details */}
        {isCreditCard && (
          <div style={styles.creditDetails}>
            <div style={styles.creditDetailsGrid}>
              {interestRate && (
                <div style={styles.creditDetailItem}>
                  <span style={styles.creditDetailLabel}>Interest Rate</span>
                  <span style={styles.creditDetailValue}>{interestRate}% APR</span>
                </div>
              )}
              {account.due_date && (
                <div style={styles.creditDetailItem}>
                  <span style={styles.creditDetailLabel}>Payment Due</span>
                  <span style={styles.creditDetailValue}>
                    {new Date(account.due_date).toLocaleDateString()}
                  </span>
                </div>
              )}
              {account.cardHolderName && (
                <div style={styles.creditDetailItem}>
                  <span style={styles.creditDetailLabel}>Card Holder</span>
                  <span style={styles.creditDetailValue}>{account.cardHolderName}</span>
                </div>
              )}
              {account.accountNumber && (
                <div style={styles.creditDetailItem}>
                  <span style={styles.creditDetailLabel}>Account Number</span>
                  <span style={styles.creditDetailValue}>
                    {formatAccountNumber(account.accountNumber)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Due Date Badge for Credit Cards */}
        {isCreditCard && account.due_date && (
          <div style={styles.dueDateBadge}>
            💳 Payment due by {new Date(account.due_date).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Transactions Header */}
      <div style={styles.transactionsHeader}>
        <h3 style={styles.transactionsTitle}>Recent Transactions</h3>
        <div style={styles.header}>
          <button onClick={onBack} style={styles.backButton}>← Back</button>
          <div style={styles.headerTitle}>
            <h2 style={styles.title}>{account.name}</h2>
            <span style={styles.accountType}>
              {isCreditCard ? '💳 Credit Card' : account.type || 'Account'}
              {account.institution && ` • ${account.institution}`}
            </span>
          </div>
          <button onClick={() => setRefreshCounter(prev => prev + 1)} style={styles.refreshButton}>
            🔄 Refresh
          </button>
          {isCreditCard && (
            <button onClick={() => onMakePayment && onMakePayment(account.id)} style={styles.paymentButton}>
              💰 Make Payment
            </button>
          )}
        </div>
        <button
          onClick={() => setShowAddTransaction(true)}
          style={styles.addButton}
        >
          + Add Transaction
        </button>
      </div>

      {/* Transactions List */}
      <div style={styles.transactionsList}>
        {transactions.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No transactions yet</p>
            <button
              onClick={() => setShowAddTransaction(true)}
              style={styles.emptyAddButton}
            >
              + Add Your First Transaction
            </button>
          </div>
        ) : (
          transactions.map((tx) => (
            <div key={tx.id} style={styles.transactionItem}>
              <div style={styles.transactionDate}>
                {new Date(tx.date).toLocaleDateString()}
              </div>
              <div style={styles.transactionDescription}>
                <div>{tx.description || 'Transaction'}</div>
                {tx.category && (
                  <span style={styles.transactionCategory}>{tx.category}</span>
                )}
              </div>
              <div
                style={{
                  ...styles.transactionAmount,
                  color: tx.amount < 0 ? '#EF4444' : '#10B981',
                }}
              >
                {formatCurrency(tx.amount)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Transaction Modal */}
      {showAddTransaction && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowAddTransaction(false)}
        >
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Transaction</h3>

            {addTransactionError && (
              <div style={styles.errorMessage}>{addTransactionError}</div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.label}>Date</label>
              <input
                type="date"
                value={newTransaction.date}
                onChange={(e) =>
                  setNewTransaction({ ...newTransaction, date: e.target.value })
                }
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Description</label>
              <input
                type="text"
                value={newTransaction.description}
                onChange={(e) =>
                  setNewTransaction({ ...newTransaction, description: e.target.value })
                }
                placeholder="e.g., Grocery Store"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Amount</label>
              <div style={styles.inputWrapper}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={newTransaction.amount}
                  onChange={(e) =>
                    setNewTransaction({ ...newTransaction, amount: e.target.value })
                  }
                  placeholder="0.00"
                  step="0.01"
                  style={styles.inputWithSymbol}
                />
              </div>
              <div style={styles.amountHint}>
                Negative for purchases, positive for payments
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Category (Optional)</label>
              <input
                type="text"
                value={newTransaction.category}
                onChange={(e) =>
                  setNewTransaction({ ...newTransaction, category: e.target.value })
                }
                placeholder="e.g., Groceries, Dining"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Memo (Optional)</label>
              <input
                type="text"
                value={newTransaction.memo}
                onChange={(e) =>
                  setNewTransaction({ ...newTransaction, memo: e.target.value })
                }
                placeholder="Additional notes"
                style={styles.input}
              />
            </div>

            <div style={styles.modalActions}>
              <button onClick={handleAddTransaction} style={styles.submitButton}>
                Add Transaction
              </button>
              <button
                onClick={() => setShowAddTransaction(false)}
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Styles – inline only; no pseudo-classes (hover, focus) because they don't work
// with inline styles. For better interactivity, consider using a CSS-in-JS
// library (e.g., Emotion) or CSS modules.
// ----------------------------------------------------------------------
const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1000px',
    margin: '0 auto',
    color: 'white',
  },
  refreshButton: {
    padding: '0.5rem 1rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'background 0.2s',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '2rem',
    flexWrap: 'wrap',
  },
  backButton: {
    padding: '0.5rem 1rem',
    background: '#374151',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'background 0.2s',
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    margin: '0 0 0.25rem 0',
    color: 'white',
  },
  accountType: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
  },
  paymentButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  summaryCard: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '2rem',
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem',
  },
  summaryItem: {
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    lineHeight: '1.2',
  },
  negativeIndicator: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    display: 'block',
    fontWeight: 'normal',
  },
  creditDetails: {
    marginTop: '1.5rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid #374151',
  },
  creditDetailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
  },
  creditDetailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  creditDetailLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  creditDetailValue: {
    fontSize: '1rem',
    fontWeight: '500',
    color: 'white',
  },
  dueDateBadge: {
    marginTop: '1rem',
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #F59E0B20, #F59E0B10)',
    color: '#F59E0B',
    borderRadius: '0.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    fontWeight: '500',
    border: '1px solid #F59E0B40',
  },
  transactionsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  transactionsTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: 0,
    color: 'white',
  },
  addButton: {
    padding: '0.5rem 1rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  transactionsList: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    overflow: 'hidden',
  },
  emptyState: {
    padding: '3rem',
    textAlign: 'center',
    color: '#9CA3AF',
  },
  emptyAddButton: {
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  transactionItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem',
    borderBottom: '1px solid #374151',
    transition: 'background 0.2s',
    ':last-child': {
      borderBottom: 'none',
    },
  },
  transactionDate: {
    width: '100px',
    fontSize: '0.875rem',
    color: '#9CA3AF',
  },
  transactionDescription: {
    flex: 1,
    margin: '0 1rem',
  },
  transactionCategory: {
    fontSize: '0.75rem',
    color: '#6B7280',
    marginLeft: '0.5rem',
  },
  transactionAmount: {
    fontSize: '1rem',
    fontWeight: '600',
    minWidth: '100px',
    textAlign: 'right',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: '#1F2937',
    padding: '2rem',
    borderRadius: '1rem',
    maxWidth: '400px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: '0 0 1.5rem 0',
    color: 'white',
  },
  errorMessage: {
    background: '#7F1A1A',
    color: '#FECACA',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
    fontSize: '0.875rem',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    transition: 'border-color 0.2s',
  },
  inputWrapper: {
    position: 'relative',
  },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF',
  },
  inputWithSymbol: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    transition: 'border-color 0.2s',
  },
  amountHint: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginTop: '0.25rem',
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem',
  },
  submitButton: {
    flex: 2,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#6B7280',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  loading: {
    textAlign: 'center',
    padding: '2rem',
    color: '#9CA3AF',
  },
  error: {
    textAlign: 'center',
    padding: '2rem',
    color: '#F87171',
    marginBottom: '1rem',
  },
};

export default AccountDetailView;