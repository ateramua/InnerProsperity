// src/pages/accounts/[id]/reconcile.jsx
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function ReconcilePage() {
    const router = useRouter();
    const { id } = router.query;
    const [account, setAccount] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [statementBalance, setStatementBalance] = useState('');
    const [statementDate, setStatementDate] = useState(
        new Date().toISOString().split('T')[0]
    );
    const [selectedTransactions, setSelectedTransactions] = useState([]);
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

            // Get uncleared transactions for this account
            const transactionsResult = await window.electronAPI.getAccountTransactions(id);
            if (transactionsResult.success) {
                // Only show uncleared transactions for reconciliation
                const uncleared = transactionsResult.data.filter(t => t.is_cleared === 0);
                setTransactions(uncleared);
            }
        } catch (error) {
            console.error('Error loading account data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleReconcile = async () => {
        try {
            const statementBal = parseFloat(statementBalance);
            if (isNaN(statementBal)) {
                alert('Please enter a valid statement balance');
                return;
            }

            console.log('📝 Sending reconciliation data:', {
                accountId: id,
                statementBalance: statementBal,
                transactionsToClear: selectedTransactions
            });

            const result = await window.electronAPI.reconcileAccount(
                id,
                statementBal,
                selectedTransactions
            );

            console.log('📝 Reconciliation result:', result);

            if (result.success) {
                alert('✅ Reconciliation completed successfully!');
                // Redirect to home page (accounts list)
                router.push('/accounts');
            } else {
                alert('❌ Error during reconciliation: ' + result.error);
            }
        } catch (error) {
            console.error('Error reconciling:', error);
            alert('❌ Error during reconciliation: ' + error.message);
        }
    };

    const toggleTransaction = (transactionId) => {
        setSelectedTransactions(prev => {
            if (prev.includes(transactionId)) {
                return prev.filter(id => id !== transactionId);
            } else {
                return [...prev, transactionId];
            }
        });
    };
    const handleBack = () => {
        try {
            router.push(`/accounts/${id}`);
        } catch (error) {
            console.error('Navigation error:', error);
            // Fallback to accounts list
            router.push('/accounts');
        }
    };

    const calculateDifference = () => {
        if (!account || !statementBalance) return null;
        const statementBal = parseFloat(statementBalance);
        if (isNaN(statementBal)) return null;
        return account.balance - statementBal;
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner}></div>
                <p>Loading...</p>
            </div>
        );
    }

    if (!account) {
        return (
            <div style={styles.errorContainer}>
                <h2>Account Not Found</h2>
                <Link href="/accounts" style={styles.backButton}>
                    ← Back to Home
                </Link>
            </div>
        );
    }

    const difference = calculateDifference();

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <Link href={`/accounts/${id}`} style={styles.backButton}>
                    ← Back to Account
                </Link>
                <h1 style={styles.title}>Reconcile {account.name}</h1>
            </div>

            <div style={styles.content}>
                {/* Left Column - Reconciliation Form */}
                <div style={styles.formSection}>
                    <div style={styles.card}>
                        <h2 style={styles.sectionTitle}>Statement Details</h2>

                        <div style={styles.balanceBox}>
                            <div style={styles.balanceRow}>
                                <span style={styles.balanceLabel}>Your current balance:</span>
                                <span style={styles.balanceValue}>
                                    {formatCurrency(account.balance)}
                                </span>
                            </div>
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Statement Date</label>
                            <input
                                type="date"
                                value={statementDate}
                                onChange={(e) => setStatementDate(e.target.value)}
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Statement Balance</label>
                            <input
                                type="number"
                                value={statementBalance}
                                onChange={(e) => setStatementBalance(e.target.value)}
                                style={styles.input}
                                placeholder="0.00"
                                step="0.01"
                            />
                        </div>

                        {difference !== null && (
                            <div style={{
                                ...styles.differenceBox,
                                backgroundColor: difference === 0 ? '#10B98120' : '#F59E0B20',
                                borderColor: difference === 0 ? '#10B981' : '#F59E0B'
                            }}>
                                <span style={styles.differenceLabel}>Difference:</span>
                                <span style={{
                                    ...styles.differenceValue,
                                    color: difference === 0 ? '#10B981' : '#F59E0B'
                                }}>
                                    {formatCurrency(Math.abs(difference))}
                                </span>
                                <span style={styles.differenceText}>
                                    {difference === 0
                                        ? '✓ Your account is reconciled!'
                                        : difference > 0
                                            ? 'You have more money than the statement shows'
                                            : 'You have less money than the statement shows'}
                                </span>
                            </div>
                        )}

                        <button
                            onClick={handleReconcile}
                            style={styles.reconcileButton}
                            disabled={!statementBalance || selectedTransactions.length === 0}
                        >
                            Complete Reconciliation
                        </button>
                    </div>
                </div>

                {/* Right Column - Uncleared Transactions */}
                <div style={styles.transactionsSection}>
                    <div style={styles.card}>
                        <h2 style={styles.sectionTitle}>Uncleared Transactions</h2>
                        <p style={styles.transactionsHint}>
                            Select transactions that have cleared your bank
                        </p>

                        {transactions.length === 0 ? (
                            <div style={styles.noTransactions}>
                                No uncleared transactions found
                            </div>
                        ) : (
                            <div style={styles.transactionsList}>
                                {transactions.map(transaction => (
                                    <div
                                        key={transaction.id}
                                        style={{
                                            ...styles.transactionItem,
                                            backgroundColor: selectedTransactions.includes(transaction.id)
                                                ? '#3B82F620'
                                                : '#111827'
                                        }}
                                        onClick={() => toggleTransaction(transaction.id)}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedTransactions.includes(transaction.id)}
                                            onChange={() => toggleTransaction(transaction.id)}
                                            style={styles.checkbox}
                                        />
                                        <div style={styles.transactionInfo}>
                                            <div style={styles.transactionDate}>{transaction.date}</div>
                                            <div style={styles.transactionPayee}>
                                                {transaction.payee || transaction.description}
                                            </div>
                                        </div>
                                        <div style={{
                                            ...styles.transactionAmount,
                                            color: transaction.amount < 0 ? '#F87171' : '#4ADE80'
                                        }}>
                                            {formatCurrency(transaction.amount)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
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
        margin: 0
    },
    content: {
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem'
    },
    formSection: {
        width: '100%'
    },
    transactionsSection: {
        width: '100%'
    },
    card: {
        background: '#1F2937',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        border: '1px solid #374151'
    },
    sectionTitle: {
        fontSize: '1.25rem',
        fontWeight: '600',
        marginBottom: '1.5rem',
        color: 'white'
    },
    balanceBox: {
        background: '#111827',
        padding: '1rem',
        borderRadius: '0.5rem',
        marginBottom: '1.5rem'
    },
    balanceRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    balanceLabel: {
        color: '#9CA3AF',
        fontSize: '0.95rem'
    },
    balanceValue: {
        fontSize: '1.25rem',
        fontWeight: 'bold',
        color: '#4ADE80'
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
    differenceBox: {
        padding: '1rem',
        borderRadius: '0.5rem',
        border: '1px solid',
        marginBottom: '1.5rem'
    },
    differenceLabel: {
        display: 'block',
        fontSize: '0.875rem',
        color: '#9CA3AF',
        marginBottom: '0.25rem'
    },
    differenceValue: {
        display: 'block',
        fontSize: '1.5rem',
        fontWeight: 'bold',
        marginBottom: '0.5rem'
    },
    differenceText: {
        display: 'block',
        fontSize: '0.875rem',
        color: '#9CA3AF'
    },
    reconcileButton: {
        width: '100%',
        padding: '1rem',
        background: '#3B82F6',
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer',
        ':disabled': {
            opacity: 0.5,
            cursor: 'not-allowed'
        }
    },
    transactionsHint: {
        fontSize: '0.875rem',
        color: '#9CA3AF',
        marginBottom: '1rem'
    },
    transactionsList: {
        maxHeight: '400px',
        overflowY: 'auto'
    },
    transactionItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.75rem',
        borderRadius: '0.5rem',
        marginBottom: '0.5rem',
        cursor: 'pointer',
        transition: 'background-color 0.2s'
    },
    checkbox: {
        width: '18px',
        height: '18px',
        cursor: 'pointer'
    },
    transactionInfo: {
        flex: 1
    },
    transactionDate: {
        fontSize: '0.75rem',
        color: '#9CA3AF',
        marginBottom: '0.25rem'
    },
    transactionPayee: {
        fontSize: '0.95rem',
        color: 'white'
    },
    transactionAmount: {
        fontSize: '1rem',
        fontWeight: '500'
    },
    noTransactions: {
        padding: '2rem',
        textAlign: 'center',
        color: '#9CA3AF'
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
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#F87171'
    },
    backLink: {
        marginTop: '1rem',
        color: '#3B82F6',
        textDecoration: 'none'
    }
};