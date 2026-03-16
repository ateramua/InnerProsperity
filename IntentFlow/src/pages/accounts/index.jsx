// src/pages/accounts/index.jsx
/** @jsxRuntime classic */
/** @jsx React.createElement */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Sidebar from '../../components/Navigation/Sidebar';  // ADD THIS - it was missing!
import { accountUtils } from '../../utils/accountUtils';

export default function AccountsDashboard() {
    console.log('🔵 [AccountsDashboard] Component rendering');
    console.log('🔵 [AccountsDashboard] Current time:', new Date().toISOString());

    const router = useRouter();
    console.log('🔵 [AccountsDashboard] Router path:', router.pathname);
    console.log('🔵 [AccountsDashboard] Router query:', router.query);

    const [accounts, setAccounts] = useState([]);
    const [currentView, setCurrentView] = useState('accounts');
    const [totals, setTotals] = useState({
        budget: { total: 0, count: 0, formatted: '$0.00' },
        tracking: { total: 0, count: 0, formatted: '$0.00' },
        credit: { total: 0, count: 0, formatted: '$0.00' },
        overall: { total: 0, count: 0, formatted: '$0.00' }
    });
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [isLoading, setIsLoading] = useState(true);
    const [showNewAccountModal, setShowNewAccountModal] = useState(false);
    const [newAccountData, setNewAccountData] = useState({
        name: '',
        type: 'checking',
        account_type_category: 'budget',
        balance: 0,
        currency: 'USD',
        institution: ''
    });

    console.log('🔵 [AccountsDashboard] Initial state - isLoading:', isLoading);
    console.log('🔵 [AccountsDashboard] Initial accounts length:', accounts.length);

    const handleNavigation = (viewId) => {
        console.log('🔵 [handleNavigation] Called with viewId:', viewId);
        setCurrentView(viewId);
        if (viewId.startsWith('account-')) {
            console.log('🔵 [handleNavigation] Navigating to account:', viewId.replace('account-', ''));
            router.push(`/accounts/${viewId.replace('account-', '')}`);
        }
    };

    useEffect(() => {
        console.log('🔵 [useEffect] Component mounted, calling loadAccounts()');
        loadAccounts();

        // Cleanup function
        return () => {
            console.log('🔵 [useEffect] Component unmounting');
        };
    }, []);

    // SINGLE loadAccounts function - using accountUtils (clean version)
    const loadAccounts = async () => {
        console.log('📊 Loading all accounts for dashboard...');
        setIsLoading(true);

        const result = await accountUtils.loadAccounts();
        console.log('📊 Load accounts result:', result);

        if (result.success) {
            setAccounts(result.data);
            setLastUpdate(new Date());

            // Calculate totals
            const budgetAccounts = result.data.filter(a => a.account_type_category === 'budget' && a.type !== 'credit');
            const creditAccounts = result.data.filter(a => a.type === 'credit');
            const trackingAccounts = result.data.filter(a => a.account_type_category === 'tracking');

            const budgetTotal = budgetAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
            const creditTotal = creditAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
            const trackingTotal = trackingAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
            const overallTotal = budgetTotal + trackingTotal;

            setTotals({
                budget: {
                    total: budgetTotal,
                    count: budgetAccounts.length,
                    formatted: accountUtils.formatCurrency(budgetTotal)
                },
                credit: {
                    total: creditTotal,
                    count: creditAccounts.length,
                    formatted: accountUtils.formatCurrency(creditTotal)
                },
                tracking: {
                    total: trackingTotal,
                    count: trackingAccounts.length,
                    formatted: accountUtils.formatCurrency(trackingTotal)
                },
                overall: {
                    total: overallTotal,
                    count: result.data.length,
                    formatted: accountUtils.formatCurrency(overallTotal)
                }
            });
        } else {
            console.error('Failed to load accounts:', result.error);
        }

        setIsLoading(false);
    };

    const handleCreateAccount = async () => {
        console.log('🔵 [handleCreateAccount] Called');
        try {
            // First get the current user to get their ID
            const userResult = await window.electronAPI.getCurrentUser();
            console.log('👤 [handleCreateAccount] Current user result:', userResult);

            if (!userResult?.success || !userResult?.data) {
                console.error('❌ No authenticated user found');
                alert('You must be logged in to create an account');
                return;
            }

            const userId = userResult.data.id;
            console.log('👤 [handleCreateAccount] Creating account for user ID:', userId);

            // Prepare account data with userId
            const accountData = {
                ...newAccountData,
                userId: userId
            };

            console.log('📝 [handleCreateAccount] Creating account with data:', accountData);
            const result = await window.electronAPI.createAccount(accountData);
            console.log('📝 [handleCreateAccount] Create account result:', result);

            if (result.success) {
                console.log('✅ [handleCreateAccount] Account created successfully');
                setShowNewAccountModal(false);
                loadAccounts(); // Refresh the account list
                // Reset form
                setNewAccountData({
                    name: '',
                    type: 'checking',
                    account_type_category: 'budget',
                    balance: 0,
                    currency: 'USD',
                    institution: ''
                });
            } else {
                console.error('❌ Failed to create account:', result.error);
                alert(`Failed to create account: ${result.error}`);
            }
        } catch (error) {
            console.error('❌ Failed to create account:', error);
            alert(`Error: ${error.message}`);
        }
    };

    const getAccountIcon = (type) => {
        const icons = {
            checking: '🏦',
            savings: '💰',
            credit: '💳',
            cash: '💵',
            investment: '📈',
            mortgage: '🏠',
            loan: '📉',
            asset: '💎'
        };
        return icons[type] || '🏦';
    };

    const getBalanceColor = (balance, type) => {
        if (type === 'credit') {
            return balance < 0 ? '#F87171' : '#4ADE80';
        }
        return balance >= 0 ? '#4ADE80' : '#F87171';
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    console.log('🔵 [AccountsDashboard] Rendering with isLoading =', isLoading);
    console.log('🔵 [AccountsDashboard] Current accounts count:', accounts.length);
    console.log('🔵 [AccountsDashboard] Current totals:', totals);

    if (isLoading) {
        console.log('🔵 [AccountsDashboard] Rendering loading state');
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        border: '4px solid #3B82F6',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 1rem'
                    }}></div>
                    Loading accounts...
                </div>
            </div>
        );
    }

    console.log('🔵 [AccountsDashboard] Rendering main content');
    console.log('🔵 [AccountsDashboard] Accounts to display:', accounts.length);

    return (
        <div style={styles.container}>
            <Sidebar onNavigate={handleNavigation} currentView={currentView} />
            <main style={styles.main}>
                {/* Header */}
                <div style={styles.header}>
                    <h1 style={styles.headerTitle}>Accounts</h1>
                    <button
                        onClick={() => {
                            console.log('🔵 [New Account button] Clicked');
                            setShowNewAccountModal(true);
                        }}
                        style={styles.newAccountButton}
                    >
                        <span>+</span> New Account
                    </button>
                </div>

                {/* Summary Cards */}
                <div style={styles.summaryGrid}>
                    <div style={styles.summaryCard('blue')}>
                        <div style={styles.summaryLabel}>Budget Accounts</div>
                        <div style={styles.summaryValue}>{totals.budget.formatted}</div>
                        <div style={styles.summaryCount}>{totals.budget.count} accounts</div>
                    </div>

                    <div style={styles.summaryCard('purple')}>
                        <div style={styles.summaryLabel}>Credit Cards</div>
                        <div style={{
                            ...styles.summaryValue,
                            color: totals.credit.total < 0 ? '#F87171' : '#4ADE80'
                        }}>
                            {totals.credit.formatted}
                        </div>
                        <div style={styles.summaryCount}>Total owed</div>
                    </div>

                    <div style={styles.summaryCard('green')}>
                        <div style={styles.summaryLabel}>Tracking Accounts</div>
                        <div style={styles.summaryValue}>{totals.tracking.formatted}</div>
                        <div style={styles.summaryCount}>{totals.tracking.count} accounts</div>
                    </div>

                    <div style={styles.summaryCard('yellow')}>
                        <div style={styles.summaryLabel}>Net Worth</div>
                        <div style={styles.summaryValue}>{totals.overall.formatted}</div>
                        <div style={styles.summaryCount}>{totals.overall.count} total accounts</div>
                    </div>
                </div>

                {/* Account Lists */}
                <div style={styles.accountsContainer}>
                    {/* Budget Accounts Section */}
                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>BUDGET ACCOUNTS</h2>
                        <div style={styles.accountList}>
                            {accounts.filter(a => a.account_type_category === 'budget').map(account => {
                                console.log('🔵 [Rendering] Budget account:', account.id, account.name);
                                return (
                                    <Link href={`/accounts/${account.id}`} key={account.id} style={{ textDecoration: 'none' }}>
                                        <div style={styles.accountRow}>
                                            <div style={styles.accountInfo}>
                                                <span style={styles.accountIcon}>{getAccountIcon(account.type)}</span>
                                                <div>
                                                    <div style={styles.accountName}>{account.name}</div>
                                                    <div style={styles.accountMeta}>
                                                        {account.institution || account.type.charAt(0).toUpperCase() + account.type.slice(1)}
                                                        {account.type === 'credit' && account.credit_limit && ` • Limit: ${formatCurrency(account.credit_limit)}`}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={styles.accountBalance}>
                                                <div style={{
                                                    ...styles.balanceAmount,
                                                    color: getBalanceColor(account.balance, account.type)
                                                }}>
                                                    {formatCurrency(account.balance)}
                                                </div>
                                                {account.working_balance !== account.balance && (
                                                    <div style={styles.workingBalance}>
                                                        Working: {formatCurrency(account.working_balance)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                            {accounts.filter(a => a.account_type_category === 'budget').length === 0 && (
                                <div style={styles.emptyState}>
                                    No budget accounts yet. Click "New Account" to add one.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tracking Accounts Section */}
                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>TRACKING ACCOUNTS</h2>
                        <div style={styles.accountList}>
                            {accounts.filter(a => a.account_type_category === 'tracking').map(account => {
                                console.log('🔵 [Rendering] Tracking account:', account.id, account.name);
                                return (
                                    <Link href={`/accounts/${account.id}`} key={account.id} style={{ textDecoration: 'none' }}>
                                        <div style={styles.accountRow}>
                                            <div style={styles.accountInfo}>
                                                <span style={styles.accountIcon}>{getAccountIcon(account.type)}</span>
                                                <div>
                                                    <div style={styles.accountName}>{account.name}</div>
                                                    <div style={styles.accountMeta}>
                                                        {account.institution || account.type.charAt(0).toUpperCase() + account.type.slice(1)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{
                                                ...styles.balanceAmount,
                                                color: getBalanceColor(account.balance, account.type)
                                            }}>
                                                {formatCurrency(account.balance)}
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                            {accounts.filter(a => a.account_type_category === 'tracking').length === 0 && (
                                <div style={styles.emptyState}>
                                    No tracking accounts yet. Add investments, mortgages, or loans.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* New Account Modal */}
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
                                    onChange={(e) => {
                                        const type = e.target.value;
                                        const category = ['credit', 'mortgage', 'loan'].includes(type) ? 'budget' :
                                            ['investment'].includes(type) ? 'tracking' : 'budget';
                                        setNewAccountData({
                                            ...newAccountData,
                                            type,
                                            account_type_category: category
                                        });
                                    }}
                                    style={styles.select}
                                >
                                    <option value="checking">Checking</option>
                                    <option value="savings">Savings</option>
                                    <option value="credit">Credit Card</option>
                                    <option value="cash">Cash</option>
                                    <option value="investment">Investment</option>
                                    <option value="mortgage">Mortgage</option>
                                    <option value="loan">Loan</option>
                                    <option value="asset">Asset</option>
                                </select>
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}>Current Balance</label>
                                <input
                                    type="text"
                                    value={newAccountData.balance === 0 ? '' : newAccountData.balance}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
                                            setNewAccountData({
                                                ...newAccountData,
                                                balance: value === '' ? '' : value
                                            });
                                        }
                                    }}
                                    onBlur={(e) => {
                                        const value = e.target.value;
                                        if (value === '') {
                                            setNewAccountData({ ...newAccountData, balance: 0 });
                                        } else {
                                            setNewAccountData({
                                                ...newAccountData,
                                                balance: parseFloat(value) || 0
                                            });
                                        }
                                    }}
                                    placeholder="Enter balance (e.g., 1000 or -50.50)"
                                    style={styles.input}
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

                            {newAccountData.type === 'credit' && (
                                <>
                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Credit Limit</label>
                                        <input
                                            type="number"
                                            value={newAccountData.credit_limit || ''}
                                            onChange={(e) => setNewAccountData({ ...newAccountData, credit_limit: parseFloat(e.target.value) || null })}
                                            style={styles.input}
                                            step="0.01"
                                        />
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Interest Rate (%)</label>
                                        <input
                                            type="number"
                                            value={newAccountData.interest_rate || ''}
                                            onChange={(e) => setNewAccountData({ ...newAccountData, interest_rate: parseFloat(e.target.value) || null })}
                                            style={styles.input}
                                            step="0.01"
                                        />
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Minimum Payment</label>
                                        <input
                                            type="number"
                                            value={newAccountData.minimum_payment || ''}
                                            onChange={(e) => setNewAccountData({ ...newAccountData, minimum_payment: parseFloat(e.target.value) || null })}
                                            style={styles.input}
                                            step="0.01"
                                        />
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Due Date</label>
                                        <input
                                            type="date"
                                            value={newAccountData.due_date || ''}
                                            onChange={(e) => setNewAccountData({ ...newAccountData, due_date: e.target.value || null })}
                                            style={styles.input}
                                        />
                                    </div>
                                </>
                            )}

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
            </main>
        </div>
    );
}

const styles = {
    container: {
        display: 'flex',
        minHeight: '100vh',
        background: '#0047AB'
    },
    main: {
        flex: 1,
        marginLeft: '280px',
        padding: '2rem',
        background: '#0047AB',
        color: 'white',
        minHeight: '100vh'
    },
    header: {
        maxWidth: '1200px',
        margin: '0 auto 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    headerTitle: {
        fontSize: '2rem',
        fontWeight: 'bold',
        margin: 0
    },
    newAccountButton: {
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
    summaryGrid: {
        maxWidth: '1200px',
        margin: '0 auto 2rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1rem'
    },
    summaryCard: (color) => ({
        background: '#0047AB',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        borderLeft: `4px solid ${
            color === 'blue' ? '#3B82F6' :
            color === 'purple' ? '#8B5CF6' :
            color === 'green' ? '#10B981' : '#F59E0B'
        }`
    }),
    summaryLabel: {
        color: '#9CA3AF',
        fontSize: '0.875rem'
    },
    summaryValue: {
        fontSize: '1.5rem',
        fontWeight: 'bold',
        color: 'white'
    },
    summaryCount: {
        color: '#6B7280',
        fontSize: '0.75rem'
    },
    accountsContainer: {
        maxWidth: '1200px',
        margin: '0 auto'
    },
    section: {
        marginBottom: '2rem'
    },
    sectionTitle: {
        fontSize: '1.25rem',
        fontWeight: '600',
        marginBottom: '1rem',
        color: '#9CA3AF'
    },
    accountList: {
        background: '#0047AB',
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
        fontWeight: '600'
    },
    workingBalance: {
        fontSize: '0.75rem',
        color: '#9CA3AF'
    },
    emptyState: {
        padding: '2rem',
        textAlign: 'center',
        color: '#6B7280'
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
        background: '#000000',
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
        background: '#0f2e1c',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '1rem'
    },
    select: {
        width: '100%',
        padding: '0.75rem',
        background: '#0f2e1c',
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