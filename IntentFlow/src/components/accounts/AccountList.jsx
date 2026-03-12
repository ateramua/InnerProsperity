// src/components/accounts/AccountList.jsx
import React, { useState, useEffect } from 'react';
import AccountCard from './AccountCard';

const AccountList = ({ accounts, onAccountClick }) => {
    const [budgetAccounts, setBudgetAccounts] = useState([]);
    const [trackingAccounts, setTrackingAccounts] = useState([]);
    const [totals, setTotals] = useState({
        budgetTotal: 0,
        trackingTotal: 0,
        netWorth: 0
    });

    useEffect(() => {
        // Ensure accounts is an array before processing
        const accountsArray = Array.isArray(accounts) ? accounts : [];
        console.log('AccountList received:', accountsArray); // Add this for debugging
        
        // Separate accounts by type category
        const budget = accountsArray.filter(a => a?.account_type_category === 'budget');
        const tracking = accountsArray.filter(a => a?.account_type_category === 'tracking');
        
        setBudgetAccounts(budget);
        setTrackingAccounts(tracking);

        // Calculate totals
        const budgetTotal = budget.reduce((sum, a) => sum + (a?.working_balance || 0), 0);
        const trackingTotal = tracking.reduce((sum, a) => sum + (a?.working_balance || 0), 0);
        
        setTotals({
            budgetTotal,
            trackingTotal,
            netWorth: budgetTotal + trackingTotal
        });
    }, [accounts]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    // Check if accounts is empty or not an array
    const accountsArray = Array.isArray(accounts) ? accounts : [];
    if (!accountsArray || accountsArray.length === 0) {
        return (
            <div className="text-center py-12">
                <div className="text-6xl mb-4">🏦</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No accounts yet</h3>
                <p className="text-gray-500 mb-4">Get started by adding your first account</p>
                <button 
                    onClick={() => window.location.href = '/accounts/new'}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                    + Add Account
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                    <p className="text-sm text-gray-500">Budget Accounts</p>
                    <p className="text-2xl font-bold text-gray-800">{formatCurrency(totals.budgetTotal)}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
                    <p className="text-sm text-gray-500">Tracking Accounts</p>
                    <p className="text-2xl font-bold text-gray-800">{formatCurrency(totals.trackingTotal)}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                    <p className="text-sm text-gray-500">Net Worth</p>
                    <p className="text-2xl font-bold text-gray-800">{formatCurrency(totals.netWorth)}</p>
                </div>
            </div>

            {/* Budget Accounts Section */}
            {budgetAccounts.length > 0 && (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-800">Budget Accounts</h2>
                        <p className="text-xs text-gray-500">Accounts that affect your budget</p>
                    </div>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {budgetAccounts.map(account => (
                            <AccountCard key={account.id} account={account} />
                        ))}
                    </div>
                </div>
            )}

            {/* Tracking Accounts Section */}
            {trackingAccounts.length > 0 && (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-800">Tracking Accounts</h2>
                        <p className="text-xs text-gray-500">Off-budget accounts (investments, loans, etc.)</p>
                    </div>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {trackingAccounts.map(account => (
                            <AccountCard key={account.id} account={account} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountList;