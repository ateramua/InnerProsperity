// src/pages/accounts/[id].jsx
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const AccountDetailPage = () => {
    const router = useRouter();
    const { id } = router.query;

    const [account, setAccount] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [scheduledTransactions, setScheduledTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [transactionError, setTransactionError] = useState('');
    const [showScheduledSection, setShowScheduledSection] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Transaction form with Transaction Type
    const [transactionForm, setTransactionForm] = useState({
        transactionType: 'outflow',
        categoryId: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        payee: '',
        memo: '',
        cleared: true
    });

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount || 0);
    };

    // Get filtered categories based on transaction type
    const getFilteredCategories = () => {
        if (transactionForm.transactionType === 'inflow') {
            return [{ id: 'inflow_ready_to_assign', name: '💰 Inflow: Ready to Assign' }];
        }
        if (!categories || categories.length === 0) {
            return [];
        }
        return categories.filter(cat => cat && !cat.archived);
    };

    // Calculate balance change
    const calculateBalanceChange = (accountType, transactionType, amount) => {
        const isCreditOrLoan = accountType === 'credit' || accountType === 'loan';
        const isExpense = transactionType === 'outflow';
        const absAmount = Math.abs(amount);

        if (isCreditOrLoan) {
            return isExpense ? -absAmount : absAmount;
        } else {
            return isExpense ? -absAmount : absAmount;
        }
    };

    // Load scheduled transactions
    const loadScheduledTransactions = async () => {
        try {
            if (window.electronAPI.getScheduledTransactions && account?.id) {
                const result = await window.electronAPI.getScheduledTransactions(account.id);
                if (result?.success) {
                    setScheduledTransactions(result.data || []);
                    console.log('📅 Scheduled transactions loaded:', result.data?.length);
                }
            }
        } catch (error) {
            console.error('Error loading scheduled transactions:', error);
        }
    };

    // Approve a scheduled transaction
    const handleApproveScheduled = async (scheduledTx) => {
        setRefreshing(true);
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (!userResult?.success || !userResult?.data) {
                alert('Please log in to approve transaction');
                return;
            }

            const userId = userResult.data.id;
            const isExpense = scheduledTx.transactionType === 'outflow';
            const amountValue = Math.abs(parseFloat(scheduledTx.amount));

            let transactionAmount = isExpense ? -amountValue : amountValue;
            let balanceChange = isExpense ? -amountValue : amountValue;

            const isReadyToAssign = scheduledTx.transactionType === 'inflow' &&
                scheduledTx.categoryId === 'inflow_ready_to_assign';

            // Step 1: Add to regular transactions
            const transactionData = {
                accountId: account.id,
                date: new Date().toISOString().split('T')[0],
                payee: scheduledTx.payee,
                description: scheduledTx.payee,
                amount: transactionAmount,
                categoryId: isReadyToAssign ? null : scheduledTx.categoryId,
                memo: scheduledTx.memo,
                cleared: 1
            };

            const addResult = await window.electronAPI.addTransaction(transactionData);
            if (!addResult.success) {
                alert('Failed to add transaction: ' + addResult.error);
                return;
            }

            // Step 2: Update account balance
            const currentBalance = account.balance || 0;
            const newBalance = currentBalance + balanceChange;
            await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });

            // Step 3: Delete the scheduled transaction
            await window.electronAPI.deleteScheduledTransaction(scheduledTx.id);

            // Step 4: Refresh all data
            await loadAccountData(account.id);
            await loadScheduledTransactions();
            
            window.dispatchEvent(new CustomEvent('accounts-updated'));
            window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
            
            alert(`✅ Transaction approved and added!\nNew balance: ${formatCurrency(newBalance)}`);
        } catch (error) {
            console.error('Error approving scheduled transaction:', error);
            alert('Error approving transaction: ' + error.message);
        } finally {
            setRefreshing(false);
        }
    };

    // Reject/Delete a scheduled transaction
    const handleRejectScheduled = async (scheduledTx) => {
        if (!window.confirm(`Are you sure you want to delete this scheduled transaction?\n\nPayee: ${scheduledTx.payee}\nAmount: ${formatCurrency(scheduledTx.amount)}`)) {
            return;
        }

        setRefreshing(true);
        try {
            await window.electronAPI.deleteScheduledTransaction(scheduledTx.id);
            await loadScheduledTransactions();
            alert('✅ Scheduled transaction deleted');
        } catch (error) {
            console.error('Error deleting scheduled transaction:', error);
            alert('Error deleting transaction: ' + error.message);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (id) {
            loadAccountData(id);
        }
    }, [id]);

    const loadCategories = async () => {
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (userResult?.success && userResult?.data) {
                const categoriesResult = await window.electronAPI.getCategories(userResult.data.id);
                if (categoriesResult?.success) {
                    setCategories(categoriesResult.data);
                }
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    };

    const loadAccountData = async (accountId) => {
        setLoading(true);
        try {
            let accountResult = await window.electronAPI.getAccountById(accountId, 2);
            if (!accountResult?.success || !accountResult?.data) {
                accountResult = await window.electronAPI.getAccountById(accountId);
            }

            if (accountResult?.success && accountResult?.data) {
                setAccount(accountResult.data);
            }

            const transactionsResult = await window.electronAPI.getAccountTransactions(accountId);
            if (transactionsResult?.success) {
                setTransactions(transactionsResult.data || []);
            }

            await loadCategories();
            await loadScheduledTransactions();
        } catch (error) {
            console.error('Error loading account data:', error);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setTransactionForm({
            transactionType: 'outflow',
            categoryId: '',
            amount: '',
            date: new Date().toISOString().split('T')[0],
            payee: '',
            memo: '',
            cleared: true
        });
        setTransactionError('');
    };

    // Add regular transaction (for today/past dates)
    const handleAddRegularTransaction = async (amountValue, userId) => {
        const isCreditOrLoan = account.type === 'credit' || account.type === 'loan';
        const isExpense = transactionForm.transactionType === 'outflow';

        let transactionAmount = 0;
        let balanceChange = 0;

        if (isCreditOrLoan) {
            if (isExpense) {
                transactionAmount = -amountValue;
                balanceChange = -amountValue;
            } else {
                transactionAmount = amountValue;
                balanceChange = amountValue;
            }
        } else {
            if (isExpense) {
                transactionAmount = -amountValue;
                balanceChange = -amountValue;
            } else {
                transactionAmount = amountValue;
                balanceChange = amountValue;
            }
        }

        const isReadyToAssign = transactionForm.transactionType === 'inflow' &&
            transactionForm.categoryId === 'inflow_ready_to_assign';

        const transactionData = {
            accountId: account.id,
            date: transactionForm.date,
            payee: transactionForm.payee,
            description: transactionForm.payee,
            amount: transactionAmount,
            categoryId: isReadyToAssign ? null : transactionForm.categoryId,
            memo: transactionForm.memo,
            cleared: transactionForm.cleared ? 1 : 0
        };

        const result = await window.electronAPI.addTransaction(transactionData);
        if (!result.success) {
            throw new Error(result.error || 'Failed to add transaction');
        }

        const currentBalance = account.balance || 0;
        const newBalance = currentBalance + balanceChange;
        await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });
        
        return newBalance;
    };

    // Add scheduled transaction (for future dates)
    const handleAddScheduledTransaction = async (amountValue, userId) => {
        const scheduledData = {
            accountId: account.id,
            date: transactionForm.date,
            payee: transactionForm.payee,
            amount: amountValue,
            transactionType: transactionForm.transactionType,
            categoryId: transactionForm.categoryId,
            memo: transactionForm.memo,
            userId: userId,
            status: 'pending'
        };

        if (!window.electronAPI.addScheduledTransaction) {
            throw new Error('Scheduled transactions not supported yet');
        }

        const result = await window.electronAPI.addScheduledTransaction(scheduledData);
        if (!result.success) {
            throw new Error(result.error || 'Failed to add scheduled transaction');
        }
        
        return null;
    };

    // Main handler - decides between regular and scheduled
    const handleAddTransaction = async () => {
        setTransactionError('');

        const amountValue = parseFloat(transactionForm.amount);
        const transactionDate = new Date(transactionForm.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (isNaN(amountValue) || amountValue === 0) {
            setTransactionError('Please enter a valid amount');
            return;
        }

        if (!transactionForm.payee.trim()) {
            setTransactionError('Please enter a payee');
            return;
        }

        if (!transactionForm.categoryId) {
            setTransactionError('Please select a category');
            return;
        }

        setIsSubmitting(true);

        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (!userResult?.success || !userResult?.data) {
                setTransactionError('Please log in to add transaction');
                return;
            }

            const userId = userResult.data.id;
            const isFutureDate = transactionDate > today;

            if (isFutureDate) {
                // FUTURE DATE: Save as scheduled - NO balance change
                await handleAddScheduledTransaction(amountValue, userId);
                await loadScheduledTransactions();
                alert(`📅 Scheduled transaction added for ${new Date(transactionForm.date).toLocaleDateString()}\n\nThis will NOT affect your balance until approved.`);
            } else {
                // TODAY/PAST: Add as regular - balance changes NOW
                const newBalance = await handleAddRegularTransaction(amountValue, userId);
                await loadAccountData(account.id);
                alert(`✅ Transaction added successfully!\n\nNew balance: ${formatCurrency(newBalance)}`);
            }
            
            window.dispatchEvent(new CustomEvent('accounts-updated'));
            window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

            resetForm();
            setShowAddModal(false);
            
        } catch (error) {
            console.error('Error adding transaction:', error);
            setTransactionError(error.message || 'An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBackToLanding = () => {
        router.push('/');
    };

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner}></div>
                <p>Loading account details...</p>
            </div>
        );
    }

    if (!account) {
        return (
            <div style={styles.errorContainer}>
                <h2>Account Not Found</h2>
                <Link href="/accounts" style={styles.backLink}>← Back to Accounts</Link>
            </div>
        );
    }

    const filteredCategories = getFilteredCategories();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(transactionForm.date);
    const isFutureDate = selectedDate > today;

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <button onClick={handleBackToLanding} style={styles.backButton}>← Back to Home</button>
                    <div>
                        <h1 style={styles.title}>{account.name}</h1>
                        <div style={styles.accountMeta}>
                            <span style={styles.accountType}>{account.type}</span>
                            {account.institution && <span style={styles.institution}>• {account.institution}</span>}
                        </div>
                    </div>
                </div>
                <div style={styles.headerRight}>
                    <div style={styles.balanceContainer}>
                        <div style={styles.balanceLabel}>Current Balance</div>
                        <div style={{ ...styles.balance, color: account.balance >= 0 ? '#4ADE80' : '#F87171' }}>
                            {formatCurrency(account.balance)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Scheduled Transactions Section */}
            {scheduledTransactions.length > 0 && (
                <div style={styles.scheduledSection}>
                    <div 
                        style={styles.scheduledHeader} 
                        onClick={() => setShowScheduledSection(!showScheduledSection)}
                    >
                        <span style={styles.scheduledHeaderLeft}>
                            <span style={styles.scheduledIcon}>📅</span>
                            <span style={styles.scheduledTitle}>Scheduled Transactions</span>
                            <span style={styles.scheduledCount}>({scheduledTransactions.length})</span>
                        </span>
                        <span style={styles.scheduledToggle}>{showScheduledSection ? '▼' : '▶'}</span>
                    </div>
                    
                    {showScheduledSection && (
                        <div style={styles.scheduledList}>
                            {scheduledTransactions.map(tx => {
                                const category = categories.find(c => c.id === tx.categoryId);
                                return (
                                    <div key={tx.id} style={styles.scheduledItem}>
                                        <div style={styles.scheduledDate}>
                                            {new Date(tx.date).toLocaleDateString()}
                                        </div>
                                        <div style={styles.scheduledInfo}>
                                            <div style={styles.scheduledPayee}>{tx.payee}</div>
                                            <div style={styles.scheduledCategory}>
                                                {category?.name || 'Uncategorized'}
                                            </div>
                                        </div>
                                        <div style={{
                                            ...styles.scheduledAmount,
                                            color: tx.transactionType === 'outflow' ? '#F87171' : '#4ADE80'
                                        }}>
                                            {tx.transactionType === 'outflow' ? '-' : '+'}{formatCurrency(tx.amount)}
                                        </div>
                                        <div style={styles.scheduledActions}>
                                            <button 
                                                onClick={() => handleApproveScheduled(tx)} 
                                                style={styles.approveButton}
                                                disabled={refreshing}
                                            >
                                                ✅ Approve
                                            </button>
                                            <button 
                                                onClick={() => handleRejectScheduled(tx)} 
                                                style={styles.rejectButton}
                                                disabled={refreshing}
                                            >
                                                ❌ Reject
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Add Transaction Button */}
            <div style={styles.transactionsHeader}>
                <h2 style={styles.transactionsTitle}>Transactions</h2>
                <button onClick={() => setShowAddModal(true)} style={styles.addTransactionButton}>
                    <span style={styles.buttonIcon}>+</span> Add Transaction
                </button>
            </div>

            {/* Transaction List */}
            <div style={styles.transactionsList}>
                {transactions.length === 0 ? (
                    <div style={styles.emptyTransactions}>
                        No transactions yet. Click <button 
                            onClick={() => setShowAddModal(true)} 
                            style={styles.emptyAddButton}
                        >+ Add Your First Transaction</button> to get started.
                    </div>
                ) : (
                    transactions.map(transaction => {
                        const category = categories.find(c => c.id === transaction.category_id);
                        return (
                            <div key={transaction.id} style={styles.transactionRow}>
                                <div style={styles.transactionDate}>{new Date(transaction.date).toLocaleDateString()}</div>
                                <div style={styles.transactionPayee}>{transaction.payee}</div>
                                <div style={styles.transactionCategory}>{category?.name || (transaction.category_id === null ? 'Ready to Assign' : 'Uncategorized')}</div>
                                <div style={{ ...styles.transactionAmount, color: transaction.amount < 0 ? '#F87171' : '#4ADE80' }}>
                                    {formatCurrency(transaction.amount)}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Add Transaction Modal */}
            {showAddModal && (
                <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
                    <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div style={styles.modalHeader}>
                            <h3 style={styles.modalTitle}>Add Transaction</h3>
                            <button style={styles.closeButton} onClick={() => setShowAddModal(false)}>✕</button>
                        </div>

                        <div style={styles.modalBody}>
                            {/* Account Display */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Account</label>
                                <div style={styles.accountDisplay}>
                                    {account.name} ({account.type}) - Balance: {formatCurrency(account.balance)}
                                </div>
                            </div>

                            {/* Transaction Type Dropdown */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Transaction Type *</label>
                                <select
                                    value={transactionForm.transactionType}
                                    onChange={(e) => {
                                        setTransactionForm({
                                            ...transactionForm,
                                            transactionType: e.target.value,
                                            categoryId: ''
                                        });
                                    }}
                                    style={styles.select}
                                >
                                    <option value="outflow">Outflow (Expense)</option>
                                    <option value="inflow">Inflow (Income/Payment)</option>
                                </select>
                            </div>

                            {/* Category Dropdown */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Category *</label>
                                <select
                                    value={transactionForm.categoryId}
                                    onChange={(e) => setTransactionForm({ ...transactionForm, categoryId: e.target.value })}
                                    style={styles.select}
                                >
                                    <option value="">Select a category</option>
                                    {filteredCategories.map(category => (
                                        <option key={category.id} value={category.id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Amount */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Amount *</label>
                                <div style={styles.inputWrapper}>
                                    <span style={styles.currencySymbol}>$</span>
                                    <input
                                        type="number"
                                        value={transactionForm.amount}
                                        onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                                        style={styles.modalInput}
                                        placeholder="0.00"
                                        step="0.01"
                                        min="0"
                                    />
                                </div>
                            </div>

                            {/* Date */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Date *</label>
                                <input
                                    type="date"
                                    value={transactionForm.date}
                                    onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
                                    style={styles.input}
                                />
                                {isFutureDate && (
                                    <div style={styles.futureDateWarning}>
                                        📅 Future date detected. This will be saved as a <strong>scheduled transaction</strong> and will NOT affect your balance until approved on {new Date(transactionForm.date).toLocaleDateString()}.
                                    </div>
                                )}
                            </div>

                            {/* Payee */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Payee *</label>
                                <input
                                    type="text"
                                    value={transactionForm.payee}
                                    onChange={(e) => setTransactionForm({ ...transactionForm, payee: e.target.value })}
                                    style={styles.input}
                                    placeholder="e.g., Starbucks, Rent, Paycheck"
                                />
                            </div>

                            {/* Memo */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Memo (Optional)</label>
                                <input
                                    type="text"
                                    value={transactionForm.memo}
                                    onChange={(e) => setTransactionForm({ ...transactionForm, memo: e.target.value })}
                                    style={styles.input}
                                    placeholder="Additional notes"
                                />
                            </div>

                            {/* Cleared Checkbox - only for non-future dates */}
                            {!isFutureDate && (
                                <div style={styles.checkboxGroup}>
                                    <label style={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={transactionForm.cleared}
                                            onChange={(e) => setTransactionForm({ ...transactionForm, cleared: e.target.checked })}
                                            style={styles.checkbox}
                                        />
                                        Mark as cleared
                                    </label>
                                </div>
                            )}

                            {/* Balance Preview - only for non-future dates */}
                            {!isFutureDate && transactionForm.amount && parseFloat(transactionForm.amount) > 0 && (
                                <div style={styles.balancePreview}>
                                    <div style={styles.balancePreviewLabel}>New Balance after transaction:</div>
                                    <div style={{
                                        ...styles.balancePreviewValue,
                                        color: transactionForm.transactionType === 'outflow' ? '#F87171' : '#4ADE80'
                                    }}>
                                        {formatCurrency(account.balance + calculateBalanceChange(
                                            account.type,
                                            transactionForm.transactionType,
                                            parseFloat(transactionForm.amount) || 0
                                        ))}
                                    </div>
                                </div>
                            )}

                            {transactionError && <div style={styles.errorMessage}>⚠️ {transactionError}</div>}
                        </div>

                        <div style={styles.modalFooter}>
                            <button style={styles.cancelModalButton} onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button style={styles.submitButton} onClick={handleAddTransaction} disabled={isSubmitting}>
                                {isSubmitting ? 'Adding...' : (isFutureDate ? '📅 Schedule Transaction' : 'Add Transaction')}
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
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
        color: 'white',
        padding: '2rem'
    },
    header: {
        maxWidth: '1200px',
        margin: '0 auto 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '2rem'
    },
    headerRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '2rem'
    },
    backButton: {
        color: '#9CA3AF',
        fontSize: '1rem',
        padding: '0.5rem 1rem',
        background: '#1F2937',
        borderRadius: '0.5rem',
        border: '1px solid #374151',
        cursor: 'pointer'
    },
    title: {
        fontSize: '2rem',
        fontWeight: 'bold',
        marginBottom: '0.5rem',
        color: 'white'
    },
    accountMeta: {
        display: 'flex',
        gap: '0.5rem',
        color: '#9CA3AF',
        fontSize: '0.875rem'
    },
    accountType: {
        textTransform: 'capitalize'
    },
    institution: {
        color: '#6B7280'
    },
    balanceContainer: {
        textAlign: 'right'
    },
    balanceLabel: {
        fontSize: '0.875rem',
        color: '#9CA3AF',
        marginBottom: '0.25rem'
    },
    balance: {
        fontSize: '2rem',
        fontWeight: 'bold'
    },
    // Scheduled Transactions Styles
    scheduledSection: {
        maxWidth: '1200px',
        margin: '0 auto 2rem',
        background: '#1F2937',
        borderRadius: '0.75rem',
        border: '1px solid #374151',
        overflow: 'hidden',
    },
    scheduledHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 1.5rem',
        background: '#111827',
        cursor: 'pointer',
        borderBottom: '1px solid #374151',
    },
    scheduledHeaderLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    scheduledIcon: {
        fontSize: '1.25rem',
    },
    scheduledTitle: {
        fontSize: '1rem',
        fontWeight: '600',
        color: '#F59E0B',
    },
    scheduledCount: {
        fontSize: '0.875rem',
        color: '#9CA3AF',
    },
    scheduledToggle: {
        fontSize: '0.75rem',
        color: '#9CA3AF',
    },
    scheduledList: {
        padding: '0.5rem',
    },
    scheduledItem: {
        display: 'flex',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid #374151',
        gap: '1rem',
        ':last-child': {
            borderBottom: 'none',
        },
    },
    scheduledDate: {
        width: '90px',
        fontSize: '0.75rem',
        color: '#9CA3AF',
    },
    scheduledInfo: {
        flex: 2,
    },
    scheduledPayee: {
        fontSize: '0.875rem',
        color: 'white',
        fontWeight: '500',
    },
    scheduledCategory: {
        fontSize: '0.7rem',
        color: '#6B7280',
    },
    scheduledAmount: {
        fontSize: '0.875rem',
        fontWeight: '600',
        minWidth: '80px',
        textAlign: 'right',
    },
    scheduledActions: {
        display: 'flex',
        gap: '0.5rem',
    },
    approveButton: {
        padding: '0.25rem 0.75rem',
        background: '#10B981',
        color: 'white',
        border: 'none',
        borderRadius: '0.375rem',
        fontSize: '0.7rem',
        cursor: 'pointer',
        ':disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
        },
    },
    rejectButton: {
        padding: '0.25rem 0.75rem',
        background: '#EF4444',
        color: 'white',
        border: 'none',
        borderRadius: '0.375rem',
        fontSize: '0.7rem',
        cursor: 'pointer',
        ':disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
        },
    },
    transactionsHeader: {
        maxWidth: '1200px',
        margin: '0 auto 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    transactionsTitle: {
        fontSize: '1.5rem',
        fontWeight: '600',
        color: 'white',
        margin: 0
    },
    addTransactionButton: {
        background: '#10B981',
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
    buttonIcon: {
        fontSize: '1.2rem',
        fontWeight: 'bold'
    },
    transactionsList: {
        maxWidth: '1200px',
        margin: '0 auto',
        background: '#1F2937',
        borderRadius: '0.75rem',
        overflow: 'hidden'
    },
    transactionRow: {
        display: 'flex',
        alignItems: 'center',
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #374151',
        gap: '1rem'
    },
    transactionDate: {
        width: '100px',
        color: '#9CA3AF',
        fontSize: '0.875rem'
    },
    transactionPayee: {
        flex: 2,
        color: 'white',
        fontWeight: '500'
    },
    transactionCategory: {
        flex: 1,
        color: '#9CA3AF',
        fontSize: '0.875rem'
    },
    transactionAmount: {
        width: '120px',
        textAlign: 'right',
        fontWeight: '600'
    },
    emptyTransactions: {
        padding: '3rem',
        textAlign: 'center',
        color: '#6B7280'
    },
    emptyAddButton: {
        background: '#10B981',
        color: 'white',
        border: 'none',
        padding: '0.5rem 1rem',
        borderRadius: '0.5rem',
        cursor: 'pointer',
        marginLeft: '0.5rem',
        marginRight: '0.5rem'
    },
    modalOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        backdropFilter: 'blur(4px)'
    },
    modalContent: {
        background: '#1F2937',
        borderRadius: '1rem',
        width: '90%',
        maxWidth: '500px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
    },
    modalHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.5rem',
        borderBottom: '1px solid #374151'
    },
    modalTitle: {
        fontSize: '1.25rem',
        fontWeight: '600',
        color: 'white',
        margin: 0
    },
    closeButton: {
        background: 'none',
        border: 'none',
        color: '#9CA3AF',
        fontSize: '1.25rem',
        cursor: 'pointer',
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem'
    },
    modalBody: {
        padding: '1.5rem',
        overflowY: 'auto',
        flex: 1
    },
    modalFooter: {
        display: 'flex',
        gap: '1rem',
        padding: '1.5rem',
        borderTop: '1px solid #374151'
    },
    formGroup: {
        marginBottom: '1rem'
    },
    label: {
        display: 'block',
        marginBottom: '0.5rem',
        color: '#9CA3AF',
        fontSize: '0.875rem',
        fontWeight: '500'
    },
    accountDisplay: {
        padding: '0.75rem',
        background: '#111827',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '0.875rem'
    },
    input: {
        width: '100%',
        padding: '0.75rem',
        background: '#111827',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '0.875rem'
    },
    select: {
        width: '100%',
        padding: '0.75rem',
        background: '#111827',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '0.875rem',
        cursor: 'pointer'
    },
    futureDateWarning: {
        marginTop: '0.5rem',
        padding: '0.5rem',
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid #F59E0B',
        borderRadius: '0.25rem',
        fontSize: '0.7rem',
        color: '#F59E0B',
    },
    hint: {
        display: 'block',
        marginTop: '0.25rem',
        fontSize: '0.7rem',
        color: '#F87171'
    },
    inputWrapper: {
        position: 'relative'
    },
    currencySymbol: {
        position: 'absolute',
        left: '0.75rem',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#9CA3AF',
        zIndex: 1
    },
    modalInput: {
        width: '100%',
        padding: '0.75rem 0.75rem 0.75rem 2rem',
        background: '#111827',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '0.875rem'
    },
    checkboxGroup: {
        marginTop: '0.5rem'
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        color: '#9CA3AF',
        fontSize: '0.875rem',
        cursor: 'pointer'
    },
    checkbox: {
        width: '1rem',
        height: '1rem',
        cursor: 'pointer'
    },
    balancePreview: {
        marginTop: '1rem',
        padding: '0.75rem',
        background: '#111827',
        borderRadius: '0.5rem',
        border: '1px solid #374151',
        textAlign: 'center'
    },
    balancePreviewLabel: {
        fontSize: '0.75rem',
        color: '#9CA3AF',
        marginBottom: '0.25rem'
    },
    balancePreviewValue: {
        fontSize: '1.25rem',
        fontWeight: 'bold'
    },
    errorMessage: {
        marginTop: '0.75rem',
        padding: '0.5rem',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid #EF4444',
        borderRadius: '0.25rem',
        color: '#F87171',
        fontSize: '0.75rem',
        textAlign: 'center'
    },
    cancelModalButton: {
        flex: 1,
        padding: '0.75rem',
        background: '#4B5563',
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: '500',
        cursor: 'pointer'
    },
    submitButton: {
        flex: 1,
        padding: '0.75rem',
        background: 'linear-gradient(135deg, #10B981, #059669)',
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: '600',
        cursor: 'pointer'
    },
    loadingContainer: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white'
    },
    loadingSpinner: {
        width: '48px',
        height: '48px',
        border: '4px solid #3B82F6',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '1rem'
    },
    errorContainer: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        textAlign: 'center'
    },
    backLink: {
        marginTop: '1rem',
        color: '#3B82F6',
        textDecoration: 'none'
    }
};

export default AccountDetailPage;