// src/pages/mobile-account/[id].jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import AddTransactionModal from '../../components/mobile/AddTransactionModal';
// Add this import at the top
import TransferModal from '../../components/mobile/TransferModal';


export default function MobileAccountDetails() {
    const router = useRouter();
    const { id } = router.query;
    const { user } = useAuth();

    const [account, setAccount] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dateRange, setDateRange] = useState('30days'); // '7days', '30days', '3months', 'all'
    const [showAddModal, setShowAddModal] = useState(false);

    // Add this state near your other useState declarations
    const [showTransferModal, setShowTransferModal] = useState(false);

    useEffect(() => {
        if (id) {
            loadAccountData();
        }
    }, [id]);

    const loadAccountData = async () => {
        setIsLoading(true);
        try {
            // Load account details
           const accountsResult = await DatabaseProxy.getAccounts(user?.id);
            if (accountResult?.success) {
                setAccount(accountResult.data);
            }

            // Load transactions for this account
       const transactionsResult = await DatabaseProxy.getTransactions(user?.id);
            if (transactionsResult?.success) {
                setTransactions(transactionsResult.data || []);
            }

            // Load categories for transaction modal
const categoriesResult = await DatabaseProxy.getCategories(user?.id);
            if (categoriesResult?.success) {
                setCategories(categoriesResult.data || []);
            }
        } catch (error) {
            console.error('Error loading account data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddTransaction = async (transactionData) => {
        try {
            const result = await window.electronAPI?.addTransaction({
                ...transactionData,
                accountId: id
            });
            if (result?.success) {
                await loadAccountData();
            }
        } catch (error) {
            console.error('Error adding transaction:', error);
            throw error;
        }
    };

    const handleTransfer = async (outflowTransaction, inflowTransaction) => {
        try {
            // Add both transactions
            await window.electronAPI?.addTransaction(outflowTransaction);
            await window.electronAPI?.addTransaction(inflowTransaction);

            // Refresh account data
            await loadAccountData();
            alert('Transfer completed successfully!');
        } catch (error) {
            console.error('Error processing transfer:', error);
            throw error;
        }
    }

    const handleDeleteTransaction = async (transactionId) => {
        if (!confirm('Are you sure you want to delete this transaction?')) return;

        try {
            const result = await window.electronAPI?.deleteTransaction(transactionId);
            if (result?.success) {
                await loadAccountData();
            }
        } catch (error) {
            console.error('Error deleting transaction:', error);
        }
    };

    const filterTransactionsByDate = () => {
        const now = new Date();
        const cutoff = new Date();

        switch (dateRange) {
            case '7days':
                cutoff.setDate(now.getDate() - 7);
                break;
            case '30days':
                cutoff.setDate(now.getDate() - 30);
                break;
            case '3months':
                cutoff.setMonth(now.getMonth() - 3);
                break;
            default:
                return transactions;
        }

        return transactions.filter(t => new Date(t.date) >= cutoff);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount);
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
            });
        }
    };

    const filteredTransactions = filterTransactionsByDate();
    const isCreditCard = account?.type === 'credit';
    const availableCredit = isCreditCard ? (account?.limit || 0) - Math.abs(account?.balance || 0) : 0;

    if (isLoading || !account) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.spinner}></div>
                <p style={styles.loadingText}>Loading account details...</p>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <button onClick={() => router.back()} style={styles.backButton}>
                    ←
                </button>
                <div style={styles.headerTitle}>
                    <h1 style={styles.accountName}>{account.name}</h1>
                    <p style={styles.accountType}>
                        {account.type === 'checking' ? '🏦 Checking' :
                            account.type === 'savings' ? '💰 Savings' :
                                account.type === 'credit' ? '💳 Credit Card' :
                                    account.type === 'investment' ? '📈 Investment' :
                                        account.type === 'loan' ? '🏦 Loan' : '📊 Account'}
                    </p>
                </div>
                <button style={styles.menuButton}>⋮</button>
        {/* // Update the Transfer button to open the modal */}
                <button
                    style={styles.actionButton}
                    onClick={() => setShowTransferModal(true)}
                >
                    <span style={styles.actionIcon}>🔄</span>
                    <span>Transfer</span>
                </button>

{/* // Add the modal component before the bottom nav */}
                <TransferModal
                    isVisible={showTransferModal}
                    onClose={() => setShowTransferModal(false)}
                    onTransfer={handleTransfer}
                    accounts={accounts}
                />
            </div>

            {/* Balance Card */}
            <div style={styles.balanceCard}>
                <p style={styles.balanceLabel}>Current Balance</p>
                <h2 style={{
                    ...styles.balanceAmount,
                    color: account.balance >= 0 ? '#4ADE80' : '#F87171'
                }}>
                    {formatCurrency(account.balance)}
                </h2>

                {isCreditCard && (
                    <div style={styles.creditDetails}>
                        <div style={styles.creditRow}>
                            <span>Credit Limit</span>
                            <span>{formatCurrency(account.limit || 0)}</span>
                        </div>
                        <div style={styles.creditRow}>
                            <span>Available Credit</span>
                            <span style={{ color: availableCredit > 0 ? '#4ADE80' : '#F87171' }}>
                                {formatCurrency(availableCredit)}
                            </span>
                        </div>
                        {account.apr && (
                            <div style={styles.creditRow}>
                                <span>APR</span>
                                <span>{account.apr}%</span>
                            </div>
                        )}
                        {account.dueDate && (
                            <div style={styles.dueDateBadge}>
                                Due: {new Date(account.dueDate).toLocaleDateString()}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div style={styles.quickActions}>
                <button
                    style={styles.actionButton}
                    onClick={() => setShowAddModal(true)}
                >
                    <span style={styles.actionIcon}>➕</span>
                    <span>Add</span>
                </button>
                <button style={styles.actionButton}>
                    <span style={styles.actionIcon}>🔄</span>
                    <span>Transfer</span>
                </button>
                <button style={styles.actionButton}>
                    <span style={styles.actionIcon}>📊</span>
                    <span>Analyze</span>
                </button>
            </div>

            {/* Date Filter */}
            <div style={styles.filterBar}>
                <button
                    style={{
                        ...styles.filterButton,
                        ...(dateRange === '7days' ? styles.activeFilter : {})
                    }}
                    onClick={() => setDateRange('7days')}
                >
                    7D
                </button>
                <button
                    style={{
                        ...styles.filterButton,
                        ...(dateRange === '30days' ? styles.activeFilter : {})
                    }}
                    onClick={() => setDateRange('30days')}
                >
                    30D
                </button>
                <button
                    style={{
                        ...styles.filterButton,
                        ...(dateRange === '3months' ? styles.activeFilter : {})
                    }}
                    onClick={() => setDateRange('3months')}
                >
                    3M
                </button>
                <button
                    style={{
                        ...styles.filterButton,
                        ...(dateRange === 'all' ? styles.activeFilter : {})
                    }}
                    onClick={() => setDateRange('all')}
                >
                    All
                </button>
            </div>

            {/* Transactions List */}
            <div style={styles.transactionsSection}>
                <h3 style={styles.sectionTitle}>Transactions</h3>

                {filteredTransactions.length === 0 ? (
                    <div style={styles.emptyState}>
                        <p style={styles.emptyText}>No transactions in this period</p>
                        <button
                            style={styles.emptyAddButton}
                            onClick={() => setShowAddModal(true)}
                        >
                            + Add Transaction
                        </button>
                    </div>
                ) : (
                    <div style={styles.transactionsList}>
                        {filteredTransactions.map((tx) => (
                            <div key={tx.id} style={styles.transactionItem}>
                                <div style={styles.transactionLeft}>
                                    <div style={styles.transactionIcon}>
                                        {tx.amount > 0 ? '📥' : '📤'}
                                    </div>
                                    <div>
                                        <p style={styles.transactionDescription}>
                                            {tx.description || 'Transaction'}
                                        </p>
                                        <p style={styles.transactionMeta}>
                                            {formatDate(tx.date)}
                                            {tx.category && ` • ${tx.category}`}
                                        </p>
                                    </div>
                                </div>
                                <div style={styles.transactionRight}>
                                    <p style={{
                                        ...styles.transactionAmount,
                                        color: tx.amount > 0 ? '#4ADE80' : '#F87171'
                                    }}>
                                        {tx.amount > 0 ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                                    </p>
                                    <button
                                        onClick={() => handleDeleteTransaction(tx.id)}
                                        style={styles.deleteButton}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Navigation */}
            <div style={styles.bottomNav}>
                <button style={styles.navItem} onClick={() => router.push('/mobile-home')}>
                    <span style={styles.navIcon}>🏠</span>
                    <span style={styles.navLabel}>Home</span>
                </button>
                <button style={styles.navItem} onClick={() => router.push('/mobile-budget')}>
                    <span style={styles.navIcon}>📊</span>
                    <span style={styles.navLabel}>Budget</span>
                </button>
                <button style={styles.navItem}>
                    <span style={styles.navIcon}>➕</span>
                    <span style={styles.navLabel}>Add</span>
                </button>
                <button style={styles.navItem}>
                    <span style={styles.navIcon}>📈</span>
                    <span style={styles.navLabel}>Reports</span>
                </button>
                <button style={styles.navItem}>
                    <span style={styles.navIcon}>⚙️</span>
                    <span style={styles.navLabel}>Settings</span>
                </button>
            </div>

            {/* Add Transaction Modal */}
            <AddTransactionModal
                isVisible={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSave={handleAddTransaction}
                accounts={[account]}
                categories={categories}
            />
        </div>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        background: '#0f2e1c',
        color: 'white',
        paddingBottom: '80px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    loadingContainer: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f2e1c',
        color: 'white',
    },
    spinner: {
        width: '48px',
        height: '48px',
        border: '4px solid rgba(255,255,255,0.1)',
        borderTopColor: '#3B82F6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '16px',
    },
    loadingText: {
        fontSize: '16px',
        color: '#9CA3AF',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px',
        paddingTop: '60px',
        background: '#0047AB',
    },
    backButton: {
        width: '40px',
        height: '40px',
        borderRadius: '20px',
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        color: 'white',
        fontSize: '20px',
        cursor: 'pointer',
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
    },
    accountName: {
        fontSize: '18px',
        fontWeight: '600',
        margin: '0 0 4px 0',
    },
    accountType: {
        fontSize: '12px',
        color: '#9CA3AF',
        margin: 0,
    },
    menuButton: {
        width: '40px',
        height: '40px',
        borderRadius: '20px',
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        color: 'white',
        fontSize: '20px',
        cursor: 'pointer',
    },
    balanceCard: {
        margin: '20px',
        padding: '24px',
        background: '#1F2937',
        borderRadius: '24px',
        border: '1px solid #374151',
    },
    balanceLabel: {
        fontSize: '14px',
        color: '#9CA3AF',
        margin: '0 0 8px 0',
    },
    balanceAmount: {
        fontSize: '36px',
        fontWeight: 'bold',
        margin: '0 0 16px 0',
    },
    creditDetails: {
        borderTop: '1px solid #374151',
        paddingTop: '16px',
        marginTop: '8px',
    },
    creditRow: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '8px',
        fontSize: '14px',
        color: '#9CA3AF',
    },
    dueDateBadge: {
        marginTop: '12px',
        padding: '8px',
        background: '#F59E0B20',
        color: '#F59E0B',
        borderRadius: '8px',
        textAlign: 'center',
        fontSize: '14px',
    },
    quickActions: {
        display: 'flex',
        gap: '12px',
        padding: '0 20px',
        marginBottom: '24px',
    },
    actionButton: {
        flex: 1,
        padding: '12px',
        background: '#1F2937',
        border: '1px solid #374151',
        borderRadius: '12px',
        color: 'white',
        fontSize: '14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        cursor: 'pointer',
    },
    actionIcon: {
        fontSize: '20px',
    },
    filterBar: {
        display: 'flex',
        gap: '8px',
        padding: '0 20px',
        marginBottom: '20px',
    },
    filterButton: {
        flex: 1,
        padding: '8px',
        background: '#1F2937',
        border: '1px solid #374151',
        borderRadius: '20px',
        color: '#9CA3AF',
        fontSize: '14px',
        cursor: 'pointer',
    },
    activeFilter: {
        background: '#3B82F6',
        color: 'white',
        borderColor: '#3B82F6',
    },
    transactionsSection: {
        padding: '0 20px',
    },
    sectionTitle: {
        fontSize: '18px',
        fontWeight: '600',
        margin: '0 0 16px 0',
    },
    transactionsList: {
        background: '#1F2937',
        borderRadius: '16px',
        overflow: 'hidden',
    },
    transactionItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px',
        borderBottom: '1px solid #374151',
        ':last-child': {
            borderBottom: 'none',
        },
    },
    transactionLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flex: 1,
    },
    transactionIcon: {
        width: '40px',
        height: '40px',
        borderRadius: '20px',
        background: '#374151',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
    },
    transactionDescription: {
        fontSize: '16px',
        fontWeight: '500',
        margin: '0 0 4px 0',
    },
    transactionMeta: {
        fontSize: '12px',
        color: '#9CA3AF',
        margin: 0,
    },
    transactionRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    transactionAmount: {
        fontSize: '16px',
        fontWeight: '600',
        margin: 0,
    },
    deleteButton: {
        width: '32px',
        height: '32px',
        borderRadius: '16px',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid #EF4444',
        color: '#EF4444',
        fontSize: '14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: {
        padding: '40px',
        textAlign: 'center',
        background: '#1F2937',
        borderRadius: '16px',
    },
    emptyText: {
        fontSize: '16px',
        color: '#9CA3AF',
        marginBottom: '16px',
    },
    emptyAddButton: {
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        fontSize: '16px',
        cursor: 'pointer',
    },
    bottomNav: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        background: '#1F2937',
        padding: '8px 0',
        paddingBottom: '24px',
        borderTop: '1px solid #374151',
    },
    navItem: {
        flex: 1,
        background: 'none',
        border: 'none',
        color: '#9CA3AF',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        cursor: 'pointer',
    },
    navIcon: {
        fontSize: '20px',
    },
    navLabel: {
        fontSize: '10px',
    },
};