// src/pages/accounts/[id].jsx
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import TransactionManager from '../../components/TransactionManager';

const AccountDetailPage = () => {
    const router = useRouter();
    const { id } = router.query;
    const [account, setAccount] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [transactionForm, setTransactionForm] = useState({
        date: new Date().toISOString().split('T')[0],
        payee: '',
        amount: '',
        type: 'outflow',
        categoryId: '',
        memo: '',
        cleared: false
    });

    useEffect(() => {
        if (id) {
            loadAccountData();
        }
    }, [id]);

    const loadAccountData = async () => {
        setLoading(true);
        try {
            // Get account details
            const accountResult = await window.electronAPI.getAccountById(id, 2);
            if (accountResult.success) {
                setAccount(accountResult.data);
            }

            // Get transactions for this account
            const transactionsResult = await window.electronAPI.getAccountTransactions(id);
            if (transactionsResult.success) {
                setTransactions(transactionsResult.data);
            }

            // Get categories
            const categoriesResult = await window.electronAPI.getCategories(1);
            if (categoriesResult.success) {
                setCategories(categoriesResult.data);
            }

            // Get all accounts for transfer options
            const accountsResult = await window.electronAPI.getAccounts();
            if (accountsResult.success) {
                setAccounts(accountsResult.data);
            }
        } catch (error) {
            console.error('Error loading account data:', error);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setTransactionForm({
            date: new Date().toISOString().split('T')[0],
            payee: '',
            amount: '',
            type: 'outflow',
            categoryId: '',
            memo: '',
            cleared: false
        });
    };

    const handleAddTransaction = async () => {
        try {
            if (!account) {
                alert('Account not found');
                return;
            }

            // Validate amount
            const amountValue = parseFloat(transactionForm.amount);
            if (isNaN(amountValue) || amountValue === 0) {
                alert('Please enter a valid amount');
                return;
            }

            // Calculate amount based on type (inflow/outflow)
            const amount = transactionForm.type === 'outflow' 
                ? -Math.abs(amountValue) 
                : Math.abs(amountValue);

            const transactionData = {
                accountId: account.id,
                date: transactionForm.date,
                payee: transactionForm.payee,
                description: transactionForm.payee,
                amount: amount,
                categoryId: transactionForm.categoryId || null,
                memo: transactionForm.memo,
                cleared: transactionForm.cleared ? 1 : 0
            };

            console.log('📝 Adding transaction:', transactionData);
            
            const result = await window.electronAPI.addTransaction(transactionData);
            if (result.success) {
                setShowAddModal(false);
                resetForm();
                await loadAccountData(); // Refresh data
                alert('✅ Transaction added successfully');
            } else {
                alert('❌ Error adding transaction: ' + result.error);
            }
        } catch (error) {
            console.error('Error adding transaction:', error);
            alert('❌ Error adding transaction: ' + error.message);
        }
    };

    const handleUpdateTransaction = async (transactionId, updates) => {
        try {
            const result = await window.electronAPI.updateTransaction(transactionId, updates);
            if (result.success) {
                await loadAccountData();
                return { success: true };
            }
            return { success: false, error: result.error };
        } catch (error) {
            console.error('Error updating transaction:', error);
            return { success: false, error: error.message };
        }
    };

    const handleDeleteTransaction = async (transactionId) => {
        try {
            const result = await window.electronAPI.deleteTransaction(transactionId);
            if (result.success) {
                await loadAccountData();
                return { success: true };
            }
            return { success: false, error: result.error };
        } catch (error) {
            console.error('Error deleting transaction:', error);
            return { success: false, error: error.message };
        }
    };

    const handleToggleCleared = async (transactionId, clearedStatus) => {
        try {
            const result = await window.electronAPI.toggleTransactionCleared(transactionId, clearedStatus);
            if (result.success) {
                await loadAccountData();
                return { success: true };
            }
            return { success: false, error: result.error };
        } catch (error) {
            console.error('Error toggling cleared status:', error);
            return { success: false, error: error.message };
        }
    };

    const handleReconcile = () => {
        router.push(`/accounts/${id}/reconcile`);
    };

    const handleBackToLanding = () => {
        try {
            router.push('/');
        } catch (error) {
            console.log('Router failed, using fallback:', error);
            window.location.href = '/accounts';
        }
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
                <p>The account you're looking for doesn't exist.</p>
                <Link href="/accounts" style={styles.backLink}>
                    ← Back to Accounts
                </Link>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Header with Account Info and Actions */}
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <button
                        onClick={handleBackToLanding}
                        style={styles.backButton}
                    >
                        ← Back to Home
                    </button>
                    <div>
                        <h1 style={styles.title}>{account.name}</h1>
                        <div style={styles.accountMeta}>
                            <span style={styles.accountType}>{account.type}</span>
                            {account.institution && (
                                <span style={styles.institution}>• {account.institution}</span>
                            )}
                        </div>
                    </div>
                </div>

                <div style={styles.headerRight}>
                    <div style={styles.balanceContainer}>
                        <div style={styles.balanceLabel}>Current Balance</div>
                        <div style={{
                            ...styles.balance,
                            color: account.balance >= 0 ? '#4ADE80' : '#F87171'
                        }}>
                            {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD'
                            }).format(account.balance)}
                        </div>
                    </div>
                    <button onClick={handleReconcile} style={styles.reconcileButton}>
                        🔄 Reconcile
                    </button>
                </div>
            </div>

            {/* Add Transaction Button */}
            <div style={styles.transactionsHeader}>
                <h2 style={styles.transactionsTitle}>Transactions</h2>
                <button 
                    onClick={() => setShowAddModal(true)}
                    style={styles.addTransactionButton}
                >
                    <span style={styles.buttonIcon}>+</span> Add Transaction
                </button>
            </div>

            {/* Add Transaction Modal */}
            {showAddModal && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <h2 style={styles.modalTitle}>Add Transaction</h2>
                        
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Date</label>
                            <input
                                type="date"
                                value={transactionForm.date}
                                onChange={(e) => setTransactionForm({...transactionForm, date: e.target.value})}
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Payee</label>
                            <input
                                type="text"
                                value={transactionForm.payee}
                                onChange={(e) => setTransactionForm({...transactionForm, payee: e.target.value})}
                                style={styles.input}
                                placeholder="e.g., Grocery Store"
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Amount</label>
                            <input
                                type="number"
                                value={transactionForm.amount}
                                onChange={(e) => setTransactionForm({...transactionForm, amount: e.target.value})}
                                style={styles.input}
                                placeholder="0.00"
                                step="0.01"
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Type</label>
                            <select
                                value={transactionForm.type}
                                onChange={(e) => setTransactionForm({...transactionForm, type: e.target.value})}
                                style={styles.select}
                            >
                                <option value="outflow">Outflow (Money Out)</option>
                                <option value="inflow">Inflow (Money In)</option>
                            </select>
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Category</label>
                            <select
                                value={transactionForm.categoryId}
                                onChange={(e) => setTransactionForm({...transactionForm, categoryId: e.target.value})}
                                style={styles.select}
                            >
                                <option value="">Select Category</option>
                                {categories.map(category => (
                                    <option key={category.id} value={category.id}>
                                        {category.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Memo (Optional)</label>
                            <input
                                type="text"
                                value={transactionForm.memo}
                                onChange={(e) => setTransactionForm({...transactionForm, memo: e.target.value})}
                                style={styles.input}
                                placeholder="Additional notes"
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={transactionForm.cleared}
                                    onChange={(e) => setTransactionForm({...transactionForm, cleared: e.target.checked})}
                                />
                                <span style={{ marginLeft: '0.5rem' }}>Cleared</span>
                            </label>
                        </div>

                        <div style={styles.modalActions}>
                            <button onClick={handleAddTransaction} style={styles.saveButton}>
                                Save Transaction
                            </button>
                            <button onClick={() => setShowAddModal(false)} style={styles.cancelButton}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Transaction Manager */}
            <TransactionManager
                transactions={transactions}
                categories={categories}
                accounts={accounts}
                onAddTransaction={handleAddTransaction}
                onUpdateTransaction={handleUpdateTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onToggleCleared={handleToggleCleared}
                accountId={id}
            />
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
        textDecoration: 'none',
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
    reconcileButton: {
        padding: '0.75rem 1.5rem',
        background: '#3B82F6',
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '1rem',
        fontWeight: '500',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
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
        maxWidth: '500px',
        maxHeight: '90vh',
        overflowY: 'auto'
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
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        color: '#9CA3AF',
        cursor: 'pointer'
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
        background: '#10B981',
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