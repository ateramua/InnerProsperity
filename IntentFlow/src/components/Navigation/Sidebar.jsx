// src/components/Navigation/Sidebar.jsx
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';


const Sidebar = ({ onNavigate, currentView }) => {
    const [expandedSection, setExpandedSection] = useState(null);
    const router = useRouter();
    const { logout } = useAuth();

    // Account data - all arrays start empty (will be populated from database)
    const accounts = {
        cash: [],      // Will be populated from database
        credit: [],    // Will be populated from database
        loans: []      // Will be populated from database
    };

    const navigationItems = [
        {
            id: 'moneyMap',
            label: 'Money Map',
            icon: '🗺️',
            description: 'Unified financial view'
        },
        {
            id: 'propertyMap',
            label: 'PropertyMap',
            icon: '📊',
            description: 'Budget table'
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
            id: 'allAccounts',
            label: 'All Accounts',
            icon: '📋',
            description: 'All transactions'
        },
        {
            id: 'forecast',
            label: 'Forecast',
            icon: '📈',
            description: 'Smart financial predictions'
        },
        {
            id: 'cash',
            label: 'Cash',
            icon: '💰',
            description: 'Checking & Savings',
            accounts: accounts.cash
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
                    action: 'add'
                },
                { type: 'divider' },
                // Credit accounts will be populated from database
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
                    action: 'add'
                },
                { type: 'divider' },
                // Loan accounts will be populated from database
                ...(accounts.loans && accounts.loans.length > 0
                    ? accounts.loans.map(account => ({
                        id: `account-${account.id}`,
                        label: account.name,
                        icon: '🏦',
                        balance: account.balance,
                        isAccount: true,
                        accountId: account.id,
                        type: 'account',
                        lender: account.lender,
                        interestRate: account.interestRate
                    }))
                    : [])
            ]
        }
    ];

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
        }).format(amount);
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
                                ...(isActive ? styles.activeSubItem : {})
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
                            {subItem.description && !subItem.isAccount && (
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

                {/* Show empty state for loans if no accounts */}
                {item.id === 'loans' && !hasAccounts && (
                    <div style={styles.emptyState}>
                        No loans yet. Click "Add Loan" to get started.
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={styles.sidebar}>
            {/* Header */}
            <div style={styles.header}>
                <h2 style={styles.title}>IntentFlow</h2>
                <div style={styles.version}>v1.0.0</div>
            </div>

            {/* Navigation Items */}
            <nav style={styles.nav}>
                {navigationItems.map((item) => (
                    <div key={item.id}>
                        {/* Main Navigation Item */}
                        <div
                            style={{
                                ...styles.navItem,
                                ...(currentView === item.id ? styles.activeNavItem : {}),
                                ...(item.hasSubItems ? styles.navItemWithSubItems : {})
                            }}
                            onClick={() => {
                                if (item.hasSubItems) {
                                    toggleSection(item.id);
                                } else if (item.accounts && item.accounts.length > 0) {
                                    toggleSection(item.id);
                                } else {
                                    handleNavigation(item.id);
                                }
                            }}
                        >
                            <span style={styles.navIcon}>{item.icon}</span>
                            <span style={styles.navLabel}>{item.label}</span>
                            {(item.hasSubItems || (item.accounts && item.accounts.length > 0)) && (
                                <span style={styles.navChevron}>
                                    {expandedSection === item.id ? '▼' : '▶'}
                                </span>
                            )}
                        </div>

                        {/* Render sub-items for credit cards and loans */}
                        {item.hasSubItems && renderSubItems(item)}

                        {/* Account Sub-items for cash section */}
                        {item.id === 'cash' && item.accounts && expandedSection === item.id && (
                            <div style={styles.subItemsContainer}>
                                {item.accounts.map((accountItem) => (
                                    <div
                                        key={accountItem.id}
                                        style={{
                                            ...styles.subItem,
                                            ...(currentView === `account-${accountItem.id}` ? styles.activeSubItem : {})
                                        }}
                                    >
                                        <span style={styles.subItemIcon}>
                                            {accountItem.type === 'checking' ? '🏦' :
                                                accountItem.type === 'savings' ? '💰' : '📊'}
                                        </span>
                                        <span
                                            style={styles.subItemLabel}
                                            onClick={() => handleAccountClick(accountItem.id)}
                                        >
                                            {accountItem.name}
                                        </span>
                                        <span style={{
                                            ...styles.subItemBalance,
                                            color: accountItem.balance >= 0 ? '#4ADE80' : '#F87171'
                                        }}>
                                            {formatCurrency(accountItem.balance)}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/accounts/${accountItem.id}/edit`);
                                            }}
                                            style={styles.editButton}
                                        >
                                            ✏️
                                        </button>
                                    </div>
                                ))}
                                {item.accounts.length === 0 && (
                                    <div style={styles.emptyState}>
                                        No accounts yet
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div style={styles.footer}>
                <div style={styles.footerItem} onClick={() => router.push('/settings')}>
                    <span style={styles.footerIcon}>⚙️</span>
                    <span>Settings</span>
                </div>
                <div style={styles.footerItem} onClick={() => router.push('/reports')}>
                    <span style={styles.footerIcon}>📊</span>
                    <span>Reports</span>
                </div>
                <div style={{ ...styles.footerItem, borderTop: '1px solid #374151', marginTop: '8px', paddingTop: '12px' }} onClick={handleLogout}>
                    <span style={styles.footerIcon}>🚪</span>
                    <span style={{ color: '#F87171' }}>Logout</span>
                </div>
            </div>
        </div>
    );
};

const styles = {
    sidebar: {
        width: '280px',
        height: '100vh',
        background: '#0047AB',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #374151',
        position: 'fixed',
        left: 0,
        top: 0,
        overflowY: 'auto'
    },
    header: {
        padding: '24px 20px',
        borderBottom: '1px solid #374151'
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
        color: '#9CA3AF'
    },
    nav: {
        flex: 1,
        overflowY: 'auto',
        padding: '20px 0'
    },
    navItem: {
        display: 'flex',
        alignItems: 'center',
        padding: '12px 20px',
        cursor: 'pointer',
        transition: 'background 0.2s',
        ':hover': {
            background: '#374151'
        }
    },
    navItemWithSubItems: {
        borderBottom: '1px solid transparent',
        ':hover': {
            borderBottomColor: '#374151'
        }
    },
    activeNavItem: {
        background: '#3B82F6',
        ':hover': {
            background: '#2563EB'
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
    navChevron: {
        fontSize: '0.75rem',
        color: '#9CA3AF',
        marginLeft: '8px'
    },
    subItemsContainer: {
        background: '#0A2472', // Darker blue for sub-items
        padding: '4px 0'
    },
    subItem: {
        display: 'flex',
        alignItems: 'center',
        padding: '10px 20px 10px 52px',
        cursor: 'pointer',
        transition: 'background 0.2s',
        position: 'relative',
        ':hover': {
            background: '#1E3A8A'
        }
    },
    activeSubItem: {
        background: '#1E3A8A',
        borderLeft: '3px solid #3B82F6'
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
        color: '#9CA3AF',
        marginRight: '4px',
        background: '#1F2937',
        padding: '2px 4px',
        borderRadius: '4px'
    },
    subItemTooltip: {
        fontSize: '0.8rem',
        color: '#9CA3AF',
        cursor: 'help',
        marginLeft: '4px'
    },
    editButton: {
        background: 'none',
        border: 'none',
        fontSize: '0.9rem',
        cursor: 'pointer',
        opacity: 0.6,
        transition: 'opacity 0.2s',
        padding: '4px',
        color: '#9CA3AF',
        ':hover': {
            opacity: 1,
            color: 'white'
        }
    },
    divider: {
        height: '1px',
        background: '#374151',
        margin: '8px 20px 8px 52px'
    },
    emptyState: {
        padding: '10px 20px 10px 52px',
        color: '#6B7280',
        fontSize: '0.85rem',
        fontStyle: 'italic'
    },
    footer: {
        padding: '20px',
        borderTop: '1px solid #374151'
    },
    footerItem: {
        display: 'flex',
        alignItems: 'center',
        padding: '8px 0',
        cursor: 'pointer',
        color: '#9CA3AF',
        ':hover': {
            color: 'white'
        }
    },
    footerIcon: {
        fontSize: '1.1rem',
        marginRight: '12px',
        width: '24px',
        textAlign: 'center'
    }
};

export default Sidebar;