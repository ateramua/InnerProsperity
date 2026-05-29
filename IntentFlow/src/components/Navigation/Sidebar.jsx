// src/components/Navigation/Sidebar.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import { APP_BG, APP_FG, APP_ON_FG } from '../../theme/appPalette';
import {
    confirmNoDuplicateAccount,
    maskFromAccountNumber,
} from '../../utils/plaidDuplicateCheck';

function sidebarHeaderStyle(isCollapsed) {
    return {
        paddingTop: '24px',
        paddingBottom: '24px',
        paddingLeft: isCollapsed ? '12px' : '20px',
        paddingRight: isCollapsed ? '12px' : '20px',
        borderBottom: `2px solid ${APP_FG}`,
    };
}

function sidebarNavItemStyle(isCollapsed, isActive) {
    return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        paddingTop: '12px',
        paddingBottom: '12px',
        paddingLeft: isCollapsed ? 0 : '20px',
        paddingRight: isCollapsed ? 0 : '20px',
        cursor: 'pointer',
        transition: 'background 0.2s',
        background: isActive ? APP_FG : undefined,
    };
}

function sidebarFooterItemStyle(isCollapsed) {
    return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        paddingTop: isCollapsed ? '12px' : '8px',
        paddingBottom: isCollapsed ? '12px' : '8px',
        paddingLeft: 0,
        paddingRight: 0,
        cursor: 'pointer',
        color: 'rgba(255,255,255,0.85)',
    };
}

function sidebarFooterLogoutStyle(isCollapsed) {
    return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        paddingTop: '12px',
        paddingBottom: isCollapsed ? '12px' : '8px',
        paddingLeft: 0,
        paddingRight: 0,
        cursor: 'pointer',
        color: 'rgba(255,255,255,0.85)',
        borderTop: '1px solid #374151',
        marginTop: '8px',
    };
}

const Sidebar = ({ onNavigate, currentView, collapsed = false, onToggleCollapse }) => {
    const [expandedSection, setExpandedSection] = useState(null);
    const [showAddAccountModal, setShowAddAccountModal] = useState(false);
    const [accountType, setAccountType] = useState('credit');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const router = useRouter();
    const { logout } = useAuth();
    const isCollapsed = collapsed;

    // Form state for new account
    const [newAccountData, setNewAccountData] = useState({
        name: '',
        type: 'credit',
        balance: '',
        credit_limit: '',
        interest_rate: '',
        due_date: '',
        institution: '',
        account_number: '',
        account_holder_name: '',
        notes: ''
    });

    const [sidebarAccounts, setSidebarAccounts] = useState({
        cash: [],
        credit: [],
    });
    const [plaidNav, setPlaidNav] = useState({ enabled: true, needsReconnect: false });

    const loadSidebarAccounts = useCallback(async () => {
        if (!window.electronAPI?.getAccountsSummary) return;
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (!userResult?.success || !userResult?.data?.id) return;
            const userId = userResult.data.id;
            const result = await window.electronAPI.getAccountsSummary(userId);
            if (!result?.success || !Array.isArray(result.data)) return;
            const all = result.data;
            setSidebarAccounts({
                cash: all.filter((a) => a.type === 'checking' || a.type === 'savings'),
                credit: all.filter((a) => a.type === 'credit'),
            });
        } catch (err) {
            console.error('Sidebar: failed to load accounts', err);
        }
    }, []);

    useEffect(() => {
        loadSidebarAccounts();
        const unsub = window.electronAPI?.onAccountsUpdated?.(() => {
            loadSidebarAccounts();
        });
        return () => {
            if (typeof unsub === 'function') unsub();
        };
    }, [loadSidebarAccounts]);

    useEffect(() => {
        (async () => {
            if (!window.electronAPI?.getPlaidConfigStatus) return;
            try {
                const cfg = await window.electronAPI.getPlaidConfigStatus();
                const enabled = cfg?.success && cfg.data?.enabled !== false;
                let needsReconnect = false;
                if (enabled && window.electronAPI?.getLinkedItems) {
                    const itemsRes = await window.electronAPI.getLinkedItems();
                    if (itemsRes?.success) {
                        needsReconnect = (itemsRes.data || []).some(
                            (i) => i.status === 'login_required'
                        );
                    }
                }
                setPlaidNav({ enabled, needsReconnect });
            } catch (err) {
                console.warn('Sidebar: Plaid status check failed', err);
            }
        })();
        const unsub = window.electronAPI?.onAccountsUpdated?.(async () => {
            if (!window.electronAPI?.getLinkedItems) return;
            const itemsRes = await window.electronAPI.getLinkedItems();
            if (itemsRes?.success) {
                setPlaidNav((prev) => ({
                    ...prev,
                    needsReconnect: (itemsRes.data || []).some((i) => i.status === 'login_required'),
                }));
            }
        });
        return () => {
            if (typeof unsub === 'function') unsub();
        };
    }, []);

    const accounts = sidebarAccounts;

    const handleAddAccountClick = (type) => {
        setAccountType(type);
        setNewAccountData({
            name: '',
            type: type,
            balance: '',
            credit_limit: '',
            interest_rate: type === 'credit' ? '18.99' : type === 'loan' ? '5.99' : '',
            due_date: '',
            institution: '',
            account_number: '',
            account_holder_name: '',
            notes: ''
        });
        setShowAddAccountModal(true);
    };

    const handleCreateAccount = async () => {
        try {
            // Validate required fields
            if (!newAccountData.name.trim()) {
                alert('Please enter an account name');
                return;
            }

            // Get current user
            const userResult = await window.electronAPI.getCurrentUser();
            if (!userResult?.success || !userResult?.data) {
                alert('You must be logged in to create an account');
                return;
            }

            const userId = userResult.data.id;

            const mask = maskFromAccountNumber(newAccountData.account_number);
            const proceed = await confirmNoDuplicateAccount({
                type: newAccountData.type,
                mask,
                name: newAccountData.name,
                institution: newAccountData.institution,
            });
            if (!proceed) return;

            // Prepare account data based on type
            let accountData = {
                name: newAccountData.name.trim(),
                type: newAccountData.type,
                user_id: userId,
                userId: userId,
                currency: 'USD',
                institution: newAccountData.institution?.trim() || null,
                account_number: newAccountData.account_number?.trim() || null,
                account_holder_name: newAccountData.account_holder_name?.trim() || null,
                notes: newAccountData.notes?.trim() || null,
                forceCreate: true,
            };

            // Handle balance based on account type
            let balanceValue = 0;
            if (newAccountData.balance !== '' && newAccountData.balance !== null) {
                const parsedBalance = parseFloat(newAccountData.balance);
                if (!isNaN(parsedBalance)) {
                    if (newAccountData.type === 'credit' || newAccountData.type === 'loan') {
                        // Credit cards and loans are liabilities (negative balance)
                        balanceValue = -Math.abs(parsedBalance);
                    } else {
                        // Checking and savings are assets (positive balance)
                        balanceValue = Math.abs(parsedBalance);
                    }
                }
            }
            accountData.balance = balanceValue;

            // Add type-specific fields
            if (newAccountData.type === 'credit') {
                accountData.account_type_category = 'credit';
                accountData.credit_limit = parseFloat(newAccountData.credit_limit) || 0;
                accountData.limit = parseFloat(newAccountData.credit_limit) || 0;
                accountData.interest_rate = parseFloat(newAccountData.interest_rate) || 18.99;
                accountData.apr = parseFloat(newAccountData.interest_rate) || 18.99;
                accountData.due_date = newAccountData.due_date || null;
                accountData.dueDate = newAccountData.due_date || null;
            } else if (newAccountData.type === 'loan') {
                accountData.account_type_category = 'loan';
                accountData.loan_type = 'personal';
                accountData.interest_rate = parseFloat(newAccountData.interest_rate) || null;
                accountData.due_date = newAccountData.due_date || null;
                accountData.original_balance = Math.abs(balanceValue);
            } else {
                accountData.account_type_category = 'budget';
            }

            console.log('📝 Creating account with data:', accountData);

            const result = await window.electronAPI.createAccount(accountData);

            if (result.success) {
                console.log('✅ Account created successfully:', result.data);
                setShowAddAccountModal(false);
                
                // Reset form
                setNewAccountData({
                    name: '',
                    type: 'credit',
                    balance: '',
                    credit_limit: '',
                    interest_rate: '',
                    due_date: '',
                    institution: '',
                    account_number: '',
                    account_holder_name: '',
                    notes: ''
                });

                // Trigger refresh
                window.dispatchEvent(new CustomEvent('accounts-updated'));
                alert(`✅ ${newAccountData.type === 'credit' ? 'Credit card' : newAccountData.type === 'loan' ? 'Loan' : 'Account'} created successfully!`);
            } else {
                console.error('❌ Failed to create account:', result.error);
                alert(`Failed to create account: ${result.error}`);
            }
        } catch (error) {
            console.error('❌ Error creating account:', error);
            alert(`Error: ${error.message}`);
        }
    };

    const navigationItems = [
        {
            id: 'propertyMap',
            label: 'PropertyMap',
            icon: '📊',
            description: 'Budget table'
        },
        {
            id: 'accounts',
            label: 'Accounts',
            icon: '🏦',
            description: 'Manage checking & savings',
            onClick: () => {
                router.push('/?view=accounts');
                if (onNavigate) onNavigate('accounts');
            }
        },
        {
            id: 'allAccounts',
            label: 'All Accounts',
            icon: '📋',
            description: 'View all accounts',
            onClick: () => {
                router.push('/?view=allAccounts');
                if (onNavigate) onNavigate('allAccounts');
            }
        },
        {
            id: 'moneyMap',
            label: 'Money Map',
            icon: '🗺️',
            description: 'Unified financial view'
        },
        {
            id: 'prosperityOptimizer',
            label: 'Prosperity Optimizer',
            icon: '🎯',
            description: 'Smart ProsperityMap recommendations'
        },
        {
            id: 'reflects',
            label: 'Reflects',
            icon: '🥧',
            description: 'Pie chart visualization'
        },
        {
            id: 'linked-banks',
            label: 'Linked Banks',
            icon: '🔗',
            description: 'Manage connected bank accounts (Plaid)',
            onClick: () => {
                router.push('/?view=linked-banks');
                if (onNavigate) onNavigate('linked-banks');
            }
        },
        {
            id: 'forecast',
            label: 'Forecast',
            icon: '📈',
            description: 'Smart financial predictions'
        },
        {
            id: 'cashflow',
            label: 'Cash Flow',
            icon: '💰',
            description: 'Complete cash flow picture'
        },
        {
            id: 'cashflow-forecast',
            label: 'Cash Flow Forecast',
            icon: '📈',
            description: 'Project your future cash position'
        },
        {
            id: 'investments',
            label: 'Investments',
            icon: '📈',
            description: 'Track and manage your investment portfolio'
        },
        {
            id: 'creditCards',
            label: 'Credit Cards',
            icon: '💳',
            description: 'Credit card accounts',
            hasSubItems: true,
            isExpandable: true,
            onAddClick: () => handleAddAccountClick('credit'),
            subItems: [
                {
                    id: 'credit-dashboard',
                    label: 'Dashboard',
                    icon: '📊',
                    description: 'Overview of all cards',
                    action: 'dashboard'
                },
                {
                    id: 'credit-planner',
                    label: 'Planner',
                    icon: '📈',
                    description: 'Payment strategies',
                    action: 'planner'
                },
                {
                    id: 'credit-add',
                    label: 'Add Credit Card',
                    icon: '➕',
                    description: 'Add new credit card',
                    action: 'add',
                    isAddButton: true
                },
                { type: 'divider' },
                ...(accounts.credit && accounts.credit.length > 0
                    ? accounts.credit.map(account => ({
                        id: `account-${account.id}`,
                        label: account.name,
                        icon: '💳',
                        balance: account.balance,
                        isAccount: true,
                        accountId: account.id,
                        type: 'account',
                        institution: account.institution
                    }))
                    : [])
            ]
        },
        {
            id: 'loans',
            label: 'Loans',
            icon: '🏦',
            description: 'Loan accounts',
            hasSubItems: true,
            isExpandable: true,
            onAddClick: () => handleAddAccountClick('loan'),
            subItems: [
                {
                    id: 'loan-dashboard',
                    label: 'Dashboard',
                    icon: '📊',
                    description: 'Overview of all loans',
                    action: 'dashboard'
                },
                {
                    id: 'loan-strategist',
                    label: 'Loan Strategist',
                    icon: '📈',
                    description: 'Loan repayment optimization',
                    action: 'strategist'
                },
                {
                    id: 'loan-add',
                    label: 'Add Loan',
                    icon: '➕',
                    description: 'Add new loan',
                    action: 'add',
                    isAddButton: true
                }
            ]
        }
    ];

    const visibleNavigationItems = navigationItems.filter(
        (item) => item.id !== 'linked-banks' || plaidNav.enabled
    );

    const handleNavigation = (itemId, itemType = 'view') => {
        if (itemId === 'forecast') {
            router.push('/forecast');
        } else if (onNavigate) {
            if (itemType === 'account') {
                onNavigate(`account-${itemId}`);
            } else {
                onNavigate(itemId);
            }
        }
    };

    const handleSubItemClick = (subItem) => {
        if (subItem.type === 'divider') return;
        
        // Handle add button click
        if (subItem.isAddButton) {
            const parentSection = subItem.id.includes('credit') ? 'credit' : 'loan';
            handleAddAccountClick(parentSection);
            return;
        }

        console.log('🔍 SubItem clicked:', subItem);

        if (subItem.isAccount) {
            handleNavigation(subItem.accountId, 'account');
        } else {
            handleNavigation(subItem.id, 'view');
        }

        // Auto-expand the section when a sub-item is clicked
        const parentSection = subItem.id.includes('credit') ? 'creditCards' : 'loans';
        if (!expandedSection || expandedSection !== parentSection) {
            setExpandedSection(parentSection);
        }
    };

    const handleAccountClick = (accountId) => {
        handleNavigation(accountId, 'account');
    };

    const toggleSection = (sectionId) => {
        setExpandedSection(expandedSection === sectionId ? null : sectionId);
    };

    const handleLogout = async () => {
        try {
            await logout();
            router.push('/login');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Math.abs(amount || 0));
    };

    const renderSubItems = (item) => {
        if (!item.subItems || expandedSection !== item.id) return null;

        const hasAccounts = item.subItems.some(s => s.isAccount);

        return (
            <div style={styles.subItemsContainer}>
                {item.subItems.map((subItem, index) => {
                    if (subItem.type === 'divider') {
                        return (
                            <div key={`divider-${index}`} style={styles.divider} />
                        );
                    }

                    const isActive = subItem.isAccount
                        ? currentView === `account-${subItem.accountId}`
                        : currentView === subItem.id;

                    return (
                        <div
                            key={subItem.id}
                            style={{
                                ...styles.subItem,
                                ...(isActive ? styles.activeSubItem : {}),
                                ...(subItem.isAddButton ? styles.addButtonSubItem : {})
                            }}
                            onClick={() => handleSubItemClick(subItem)}
                        >
                            <span style={styles.subItemIcon}>{subItem.icon}</span>
                            <span style={styles.subItemLabel}>{subItem.label}</span>
                            {subItem.balance !== undefined && (
                                <span style={{
                                    ...styles.subItemBalance,
                                    color: subItem.balance >= 0 ? '#4ADE80' : '#F87171'
                                }}>
                                    {formatCurrency(subItem.balance)}
                                </span>
                            )}
                            {subItem.lender && (
                                <span style={styles.subItemLender} title={subItem.lender}>
                                    {subItem.lender.length > 3 ? `${subItem.lender.substring(0, 3)}...` : subItem.lender}
                                </span>
                            )}
                            {subItem.institution && (
                                <span style={styles.subItemLender} title={subItem.institution}>
                                    {subItem.institution.length > 3 ? `${subItem.institution.substring(0, 3)}...` : subItem.institution}
                                </span>
                            )}
                            {subItem.description && !subItem.isAccount && !subItem.isAddButton && (
                                <span style={styles.subItemTooltip} title={subItem.description}>
                                    ℹ️
                                </span>
                            )}
                        </div>
                    );
                })}

                {/* Show empty state for credit cards if no accounts */}
                {item.id === 'creditCards' && !hasAccounts && (
                    <div style={styles.emptyState}>
                        No credit cards yet. Click "Add Credit Card" to get started.
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <div style={{ ...styles.sidebar, width: isCollapsed ? '72px' : '280px' }}>
                {/* Header */}
                <div style={sidebarHeaderStyle(isCollapsed)}>
                    <button
                        type="button"
                        onClick={onToggleCollapse}
                        style={styles.collapseToggle}
                        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {isCollapsed ? '➡' : '⬅'}
                    </button>
                    <div style={{ display: isCollapsed ? 'none' : 'block' }}>
                        <h2 style={styles.title}>IntentFlow</h2>
                        <div style={styles.version}>v1.0.0</div>
                    </div>
                </div>

                {/* Navigation Items */}
                <nav style={styles.nav}>
                    {visibleNavigationItems.map((item) => (
                        <div key={item.id}>
                            {/* Main Navigation Item */}
                            <div
                                style={sidebarNavItemStyle(
                                    isCollapsed,
                                    currentView === item.id
                                )}
                                onClick={() => {
                                    if ((item.hasSubItems || (item.accounts && item.accounts.length > 0)) && !isCollapsed) {
                                        toggleSection(item.id);
                                    } else {
                                        handleNavigation(item.id);
                                    }
                                }}
                            >
                                <span style={styles.navIcon}>{item.icon}</span>
                                <span style={{ ...styles.navLabel, ...(isCollapsed ? styles.hiddenLabel : {}) }}>{item.label}</span>
                                {(item.hasSubItems || (item.accounts && item.accounts.length > 0)) && !isCollapsed && (
                                    <span style={styles.navChevron}>
                                        {expandedSection === item.id ? '▼' : '▶'}
                                    </span>
                                )}
                            </div>

                            {/* Render sub-items for credit cards and loans */}
                            {item.hasSubItems && !isCollapsed && renderSubItems(item)}
                        </div>
                    ))}
                </nav>

                {/* Footer */}
                <div style={styles.footer}>
                    {plaidNav.enabled && plaidNav.needsReconnect && !isCollapsed && (
                        <div
                            style={styles.plaidHealthBanner}
                            onClick={() => {
                                router.push('/?view=linked-banks');
                                if (onNavigate) onNavigate('linked-banks');
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    router.push('/?view=linked-banks');
                                    if (onNavigate) onNavigate('linked-banks');
                                }
                            }}
                        >
                            <span>⚠️</span>
                            <span>Bank connection needs reconnect</span>
                        </div>
                    )}
                    <div
                        style={sidebarFooterItemStyle(isCollapsed)}
                        onClick={() => router.push('/settings')}
                    >
                        <span style={styles.footerIcon}>⚙️</span>
                        <span style={isCollapsed ? styles.hiddenLabel : undefined}>Settings</span>
                    </div>
                    <div
                        style={sidebarFooterItemStyle(isCollapsed)}
                        onClick={() => router.push('/reports')}
                    >
                        <span style={styles.footerIcon}>📊</span>
                        <span style={isCollapsed ? styles.hiddenLabel : undefined}>Reports</span>
                    </div>
                    <div style={sidebarFooterLogoutStyle(isCollapsed)} onClick={handleLogout}>
                        <span style={styles.footerIcon}>🚪</span>
                        <span style={{ color: '#F87171', ...(isCollapsed ? styles.hiddenLabel : {}) }}>Logout</span>
                    </div>
                </div>
            </div>

            {/* Inline Add Account Modal */}
            {showAddAccountModal && (
                <div style={styles.modalOverlay} onClick={() => setShowAddAccountModal(false)}>
                    <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h2 style={styles.modalTitle}>
                            {accountType === 'credit' ? '💳 Add Credit Card' : 
                             accountType === 'loan' ? '🏦 Add Loan' : 
                             '💰 Add Account'}
                        </h2>

                        {/* Basic Information */}
                        <div style={styles.section}>
                            <h3 style={styles.sectionTitle}>Basic Information</h3>
                            
                            <div style={styles.formGroup}>
                                <label style={styles.label}>
                                    Account Name <span style={styles.required}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newAccountData.name}
                                    onChange={(e) => setNewAccountData({ ...newAccountData, name: e.target.value })}
                                    style={styles.input}
                                    placeholder={accountType === 'credit' ? "e.g., Chase Sapphire" : accountType === 'loan' ? "e.g., Auto Loan" : "e.g., Main Checking"}
                                    autoFocus
                                />
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}>Institution</label>
                                <input
                                    type="text"
                                    value={newAccountData.institution}
                                    onChange={(e) => setNewAccountData({ ...newAccountData, institution: e.target.value })}
                                    style={styles.input}
                                    placeholder={accountType === 'credit' ? "e.g., Chase Bank" : accountType === 'loan' ? "e.g., Wells Fargo" : "e.g., Bank of America"}
                                />
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}>
                                    Current Balance <span style={styles.required}>*</span>
                                </label>
                                <div style={styles.inputWrapper}>
                                    <span style={styles.currencySymbol}>$</span>
                                    <input
                                        type="number"
                                        value={newAccountData.balance}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            if (value === '') {
                                                setNewAccountData({ ...newAccountData, balance: '' });
                                            } else {
                                                const numValue = parseFloat(value);
                                                if (!isNaN(numValue)) {
                                                    setNewAccountData({ ...newAccountData, balance: numValue });
                                                }
                                            }
                                        }}
                                        onBlur={() => {
                                            if (newAccountData.balance === '' || newAccountData.balance === null) {
                                                setNewAccountData({ ...newAccountData, balance: '' });
                                            }
                                        }}
                                        style={styles.modalInput}
                                        step="0.01"
                                        placeholder="0.00"
                                    />
                                </div>
                                <small style={styles.hint}>
                                    {accountType === 'credit' ? 'Enter the current amount owed' : 
                                     accountType === 'loan' ? 'Enter the remaining loan balance' : 
                                     'Enter the current account balance'}
                                </small>
                            </div>
                        </div>

                        {/* Account Details */}
                        <div style={styles.section}>
                            <h3 style={styles.sectionTitle}>Account Details</h3>
                            
                            {(accountType === 'credit' || accountType === 'loan') && (
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>
                                        {accountType === 'credit' ? 'Credit Limit' : 'Interest Rate (APR %)'}
                                    </label>
                                    <div style={styles.inputWrapper}>
                                        {accountType === 'credit' && <span style={styles.currencySymbol}>$</span>}
                                        <input
                                            type="number"
                                            value={accountType === 'credit' ? newAccountData.credit_limit : newAccountData.interest_rate}
                                            onChange={(e) => {
                                                const field = accountType === 'credit' ? 'credit_limit' : 'interest_rate';
                                                const value = e.target.value;
                                                if (value === '') {
                                                    setNewAccountData({ ...newAccountData, [field]: '' });
                                                } else {
                                                    const numValue = parseFloat(value);
                                                    if (!isNaN(numValue)) {
                                                        setNewAccountData({ ...newAccountData, [field]: numValue });
                                                    }
                                                }
                                            }}
                                            style={styles.modalInput}
                                            step="0.01"
                                            placeholder={accountType === 'credit' ? "0.00" : "5.99"}
                                        />
                                    </div>
                                </div>
                            )}

                            {(accountType === 'credit' || accountType === 'loan') && (
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Due Date</label>
                                    <input
                                        type="date"
                                        value={newAccountData.due_date}
                                        onChange={(e) => setNewAccountData({ ...newAccountData, due_date: e.target.value })}
                                        style={styles.input}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Additional Information */}
                        <div style={styles.section}>
                            <h3 style={styles.sectionTitle}>Additional Information</h3>
                            
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Account Number</label>
                                <input
                                    type="text"
                                    value={newAccountData.account_number}
                                    onChange={(e) => setNewAccountData({ ...newAccountData, account_number: e.target.value })}
                                    style={styles.input}
                                    placeholder="Last 4 digits or full account number"
                                    maxLength={accountType === 'credit' ? 4 : 20}
                                />
                                <small style={styles.hint}>For reference only</small>
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}>Account Holder Name</label>
                                <input
                                    type="text"
                                    value={newAccountData.account_holder_name}
                                    onChange={(e) => setNewAccountData({ ...newAccountData, account_holder_name: e.target.value })}
                                    style={styles.input}
                                    placeholder="Name on the account"
                                />
                            </div>

                            <div style={styles.formGroup}>
                                <label style={styles.label}>Notes</label>
                                <textarea
                                    value={newAccountData.notes}
                                    onChange={(e) => setNewAccountData({ ...newAccountData, notes: e.target.value })}
                                    style={styles.textarea}
                                    rows="3"
                                    placeholder="Add any additional notes about this account..."
                                />
                            </div>
                        </div>

                        <div style={styles.modalActions}>
                            <button onClick={handleCreateAccount} style={styles.saveButton}>
                                Create {accountType === 'credit' ? 'Credit Card' : accountType === 'loan' ? 'Loan' : 'Account'}
                            </button>
                            <button onClick={() => setShowAddAccountModal(false)} style={styles.cancelButton}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const styles = {
    sidebar: {
        width: '280px',
        height: '100vh',
        background: APP_BG,
        color: APP_ON_FG,
        display: 'flex',
        flexDirection: 'column',
        borderRight: `2px solid ${APP_FG}`,
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 1500,
        overflowY: 'auto',
        transition: 'width 0.25s ease'
    },
    header: {
        paddingTop: '24px',
        paddingBottom: '24px',
        paddingLeft: '20px',
        paddingRight: '20px',
        borderBottom: `2px solid ${APP_FG}`,
    },
    headerCollapsed: {
        paddingLeft: '12px',
        paddingRight: '12px',
    },
    title: {
        margin: 0,
        fontSize: '1.5rem',
        fontWeight: 'bold',
        color: 'white',
        marginBottom: '4px'
    },
    version: {
        fontSize: '0.75rem',
        color: 'rgba(255,255,255,0.75)'
    },
    nav: {
        flex: 1,
        overflowY: 'auto',
        paddingTop: '20px',
        paddingBottom: '20px',
        paddingLeft: 0,
        paddingRight: 0,
    },
    navItem: {
        display: 'flex',
        alignItems: 'center',
        paddingTop: '12px',
        paddingBottom: '12px',
        paddingLeft: '20px',
        paddingRight: '20px',
        cursor: 'pointer',
        transition: 'background 0.2s',
        ':hover': {
            background: '#374151',
        },
    },
    collapsedNavItem: {
        justifyContent: 'center',
        paddingLeft: 0,
        paddingRight: 0,
    },
    navItemWithSubItems: {
        borderBottom: '1px solid transparent',
        ':hover': {
            borderBottomColor: '#374151'
        }
    },
    activeNavItem: {
        background: APP_FG,
        ':hover': {
            background: APP_FG,
            filter: 'brightness(1.08)'
        }
    },
    navIcon: {
        fontSize: '1.25rem',
        marginRight: '12px',
        width: '24px',
        textAlign: 'center'
    },
    navLabel: {
        flex: 1,
        fontSize: '0.95rem',
        fontWeight: '500'
    },
    hiddenLabel: {
        display: 'none'
    },
    navChevron: {
        fontSize: '0.75rem',
        color: 'rgba(255,255,255,0.7)',
        marginLeft: '8px'
    },
    subItemsContainer: {
        background: APP_FG,
        paddingTop: '4px',
        paddingBottom: '4px',
        paddingLeft: 0,
        paddingRight: 0,
    },
    subItem: {
        display: 'flex',
        alignItems: 'center',
        paddingTop: '10px',
        paddingBottom: '10px',
        paddingLeft: '52px',
        paddingRight: '20px',
        cursor: 'pointer',
        transition: 'background 0.2s',
        position: 'relative',
        color: APP_ON_FG,
        ':hover': {
            background: 'rgba(255,255,255,0.12)'
        }
    },
    addButtonSubItem: {
        background: 'rgba(255,255,255,0.1)',
        borderBottom: `1px solid ${APP_BG}`,
        fontWeight: '600',
        ':hover': {
            background: 'rgba(255,255,255,0.18)'
        }
    },
    activeSubItem: {
        background: 'rgba(255,255,255,0.15)',
        borderLeft: `3px solid ${APP_BG}`
    },
    subItemIcon: {
        fontSize: '1rem',
        marginRight: '10px',
        width: '20px',
        textAlign: 'center'
    },
    subItemLabel: {
        flex: 1,
        fontSize: '0.9rem',
        cursor: 'pointer'
    },
    subItemBalance: {
        fontSize: '0.85rem',
        fontWeight: '500',
        marginRight: '8px'
    },
    subItemLender: {
        fontSize: '0.7rem',
        color: 'rgba(255,255,255,0.85)',
        marginRight: '4px',
        background: 'rgba(0,0,0,0.2)',
        paddingTop: '2px',
        paddingBottom: '2px',
        paddingLeft: '4px',
        paddingRight: '4px',
        borderRadius: '4px',
    },
    subItemTooltip: {
        fontSize: '0.8rem',
        color: '#9CA3AF',
        cursor: 'help',
        marginLeft: '4px'
    },
    divider: {
        height: '1px',
        background: 'rgba(255,255,255,0.25)',
        margin: '8px 20px 8px 52px'
    },
    emptyState: {
        paddingTop: '10px',
        paddingBottom: '10px',
        paddingLeft: '52px',
        paddingRight: '20px',
        color: '#6B7280',
        fontSize: '0.85rem',
        fontStyle: 'italic',
    },
    footer: {
        paddingTop: '20px',
        paddingBottom: '20px',
        paddingLeft: '20px',
        paddingRight: '20px',
        borderTop: `2px solid ${APP_FG}`,
    },
    plaidHealthBanner: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        paddingTop: '8px',
        paddingBottom: '8px',
        paddingLeft: '10px',
        paddingRight: '10px',
        marginBottom: '10px',
        background: 'rgba(180, 83, 9, 0.25)',
        border: '1px solid rgba(251, 191, 36, 0.45)',
        borderRadius: '6px',
        fontSize: '0.75rem',
        color: '#FDE68A',
        cursor: 'pointer',
    },
    footerItem: {
        display: 'flex',
        alignItems: 'center',
        paddingTop: '8px',
        paddingBottom: '8px',
        paddingLeft: 0,
        paddingRight: 0,
        cursor: 'pointer',
        color: 'rgba(255,255,255,0.85)',
        ':hover': {
            color: 'white',
        },
    },
    footerItemCollapsed: {
        justifyContent: 'center',
        paddingTop: '12px',
        paddingBottom: '12px',
    },
    footerLogoutItem: {
        display: 'flex',
        alignItems: 'center',
        paddingTop: '12px',
        paddingBottom: '8px',
        paddingLeft: 0,
        paddingRight: 0,
        cursor: 'pointer',
        color: 'rgba(255,255,255,0.85)',
        borderTop: '1px solid #374151',
        marginTop: '8px',
        ':hover': {
            color: 'white',
        },
    },
    footerLogoutItemCollapsed: {
        justifyContent: 'center',
        paddingBottom: '12px',
    },
    collapseToggle: {
        background: 'transparent',
        border: `2px solid ${APP_FG}`,
        color: APP_ON_FG,
        width: '36px',
        height: '36px',
        borderRadius: '12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: '12px'
    },
    footerIcon: {
        fontSize: '1.1rem',
        marginRight: '12px',
        width: '24px',
        textAlign: 'center'
    },
    // Modal styles
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
        zIndex: 2000
    },
    modalContent: {
        background: APP_FG,
        paddingTop: '2rem',
        paddingBottom: '2rem',
        paddingLeft: '2rem',
        paddingRight: '2rem',
        borderRadius: '1rem',
        width: '90%',
        maxWidth: '550px',
        maxHeight: '90vh',
        overflowY: 'auto',
        border: `2px solid ${APP_BG}`
    },
    modalTitle: {
        fontSize: '1.5rem',
        fontWeight: 'bold',
        marginBottom: '1.5rem',
        color: 'white'
    },
    section: {
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #374151'
    },
    sectionTitle: {
        fontSize: '0.875rem',
        fontWeight: '600',
        color: '#9CA3AF',
        marginBottom: '1rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
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
    required: {
        color: '#EF4444',
        marginLeft: '0.25rem'
    },
    hint: {
        display: 'block',
        marginTop: '0.25rem',
        fontSize: '0.75rem',
        color: '#6B7280'
    },
    input: {
        width: '100%',
        padding: '0.75rem',
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${APP_BG}`,
        borderRadius: '0.5rem',
        color: APP_ON_FG,
        fontSize: '1rem'
    },
    textarea: {
        width: '100%',
        padding: '0.75rem',
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${APP_BG}`,
        borderRadius: '0.5rem',
        color: APP_ON_FG,
        fontSize: '0.875rem',
        fontFamily: 'inherit',
        resize: 'vertical'
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
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${APP_BG}`,
        borderRadius: '0.5rem',
        color: APP_ON_FG,
        fontSize: '1rem'
    },
    modalActions: {
        display: 'flex',
        gap: '1rem',
        marginTop: '1.5rem'
    },
    saveButton: {
        flex: 1,
        padding: '0.75rem',
        background: APP_FG,
        color: APP_ON_FG,
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer'
    },
    cancelButton: {
        flex: 1,
        padding: '0.75rem',
        background: 'rgba(255,255,255,0.2)',
        color: APP_ON_FG,
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer'
    }
};

export default Sidebar;