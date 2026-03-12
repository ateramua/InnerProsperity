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

    const handleAddTransaction = async (transaction) => {
        try {
            console.log('📝 Adding transaction:', transaction); //
            // Ensure the transaction is linked to this account
            const transactionWithAccount = {
                ...transaction,
                accountId: id
            };
            const result = await window.electronAPI.addTransaction(transactionWithAccount);
            if (result.success) {
                await loadAccountData();
                return { success: true };
            }
            return { success: false, error: result.error };
        } catch (error) {
            console.error('Error adding transaction:', error);
            return { success: false, error: error.message };
        }
    };
    // Safe way to handle navigation
    const handleBackToLanding = () => {
        try {
            // Method 1: Next.js router (fast, but can fail in some cases)
            router.push('/');
        } catch (error) {
            console.log('Router failed, using fallback:', error);

            // Method 2: Window location (always works, but causes page reload)
            window.location.href = '/accounts';
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
        // Open reconciliation modal or navigate to reconcile page
        router.push(`/accounts/${id}/reconcile`);
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

            {/* Transaction Manager */}
            <TransactionManager
                transactions={transactions}
                categories={categories}
                accounts={accounts}
                onAddTransaction={handleAddTransaction}
                onUpdateTransaction={handleUpdateTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onToggleCleared={handleToggleCleared}
                accountId={id} // Pass the account ID to TransactionManager
            />
        </div>
    );
}

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
        border: '1px solid #374151'
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