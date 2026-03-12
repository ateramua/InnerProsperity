// src/components/accounts/AccountCard.jsx
import React from 'react';
import { useRouter } from 'next/router';

const AccountCard = ({ account }) => {
    const router = useRouter();
    
    const getAccountIcon = (type) => {
        switch(type) {
            case 'checking': return '🏦';
            case 'savings': return '💰';
            case 'credit': return '💳';
            case 'cash': return '💵';
            case 'investment': return '📈';
            case 'mortgage': return '🏠';
            case 'loan': return '📉';
            default: return '🏦';
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    const getBalanceClass = (amount, type) => {
        if (type === 'credit' || type === 'loan' || type === 'mortgage') {
            return 'text-red-600';
        }
        return amount >= 0 ? 'text-green-600' : 'text-red-600';
    };

    const handleClick = () => {
        router.push(`/accounts/${account.id}`);
    };

    return (
        <div 
            onClick={handleClick}
            className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer border border-gray-200"
        >
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                    <span className="text-2xl">{getAccountIcon(account.type)}</span>
                    <div>
                        <h3 className="font-semibold text-gray-800">{account.name}</h3>
                        <p className="text-sm text-gray-500 capitalize">{account.type}</p>
                    </div>
                </div>
                {account.institution && (
                    <span className="text-xs text-gray-400">{account.institution}</span>
                )}
            </div>
            
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                    <p className="text-gray-500">Working</p>
                    <p className={`font-medium ${getBalanceClass(account.working_balance, account.type)}`}>
                        {formatCurrency(account.working_balance)}
                    </p>
                </div>
                <div>
                    <p className="text-gray-500">Cleared</p>
                    <p className="font-medium text-gray-700">
                        {formatCurrency(account.cleared_balance)}
                    </p>
                </div>
                <div>
                    <p className="text-gray-500">Transactions</p>
                    <p className="font-medium text-gray-700">
                        {account.transaction_count || 0}
                    </p>
                </div>
            </div>

            {account.type === 'credit' && account.credit_limit && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Credit Limit:</span>
                        <span className="font-medium">{formatCurrency(account.credit_limit)}</span>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                        <span className="text-gray-500">Available:</span>
                        <span className="font-medium text-green-600">
                            {formatCurrency(account.credit_limit - Math.abs(account.working_balance))}
                        </span>
                    </div>
                </div>
            )}

            {account.transactions_last_30_days > 0 && (
                <div className="mt-2 text-xs text-gray-400">
                    {account.transactions_last_30_days} transactions in last 30 days
                </div>
            )}
        </div>
    );
};

export default AccountCard;