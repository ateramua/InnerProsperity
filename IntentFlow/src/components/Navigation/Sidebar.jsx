// src/components/Navigation/Sidebar.jsx
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar = ({ onNavigate, currentView }) => {
    const [expandedSection, setExpandedSection] = useState(null);
    const router = useRouter();
    const { logout } = useAuth();

    // Sample account data
    const accounts = {
        cash: [
            { id: 'test4', name: 'Checking', type: 'checking', balance: 3450.89 },
            { id: 'test5', name: 'Savings', type: 'savings', balance: 5200.00 }
        ],
        credit: [
            { id: 'test6', name: 'Credit Card', type: 'credit', balance: -450.32 }
        ],
        loans: []
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
            id: 'forecast',  // ← ADD THIS NEW ITEM
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
            id: 'creditCards',
            label: 'Credit Cards',
            icon: '💳',
            description: 'Credit card accounts',
            accounts: accounts.credit
        },
        {
            id: 'loans',
            label: 'Loans',
            icon: '🏦',
            description: 'Loan accounts',
            accounts: accounts.loans
        }
    ];

    const handleNavigation = (itemId) => {
        if (itemId === 'forecast') {
            // Direct navigation to forecast page
            router.push('/forecast');
        } else if (onNavigate) {
            onNavigate(itemId);
        }
    };

    const handleAccountClick = (accountId) => {
        if (onNavigate) {
            onNavigate(`account-${accountId}`);
        }
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
                                ...(currentView === item.id ? styles.activeNavItem : {})
                            }}
                            onClick={() => {
                                if (item.accounts && item.accounts.length > 0) {
                                    toggleSection(item.id);
                                }
                                handleNavigation(item.id);
                            }}
                        >
                            <span style={styles.navIcon}>{item.icon}</span>
                            <span style={styles.navLabel}>{item.label}</span>
                            {item.accounts && item.accounts.length > 0 && (
                                <span style={styles.navChevron}>
                                    {expandedSection === item.id ? '▼' : '▶'}
                                </span>
                            )}
                        </div>

                        {/* Account Sub-items */}
                        {item.accounts && expandedSection === item.id && (
                            <div style={styles.subItems}>
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
                                                accountItem.type === 'savings' ? '💰' :
                                                    accountItem.type === 'credit' ? '💳' : '📊'}
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
                                            {new Intl.NumberFormat('en-US', {
                                                style: 'currency',
                                                currency: 'USD',
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 0
                                            }).format(accountItem.balance)}
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
        background: '#0f2e1c',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #374151',
        position: 'fixed',
        left: 0,
        top: 0
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
    subItems: {
        background: '#111827',
        padding: '4px 0'
    },
    subItem: {
        display: 'flex',
        alignItems: 'center',
        padding: '10px 20px 10px 56px',
        cursor: 'pointer',
        transition: 'background 0.2s',
        ':hover': {
            background: '#374151'
        }
    },
    activeSubItem: {
        background: '#2D3748',
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
    editButton: {
        background: 'none',
        border: 'none',
        fontSize: '0.9rem',
        cursor: 'pointer',
        opacity: 0.6,
        transition: 'opacity 0.2s',
        padding: '4px',
        ':hover': {
            opacity: 1
        }
    },
    emptyState: {
        padding: '10px 20px 10px 56px',
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
    },

};

export default Sidebar;