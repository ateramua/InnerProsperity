// src/pages/accounts/[id].jsx
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const AccountDetailPage = () => {
    const router = useRouter();
    const { id } = router.query;

    const [account, setAccount] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [scheduledTransactions, setScheduledTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [categoryGroups, setCategoryGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [transactionError, setTransactionError] = useState('');
    const [showScheduledSection, setShowScheduledSection] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // ===================== LOAN/CREDIT CARD PAYMENT STATE =====================
    const [isLoanPayment, setIsLoanPayment] = useState(false);
    const [selectedLoanAccount, setSelectedLoanAccount] = useState(null);
    const [loanAccounts, setLoanAccounts] = useState([]);
    const [paymentBreakdown, setPaymentBreakdown] = useState(null);
    const [lastPaymentDate, setLastPaymentDate] = useState(null);
    const [interestAppliedThisMonth, setInterestAppliedThisMonth] = useState(false);
    
    // ===================== CREDIT CARD PAYMENT PAYEE OPTIONS =====================
    const [creditCardPaymentCategories, setCreditCardPaymentCategories] = useState([]);
    const [isCreditCardTransfer, setIsCreditCardTransfer] = useState(false);
    const [selectedCreditCardCategory, setSelectedCreditCardCategory] = useState(null);
    
    // Edit transaction states
    const [editingTransactionId, setEditingTransactionId] = useState(null);
    const [editFormData, setEditFormData] = useState({
        date: '',
        payee: '',
        categoryId: '',
        amount: '',
        memo: ''
    });
    const [isUpdating, setIsUpdating] = useState(false);
    
    // Delete transaction states
    const [selectedTransactions, setSelectedTransactions] = useState(new Set());
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    
    // Helper function to get today's date in local timezone without timezone offset
    const getTodayLocalDate = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    // Helper function to format date for display without timezone conversion
    const formatDisplayDate = (dateString) => {
        if (!dateString) return '';
        const [year, month, day] = dateString.split('-');
        return new Date(year, month - 1, day).toLocaleDateString();
    };
    
    // Helper function to format date for input (YYYY-MM-DD)
    const formatDateForInput = (dateString) => {
        if (!dateString) return getTodayLocalDate();
        if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) return dateString;
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    // Helper function to check if a date is in the future (local timezone)
    const isFutureLocalDate = (dateString) => {
        const today = getTodayLocalDate();
        return dateString > today;
    };
    
    // Transaction form with Transaction Type and Frequency
    const [transactionForm, setTransactionForm] = useState({
        transactionType: 'outflow',
        categoryId: '',
        amount: '',
        date: getTodayLocalDate(),
        payee: '',
        memo: '',
        cleared: true,
        frequency: ''
    });

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount || 0);
    };

    // Get filtered categories based on transaction type
    const getFilteredCategories = () => {
        if (transactionForm.transactionType === 'inflow') {
            return [{ id: 'inflow_ready_to_assign', name: '💰 Inflow: Ready to Assign' }];
        }
        if (!categories || categories.length === 0) {
            return [];
        }
        return categories.filter(cat => cat && !cat.archived);
    };

    // ===================== CREDIT CARD PAYMENT PAYEE HELPERS =====================
    
    // Load credit card payment categories from the "Credit Card Payments" group
    const loadCreditCardPaymentCategories = async () => {
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (userResult?.success && userResult?.data) {
                const userId = userResult.data.id;
                
                const groupsResult = await window.electronAPI.getCategoryGroups(userId);
                if (groupsResult?.success) {
                    setCategoryGroups(groupsResult.data);
                    
                    const paymentGroup = groupsResult.data.find(g => 
                        g.name === 'Credit Card Payments' || g.name.toLowerCase() === 'credit card payments'
                    );
                    
                    if (paymentGroup) {
                        const categoriesResult = await window.electronAPI.getCategories(userId);
                        if (categoriesResult?.success) {
                            const paymentCategories = categoriesResult.data.filter(cat => 
                                cat.group_id === paymentGroup.id && !cat.archived
                            );
                            setCreditCardPaymentCategories(paymentCategories);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error loading credit card payment categories:', error);
        }
    };
    
    // Generate payee options for credit card transfers
    const getCreditCardPayeeOptions = () => {
        return creditCardPaymentCategories.map(cat => ({
            value: `Payment/Transfer: ${cat.name}`,
            label: `Payment/Transfer: ${cat.name}`,
            categoryId: cat.id,
            categoryName: cat.name
        }));
    };
    
    // Check if selected payee is a credit card transfer
    const checkIfCreditCardTransfer = (payeeValue) => {
        const transferPattern = /^payment\/transfer:\s*(.+)$/i;
        const match = payeeValue?.match(transferPattern);
        
        if (match) {
            const cardName = match[1].trim();
            const matchedCategory = creditCardPaymentCategories.find(cat => 
                cat.name.toLowerCase() === cardName.toLowerCase()
            );
            
            if (matchedCategory) {
                setIsCreditCardTransfer(true);
                setSelectedCreditCardCategory(matchedCategory);
                return true;
            }
        }
        
        setIsCreditCardTransfer(false);
        setSelectedCreditCardCategory(null);
        return false;
    };
    
    // Create a transfer transaction to credit card
    const createCreditCardTransferTransaction = async (amountValue, userId) => {
        const isExpense = transactionForm.transactionType === 'outflow';
        const transactionAmount = isExpense ? -amountValue : amountValue;
        const balanceChange = isExpense ? -amountValue : amountValue;
        
        const transactionData = {
            accountId: account.id,
            date: transactionForm.date,
            payee: transactionForm.payee,
            description: transactionForm.payee,
            amount: transactionAmount,
            categoryId: null,
            memo: transactionForm.memo || `Payment to ${selectedCreditCardCategory?.name}`,
            cleared: transactionForm.cleared ? 1 : 0,
            frequency: transactionForm.frequency || null,
            isCreditCardPayment: true,
            linkedCreditCardCategoryId: selectedCreditCardCategory?.id,
            linkedCreditCardName: selectedCreditCardCategory?.name
        };
        
        const result = await window.electronAPI.addTransaction(transactionData);
        if (!result.success) {
            throw new Error(result.error || 'Failed to add credit card payment');
        }
        
        const accountsResult = await window.electronAPI.getAccountsSummary(userId);
        if (accountsResult?.success) {
            const creditCardAccount = accountsResult.data.find(acc => 
                acc.type === 'credit' && acc.name.toLowerCase() === selectedCreditCardCategory?.name.toLowerCase()
            );
            
            if (creditCardAccount) {
                const creditCardTransactionData = {
                    accountId: creditCardAccount.id,
                    date: transactionForm.date,
                    payee: `Payment/Transfer: ${account.name}`,
                    description: `Payment/Transfer: ${account.name}`,
                    amount: amountValue,
                    categoryId: null,
                    memo: transactionForm.memo || `Payment from ${account.name}`,
                    cleared: transactionForm.cleared ? 1 : 0,
                    frequency: transactionForm.frequency || null,
                    isLinkedTransfer: true,
                    sourceAccountId: account.id,
                    sourceAccountName: account.name
                };
                
                await window.electronAPI.addTransaction(creditCardTransactionData);
            }
        }
        
        const currentBalance = account.balance || 0;
        const newBalance = currentBalance + balanceChange;
        await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });
        
        return newBalance;
    };

    // Calculate balance change
    const calculateBalanceChange = (accountType, transactionType, amount) => {
        const isCreditOrLoan = accountType === 'credit' || accountType === 'loan';
        const isExpense = transactionType === 'outflow';
        const absAmount = Math.abs(amount);

        if (isCreditOrLoan) {
            return isExpense ? -absAmount : absAmount;
        } else {
            return isExpense ? -absAmount : absAmount;
        }
    };

    // Calculate balance change for a transaction (for deletion/update)
    const calculateBalanceChangeForTransaction = (transaction) => {
        const isCreditOrLoan = account.type === 'credit' || account.type === 'loan';
        
        if (isCreditOrLoan) {
            return transaction.amount > 0 ? transaction.amount : transaction.amount;
        } else {
            return transaction.amount > 0 ? -transaction.amount : Math.abs(transaction.amount);
        }
    };

    // ===================== LOAN PAYMENT HELPER FUNCTIONS =====================
    
    // Check if interest has already been applied this month
    const checkInterestAppliedThisMonth = async (loanAccountId, paymentDate) => {
        try {
            const paymentMonth = paymentDate.substring(0, 7); // YYYY-MM
            const transactionsResult = await window.electronAPI.getAccountTransactions(loanAccountId);
            if (transactionsResult?.success) {
                const interestTransactions = transactionsResult.data.filter(tx => 
                    tx.is_interest_charge === true && 
                    tx.date && tx.date.startsWith(paymentMonth)
                );
                return interestTransactions.length > 0;
            }
            return false;
        } catch (error) {
            console.error('Error checking interest applied:', error);
            return false;
        }
    };
    
    // Calculate how payment splits between interest and principal (YNAB-style)
    const calculateLoanPaymentBreakdown = (loanAccount, paymentAmount, isFirstPaymentOfMonth) => {
        if (!loanAccount || !paymentAmount || paymentAmount <= 0) return null;
        
        const balance = Math.abs(loanAccount.balance || 0);
        const apr = loanAccount.interest_rate || loanAccount.apr || 0;
        const monthlyRate = apr / 100 / 12;
        
        // YNAB: Interest is calculated monthly on the current balance
        const monthlyInterest = balance * monthlyRate;
        
        let interestPortion = 0;
        let principalPortion = 0;
        
        if (isFirstPaymentOfMonth) {
            // First payment of the month: interest is deducted first
            interestPortion = Math.min(monthlyInterest, paymentAmount);
            principalPortion = paymentAmount - interestPortion;
        } else {
            // Subsequent payments in same month: entire payment goes to principal
            interestPortion = 0;
            principalPortion = paymentAmount;
        }
        
        // Ensure principal doesn't exceed balance
        if (principalPortion > balance) {
            principalPortion = balance;
            interestPortion = paymentAmount - principalPortion;
        }
        
        const newBalance = balance - principalPortion;
        
        return {
            paymentAmount,
            interestPortion: Math.max(0, interestPortion),
            principalPortion: Math.max(0, principalPortion),
            oldBalance: balance,
            newBalance: Math.max(0, newBalance),
            interestRate: apr,
            monthlyRate: monthlyRate * 100,
            monthlyInterest: monthlyInterest,
            isFirstPaymentOfMonth
        };
    };
    
    // Create loan payment transactions (outflow in checking, inflow in loan, interest record)
    const createLoanPaymentTransaction = async (amountValue, userId) => {
        const isExpense = transactionForm.transactionType === 'outflow';
        const balanceChange = isExpense ? -amountValue : amountValue;
        
        // Check if this is the first payment of the month for interest calculation
        const isFirstPaymentOfMonth = await checkInterestAppliedThisMonth(selectedLoanAccount.id, transactionForm.date);
        
        // Calculate payment breakdown
        const breakdown = calculateLoanPaymentBreakdown(selectedLoanAccount, amountValue, isFirstPaymentOfMonth);
        if (!breakdown) {
            throw new Error('Failed to calculate payment breakdown');
        }
        
        // 1. Create OUTFLOW transaction in checking/savings account
        const outflowTransactionData = {
            accountId: account.id,
            date: transactionForm.date,
            payee: `Payment/Transfer: ${selectedLoanAccount.name}`,
            description: `Payment/Transfer: ${selectedLoanAccount.name}`,
            amount: -amountValue,
            categoryId: null,
            memo: transactionForm.memo || `Loan payment to ${selectedLoanAccount.name}`,
            cleared: transactionForm.cleared ? 1 : 0,
            frequency: transactionForm.frequency || null,
            isLoanPayment: true,
            loanAccountId: selectedLoanAccount.id,
            paymentBreakdown: breakdown
        };
        
        const outflowResult = await window.electronAPI.addTransaction(outflowTransactionData);
        if (!outflowResult.success) {
            throw new Error(outflowResult.error || 'Failed to create loan payment transaction');
        }
        
        // 2. Create INFLOW transaction in loan account (principal reduction)
        const inflowTransactionData = {
            accountId: selectedLoanAccount.id,
            date: transactionForm.date,
            payee: `Payment/Transfer: ${account.name}`,
            description: `Payment/Transfer: ${account.name}`,
            amount: breakdown.principalPortion,
            categoryId: null,
            memo: transactionForm.memo || `Payment from ${account.name}`,
            cleared: transactionForm.cleared ? 1 : 0,
            frequency: transactionForm.frequency || null,
            isLoanPaymentInflow: true,
            sourceAccountId: account.id,
            sourceAccountName: account.name,
            isPrincipalPayment: true
        };
        
        const inflowResult = await window.electronAPI.addTransaction(inflowTransactionData);
        if (!inflowResult.success) {
            throw new Error(inflowResult.error || 'Failed to create loan inflow transaction');
        }
        
        // 3. If interest was charged, create a separate INTEREST transaction in loan account
        if (breakdown.interestPortion > 0 && isFirstPaymentOfMonth) {
            const interestTransactionData = {
                accountId: selectedLoanAccount.id,
                date: transactionForm.date,
                payee: `Interest Charge - ${selectedLoanAccount.name}`,
                description: `Interest Charge - ${selectedLoanAccount.name}`,
                amount: -breakdown.interestPortion, // Negative = outflow (increases loan balance)
                categoryId: null,
                memo: `Monthly interest at ${breakdown.interestRate}% APR`,
                cleared: 1,
                isInterestCharge: true,
                interestRate: breakdown.interestRate,
                interestAmount: breakdown.interestPortion
            };
            
            const interestResult = await window.electronAPI.addTransaction(interestTransactionData);
            if (!interestResult.success) {
                console.warn('Failed to record interest transaction:', interestResult.error);
                // Don't throw - interest recording is secondary
            }
        }
        
        // 4. Update checking/savings account balance
        const currentBalance = account.balance || 0;
        const newBalance = currentBalance + balanceChange;
        await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });
        
        // 5. Update loan account balance (principal reduction)
        const currentLoanBalance = selectedLoanAccount.balance || 0;
        // Loan balance is negative, so adding positive principal reduces absolute balance
        const newLoanBalance = currentLoanBalance + breakdown.principalPortion;
        await window.electronAPI.updateAccount(selectedLoanAccount.id, userId, { balance: newLoanBalance });
        
        return { newBalance, breakdown };
    };

    // Check if payee matches a loan account
    const checkIfLoanPayment = (payeeValue) => {
        // First check if it's a credit card transfer
        if (checkIfCreditCardTransfer(payeeValue)) {
            return false;
        }
        
        if (!payeeValue || !loanAccounts.length) {
            setIsLoanPayment(false);
            setSelectedLoanAccount(null);
            setPaymentBreakdown(null);
            return false;
        }
        
        // Check for "Payment: [Account Name]" or "Transfer: [Account Name]" pattern
        const paymentPattern = /^(payment|transfer):\s*(.+)$/i;
        const match = payeeValue.match(paymentPattern);
        
        let accountName = match ? match[2].trim() : payeeValue.trim();
        
        // Find matching loan account (exclude current account)
        const matchedAccount = loanAccounts.find(acc => 
            acc.id !== account?.id &&
            acc.type === 'loan' &&
            (acc.name.toLowerCase() === accountName.toLowerCase() ||
             acc.name.toLowerCase().includes(accountName.toLowerCase()))
        );
        
        if (matchedAccount) {
            setIsLoanPayment(true);
            setSelectedLoanAccount(matchedAccount);
            
            // Preview breakdown if amount is entered
            if (transactionForm.amount && parseFloat(transactionForm.amount) > 0) {
                // Preview assumes it's the first payment of the month for UI
                const previewBreakdown = calculateLoanPaymentBreakdown(
                    matchedAccount, 
                    parseFloat(transactionForm.amount), 
                    true
                );
                setPaymentBreakdown(previewBreakdown);
            }
            return true;
        } else {
            setIsLoanPayment(false);
            setSelectedLoanAccount(null);
            setPaymentBreakdown(null);
            return false;
        }
    };

    // Load loan accounts for payment detection
    const loadLoanAccounts = async () => {
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (userResult?.success && userResult?.data) {
                const userId = userResult.data.id;
                const accountsResult = await window.electronAPI.getAccountsSummary(userId);
                
                if (accountsResult?.success) {
                    const allAccounts = accountsResult.data || [];
                    // Get all loan accounts
                    const loanAccountsOnly = allAccounts.filter(acc => acc.type === 'loan');
                    setLoanAccounts(loanAccountsOnly);
                }
            }
        } catch (error) {
            console.error('Error loading loan accounts:', error);
        }
    };

    // Start editing a transaction
    const startEditing = (transaction) => {
        setEditingTransactionId(transaction.id);
        setEditFormData({
            date: formatDateForInput(transaction.date),
            payee: transaction.payee || '',
            categoryId: transaction.category_id || '',
            amount: Math.abs(transaction.amount).toString(),
            memo: transaction.memo || ''
        });
    };

    // Cancel editing
    const cancelEditing = () => {
        setEditingTransactionId(null);
        setEditFormData({
            date: '',
            payee: '',
            categoryId: '',
            amount: '',
            memo: ''
        });
    };

    // Handle edit form changes
    const handleEditChange = (field, value) => {
        setEditFormData(prev => ({ ...prev, [field]: value }));
    };

    // Save edited transaction
    const saveEditedTransaction = async (transactionId) => {
        const amountValue = parseFloat(editFormData.amount);
        
        if (isNaN(amountValue) || amountValue === 0) {
            alert('Please enter a valid amount');
            return;
        }
        
        if (!editFormData.payee.trim()) {
            alert('Please enter a payee');
            return;
        }
        
        if (!editFormData.categoryId) {
            alert('Please select a category');
            return;
        }
        
        setIsUpdating(true);
        
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (!userResult?.success || !userResult?.data) {
                alert('Please log in to update transaction');
                return;
            }
            
            const userId = userResult.data.id;
            const originalTransaction = transactions.find(t => t.id === transactionId);
            
            if (!originalTransaction) {
                throw new Error('Transaction not found');
            }
            
            const isExpense = originalTransaction.amount < 0;
            const newIsExpense = editFormData.categoryId === 'inflow_ready_to_assign' ? false : 
                (editFormData.categoryId && categories.find(c => c.id === editFormData.categoryId)?.type === 'expense');
            
            let newAmount = amountValue;
            if (newIsExpense !== undefined) {
                newAmount = newIsExpense ? -amountValue : amountValue;
            } else {
                newAmount = isExpense ? -amountValue : amountValue;
            }
            
            const oldAmount = originalTransaction.amount;
            const amountDifference = newAmount - oldAmount;
            
            const updateData = {
                date: editFormData.date,
                payee: editFormData.payee,
                amount: newAmount,
                categoryId: editFormData.categoryId === 'inflow_ready_to_assign' ? null : editFormData.categoryId,
                memo: editFormData.memo
            };
            
            const updateResult = await window.electronAPI.updateTransaction(transactionId, updateData);
            if (!updateResult.success) {
                throw new Error(updateResult.error || 'Failed to update transaction');
            }
            
            const currentBalance = account.balance || 0;
            const newBalance = currentBalance + amountDifference;
            await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });
            
            await loadAccountData(account.id);
            
            cancelEditing();
            
            window.dispatchEvent(new CustomEvent('accounts-updated'));
            window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
            
            alert(`✅ Transaction updated successfully!\nNew balance: ${formatCurrency(newBalance)}`);
        } catch (error) {
            console.error('Error updating transaction:', error);
            alert('Error updating transaction: ' + error.message);
        } finally {
            setIsUpdating(false);
        }
    };

    // Load scheduled transactions
    const loadScheduledTransactions = async () => {
        try {
            if (window.electronAPI.getScheduledTransactions && account?.id) {
                const result = await window.electronAPI.getScheduledTransactions(account.id);
                if (result?.success) {
                    setScheduledTransactions(result.data || []);
                }
            }
        } catch (error) {
            console.error('Error loading scheduled transactions:', error);
        }
    };

    // Approve a scheduled transaction
    const handleApproveScheduled = async (scheduledTx) => {
        setRefreshing(true);
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (!userResult?.success || !userResult?.data) {
                alert('Please log in to approve transaction');
                return;
            }

            const userId = userResult.data.id;
            const isExpense = scheduledTx.transactionType === 'outflow';
            const amountValue = Math.abs(parseFloat(scheduledTx.amount));

            let transactionAmount = isExpense ? -amountValue : amountValue;
            let balanceChange = isExpense ? -amountValue : amountValue;

            const isReadyToAssign = scheduledTx.transactionType === 'inflow' &&
                scheduledTx.categoryId === 'inflow_ready_to_assign';

            const transactionData = {
                accountId: account.id,
                date: getTodayLocalDate(),
                payee: scheduledTx.payee,
                description: scheduledTx.payee,
                amount: transactionAmount,
                categoryId: isReadyToAssign ? null : scheduledTx.categoryId,
                memo: scheduledTx.memo,
                cleared: 1
            };

            const addResult = await window.electronAPI.addTransaction(transactionData);
            if (!addResult.success) {
                alert('Failed to add transaction: ' + addResult.error);
                return;
            }

            const currentBalance = account.balance || 0;
            const newBalance = currentBalance + balanceChange;
            await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });

            await window.electronAPI.deleteScheduledTransaction(scheduledTx.id);

            await loadAccountData(account.id);
            await loadScheduledTransactions();
            
            window.dispatchEvent(new CustomEvent('accounts-updated'));
            window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
            
            alert(`✅ Transaction approved and added!\nNew balance: ${formatCurrency(newBalance)}`);
        } catch (error) {
            console.error('Error approving scheduled transaction:', error);
            alert('Error approving transaction: ' + error.message);
        } finally {
            setRefreshing(false);
        }
    };

    // Reject/Delete a scheduled transaction
    const handleRejectScheduled = async (scheduledTx) => {
        if (!window.confirm(`Are you sure you want to delete this scheduled transaction?\n\nPayee: ${scheduledTx.payee}\nAmount: ${formatCurrency(scheduledTx.amount)}`)) {
            return;
        }

        setRefreshing(true);
        try {
            await window.electronAPI.deleteScheduledTransaction(scheduledTx.id);
            await loadScheduledTransactions();
            alert('✅ Scheduled transaction deleted');
        } catch (error) {
            console.error('Error deleting scheduled transaction:', error);
            alert('Error deleting transaction: ' + error.message);
        } finally {
            setRefreshing(false);
        }
    };

    // Load regular transactions
    const loadTransactions = async (id) => {
        const targetId = id || account?.id;
        if (!targetId) return;
        try {
            if (window.electronAPI?.getAccountTransactions) {
                const result = await window.electronAPI.getAccountTransactions(targetId);
                if (result.success) {
                    const today = getTodayLocalDate();
                    const regularTransactions = result.data.filter(tx => {
                        return tx.date <= today || tx.cleared === 1;
                    });
                    setTransactions(regularTransactions);
                }
            }
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    };

    // Handle transaction selection
    const handleSelectTransaction = (transactionId) => {
        const newSelected = new Set(selectedTransactions);
        if (newSelected.has(transactionId)) {
            newSelected.delete(transactionId);
        } else {
            newSelected.add(transactionId);
        }
        setSelectedTransactions(newSelected);
    };

    // Handle select all
    const handleSelectAll = () => {
        if (selectedTransactions.size === transactions.length && transactions.length > 0) {
            setSelectedTransactions(new Set());
        } else {
            const allIds = transactions.map(t => t.id);
            setSelectedTransactions(new Set(allIds));
        }
    };

    // Handle delete selected transactions
    const handleDeleteSelected = async () => {
        if (selectedTransactions.size === 0) {
            alert('Please select at least one transaction to delete.');
            return;
        }

        setShowDeleteModal(true);
    };

    // Confirm deletion
    const confirmDelete = async () => {
        setIsDeleting(true);
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (!userResult?.success || !userResult?.data) {
                alert('Please log in to delete transactions');
                return;
            }

            const userId = userResult.data.id;
            const selectedTransactionsList = transactions.filter(t => selectedTransactions.has(t.id));
            
            let totalBalanceChange = 0;
            for (const transaction of selectedTransactionsList) {
                totalBalanceChange += calculateBalanceChangeForTransaction(transaction);
            }

            for (const transaction of selectedTransactionsList) {
                const deleteResult = await window.electronAPI.deleteTransaction(transaction.id);
                if (!deleteResult.success) {
                    throw new Error(`Failed to delete transaction ${transaction.id}: ${deleteResult.error}`);
                }
            }

            const currentBalance = account.balance || 0;
            const newBalance = currentBalance + totalBalanceChange;
            await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });

            await loadAccountData(account.id);
            
            setSelectedTransactions(new Set());
            setShowDeleteModal(false);
            
            window.dispatchEvent(new CustomEvent('accounts-updated'));
            window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
            
            alert(`✅ Successfully deleted ${selectedTransactionsList.length} transaction(s)!\nNew balance: ${formatCurrency(newBalance)}`);
        } catch (error) {
            console.error('Error deleting transactions:', error);
            alert('Error deleting transactions: ' + error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        if (id) {
            loadAccountData(id);
        }
    }, [id]);

    // Load loan accounts when account is available
    useEffect(() => {
        if (account?.id) {
            loadLoanAccounts();
            loadCreditCardPaymentCategories();
        }
    }, [account?.id]);

    // Load categories and loan accounts when modal opens
    useEffect(() => {
        if (showAddModal) {
            loadCategories();
            loadLoanAccounts();
            loadCreditCardPaymentCategories();
        }
    }, [showAddModal]);

    const loadCategories = async () => {
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (userResult?.success && userResult?.data) {
                const categoriesResult = await window.electronAPI.getCategories(userResult.data.id);
                if (categoriesResult?.success) {
                    setCategories(categoriesResult.data);
                }
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    };

    const loadAccountData = async (accountId) => {
        setLoading(true);
        try {
            let accountResult = await window.electronAPI.getAccountById(accountId, 2);
            if (!accountResult?.success || !accountResult?.data) {
                accountResult = await window.electronAPI.getAccountById(accountId);
            }

            if (accountResult?.success && accountResult?.data) {
                setAccount(accountResult.data);
            }

            const transactionsResult = await window.electronAPI.getAccountTransactions(accountId);
            if (transactionsResult?.success) {
                setTransactions(transactionsResult.data || []);
            }

            await loadCategories();
            await loadScheduledTransactions();
        } catch (error) {
            console.error('Error loading account data:', error);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setTransactionForm({
            transactionType: 'outflow',
            categoryId: '',
            amount: '',
            date: getTodayLocalDate(),
            payee: '',
            memo: '',
            cleared: true,
            frequency: ''
        });
        setTransactionError('');
        setIsLoanPayment(false);
        setIsCreditCardTransfer(false);
        setSelectedLoanAccount(null);
        setSelectedCreditCardCategory(null);
        setPaymentBreakdown(null);
    };

    // Add regular transaction (for today/past dates)
    const handleAddRegularTransaction = async (amountValue, userId) => {
        const isCreditOrLoan = account.type === 'credit' || account.type === 'loan';
        const isExpense = transactionForm.transactionType === 'outflow';

        // Handle credit card transfer
        if (isCreditCardTransfer && selectedCreditCardCategory && account.type !== 'credit') {
            return await createCreditCardTransferTransaction(amountValue, userId);
        }

        // Handle loan payment (YNAB-style with interest calculation)
        if (isLoanPayment && selectedLoanAccount) {
            const result = await createLoanPaymentTransaction(amountValue, userId);
            return result.newBalance;
        }

        // Handle regular transaction
        if (isCreditOrLoan) {
            if (isExpense) {
                transactionAmount = -amountValue;
                balanceChange = -amountValue;
            } else {
                transactionAmount = amountValue;
                balanceChange = amountValue;
            }
        } else {
            if (isExpense) {
                transactionAmount = -amountValue;
                balanceChange = -amountValue;
            } else {
                transactionAmount = amountValue;
                balanceChange = amountValue;
            }
        }

        const isReadyToAssign = transactionForm.transactionType === 'inflow' &&
            transactionForm.categoryId === 'inflow_ready_to_assign';

        const transactionData = {
            accountId: account.id,
            date: transactionForm.date,
            payee: transactionForm.payee,
            description: transactionForm.payee,
            amount: transactionAmount,
            categoryId: isReadyToAssign ? null : transactionForm.categoryId,
            memo: transactionForm.memo,
            cleared: transactionForm.cleared ? 1 : 0,
            frequency: transactionForm.frequency || null
        };

        const result = await window.electronAPI.addTransaction(transactionData);
        if (!result.success) {
            throw new Error(result.error || 'Failed to add transaction');
        }

        const currentBalance = account.balance || 0;
        const newBalance = currentBalance + balanceChange;
        await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });
        
        return newBalance;
    };

    // Add scheduled transaction
    const handleAddScheduledTransaction = async (amountValue, userId) => {
        const scheduledData = {
            accountId: account.id,
            date: transactionForm.date,
            payee: transactionForm.payee,
            amount: amountValue,
            transactionType: transactionForm.transactionType,
            categoryId: transactionForm.categoryId,
            memo: transactionForm.memo,
            userId: userId,
            status: 'pending',
            frequency: transactionForm.frequency || null,
            isLoanPayment: isLoanPayment,
            loanAccountId: selectedLoanAccount?.id,
            paymentBreakdown: paymentBreakdown,
            isCreditCardTransfer: isCreditCardTransfer,
            selectedCreditCardCategory: selectedCreditCardCategory
        };

        if (!window.electronAPI.addScheduledTransaction) {
            throw new Error('Scheduled transactions not supported yet');
        }

        const result = await window.electronAPI.addScheduledTransaction(scheduledData);
        if (!result.success) {
            throw new Error(result.error || 'Failed to add scheduled transaction');
        }
        
        return null;
    };

    // Main handler - decides between regular and scheduled
    const handleAddTransaction = async () => {
        setTransactionError('');

        const amountValue = parseFloat(transactionForm.amount);
        const isFuture = isFutureLocalDate(transactionForm.date);
        
        if (isNaN(amountValue) || amountValue === 0) {
            setTransactionError('Please enter a valid amount');
            return;
        }

        if (!transactionForm.payee.trim()) {
            setTransactionError('Please enter a payee');
            return;
        }

        // For loan payments or credit card transfers, category is auto-managed
        if (!isLoanPayment && !isCreditCardTransfer && !transactionForm.categoryId) {
            setTransactionError('Please select a category');
            return;
        }

        setIsSubmitting(true);

        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (!userResult?.success || !userResult?.data) {
                setTransactionError('Please log in to add transaction');
                return;
            }

            const userId = userResult.data.id;

            if (isFuture) {
                await handleAddScheduledTransaction(amountValue, userId);
                await loadScheduledTransactions();
                const [year, month, day] = transactionForm.date.split('-');
                const displayDate = new Date(year, month - 1, day).toLocaleDateString();
                let frequencyMessage = '';
                if (transactionForm.frequency) {
                    frequencyMessage = `\n\n🔄 This is a ${transactionForm.frequency} recurring transaction.`;
                }
                let loanMessage = '';
                if (isLoanPayment && selectedLoanAccount) {
                    loanMessage = `\n\n🏦 This is a payment to ${selectedLoanAccount.name}. Interest will be calculated on the approval date.`;
                }
                alert(`📅 Scheduled transaction added for ${displayDate}${frequencyMessage}${loanMessage}\n\nThis will NOT affect your balance until approved.`);
            } else {
                const newBalance = await handleAddRegularTransaction(amountValue, userId);
                await loadAccountData(account.id);
                let frequencyMessage = '';
                if (transactionForm.frequency) {
                    frequencyMessage = `\n\n🔄 This is a ${transactionForm.frequency} recurring transaction.`;
                }
                let loanMessage = '';
                if (isLoanPayment && selectedLoanAccount && paymentBreakdown) {
                    loanMessage = `\n\n🏦 Payment to ${selectedLoanAccount.name}:\n   • Total Payment: ${formatCurrency(paymentBreakdown.paymentAmount)}\n   • Interest: ${formatCurrency(paymentBreakdown.interestPortion)}\n   • Principal: ${formatCurrency(paymentBreakdown.principalPortion)}\n   • New Balance: ${formatCurrency(paymentBreakdown.newBalance)}`;
                    
                    if (paymentBreakdown.isFirstPaymentOfMonth && paymentBreakdown.interestPortion > 0) {
                        loanMessage += `\n\n💡 Interest calculated at ${paymentBreakdown.interestRate}% APR (${paymentBreakdown.monthlyRate.toFixed(2)}% monthly)`;
                    } else if (!paymentBreakdown.isFirstPaymentOfMonth && paymentBreakdown.interestPortion === 0) {
                        loanMessage += `\n\n💡 Since you've already made a payment this month, the entire payment goes to principal (no additional interest).`;
                    }
                }
                alert(`✅ Transaction added successfully!${frequencyMessage}${loanMessage}\n\nNew balance: ${formatCurrency(newBalance)}`);
            }
            
            window.dispatchEvent(new CustomEvent('accounts-updated'));
            window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

            resetForm();
            setShowAddModal(false);
            
        } catch (error) {
            console.error('Error adding transaction:', error);
            setTransactionError(error.message || 'An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBackToLanding = () => {
        router.push('/');
    };

    // Build payee options including loan transfers
    const getPayeeOptions = () => {
        const loanOptions = loanAccounts.map(loan => ({
            value: `Payment/Transfer: ${loan.name}`,
            label: `Payment/Transfer: ${loan.name}`,
            type: 'loan',
            accountId: loan.id
        }));
        
        const creditCardOptions = getCreditCardPayeeOptions().map(opt => ({
            ...opt,
            type: 'credit'
        }));
        
        return [...loanOptions, ...creditCardOptions];
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
                <Link href="/accounts" style={styles.backLink}>← Back to Accounts</Link>
            </div>
        );
    }

    const filteredCategories = getFilteredCategories();
    const isFutureDate = isFutureLocalDate(transactionForm.date);
    const payeeOptions = getPayeeOptions();

    const frequencyOptions = [
        { value: '', label: 'No recurrence (one-time)' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'bi-weekly', label: 'Bi-Weekly (every 2 weeks)' },
        { value: 'monthly', label: 'Monthly' }
    ];

    // Determine if this is a checking/savings account (where transfers make sense)
    const isCashAccount = account.type === 'checking' || account.type === 'savings';

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <button onClick={handleBackToLanding} style={styles.backButton}>← Back to Home</button>
                    <div>
                        <h1 style={styles.title}>{account.name}</h1>
                        <div style={styles.accountMeta}>
                            <span style={styles.accountType}>{account.type}</span>
                            {account.institution && <span style={styles.institution}>• {account.institution}</span>}
                        </div>
                    </div>
                </div>
                <div style={styles.headerRight}>
                    <div style={styles.balanceContainer}>
                        <div style={styles.balanceLabel}>Current Balance</div>
                        <div style={{ ...styles.balance, color: account.balance >= 0 ? '#4ADE80' : '#F87171' }}>
                            {formatCurrency(account.balance)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Scheduled Transactions Section */}
            {scheduledTransactions.length > 0 && (
                <div style={styles.scheduledSection}>
                    <div 
                        style={styles.scheduledHeader} 
                        onClick={() => setShowScheduledSection(!showScheduledSection)}
                    >
                        <span style={styles.scheduledHeaderLeft}>
                            <span style={styles.scheduledIcon}>📅</span>
                            <span style={styles.scheduledTitle}>Scheduled Transactions</span>
                            <span style={styles.scheduledCount}>({scheduledTransactions.length})</span>
                        </span>
                        <span style={styles.scheduledToggle}>{showScheduledSection ? '▼' : '▶'}</span>
                    </div>
                    
                    {showScheduledSection && (
                        <div style={styles.scheduledList}>
                            {scheduledTransactions.map(tx => {
                                const category = categories.find(c => c.id === tx.categoryId);
                                return (
                                    <div key={tx.id} style={styles.scheduledItem}>
                                        <div style={styles.scheduledDate}>
                                            {formatDisplayDate(tx.date)}
                                        </div>
                                        <div style={styles.scheduledInfo}>
                                            <div style={styles.scheduledPayee}>{tx.payee}</div>
                                            <div style={styles.scheduledCategory}>
                                                {tx.isLoanPayment ? '🏦 Loan Payment' : 
                                                 tx.isCreditCardTransfer ? '💳 Credit Card Transfer' : 
                                                 (category?.name || 'Uncategorized')}
                                            </div>
                                            {tx.frequency && (
                                                <div style={styles.scheduledFrequency}>
                                                    🔄 {tx.frequency}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{
                                            ...styles.scheduledAmount,
                                            color: tx.transactionType === 'outflow' ? '#F87171' : '#4ADE80'
                                        }}>
                                            {tx.transactionType === 'outflow' ? '-' : '+'}{formatCurrency(tx.amount)}
                                        </div>
                                        <div style={styles.scheduledActions}>
                                            <button 
                                                onClick={() => handleApproveScheduled(tx)} 
                                                style={styles.approveButton}
                                                disabled={refreshing}
                                            >
                                                ✅ Approve
                                            </button>
                                            <button 
                                                onClick={() => handleRejectScheduled(tx)} 
                                                style={styles.rejectButton}
                                                disabled={refreshing}
                                            >
                                                ❌ Reject
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Add Transaction Button and Delete Controls */}
            <div style={styles.transactionsHeader}>
                <h2 style={styles.transactionsTitle}>Transactions</h2>
                <div style={styles.headerButtons}>
                    {selectedTransactions.size > 0 && (
                        <button 
                            onClick={handleDeleteSelected} 
                            style={styles.deleteSelectedButton}
                        >
                            🗑️ Delete Selected ({selectedTransactions.size})
                        </button>
                    )}
                    <button onClick={() => setShowAddModal(true)} style={styles.addTransactionButton}>
                        <span style={styles.buttonIcon}>+</span> Add Transaction
                    </button>
                </div>
            </div>

            {/* Transaction List */}
            <div style={styles.transactionsList}>
                {transactions.length === 0 ? (
                    <div style={styles.emptyTransactions}>
                        No transactions yet. Click <button 
                            onClick={() => setShowAddModal(true)} 
                            style={styles.emptyAddButton}
                        >+ Add Your First Transaction</button> to get started.
                    </div>
                ) : (
                    <>
                        {/* Header Row with Select All */}
                        <div style={styles.transactionHeaderRow}>
                            <div style={styles.checkboxCell}>
                                <input
                                    type="checkbox"
                                    checked={selectedTransactions.size === transactions.length && transactions.length > 0}
                                    onChange={handleSelectAll}
                                    style={styles.checkbox}
                                />
                            </div>
                            <div style={styles.transactionDateHeader}>Date</div>
                            <div style={styles.transactionPayeeHeader}>Payee</div>
                            <div style={styles.transactionCategoryHeader}>Category</div>
                            <div style={styles.transactionAmountHeader}>Amount</div>
                            <div style={styles.transactionActionsHeader}>Actions</div>
                        </div>
                        
                        {/* Transaction Rows with Inline Editing */}
                        {transactions.map(transaction => {
                            const category = categories.find(c => c.id === transaction.category_id);
                            const isEditing = editingTransactionId === transaction.id;
                            
                            if (isEditing) {
                                const editCategories = categories.filter(cat => cat && !cat.archived);
                                
                                return (
                                    <div key={transaction.id} style={styles.transactionRowEditing}>
                                        <div style={styles.checkboxCell}>
                                            <input
                                                type="checkbox"
                                                checked={selectedTransactions.has(transaction.id)}
                                                onChange={() => handleSelectTransaction(transaction.id)}
                                                style={styles.checkbox}
                                                disabled={true}
                                            />
                                        </div>
                                        <div style={styles.transactionDate}>
                                            <input
                                                type="date"
                                                value={editFormData.date}
                                                onChange={(e) => handleEditChange('date', e.target.value)}
                                                style={styles.editInput}
                                            />
                                        </div>
                                        <div style={styles.transactionPayee}>
                                            <input
                                                type="text"
                                                value={editFormData.payee}
                                                onChange={(e) => handleEditChange('payee', e.target.value)}
                                                style={styles.editInput}
                                                placeholder="Payee"
                                            />
                                        </div>
                                        <div style={styles.transactionCategory}>
                                            <select
                                                value={editFormData.categoryId}
                                                onChange={(e) => handleEditChange('categoryId', e.target.value)}
                                                style={styles.editSelect}
                                            >
                                                <option value="">Select category</option>
                                                {editCategories.map(cat => (
                                                    <option key={cat.id} value={cat.id}>
                                                        {cat.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={styles.transactionAmount}>
                                            <div style={styles.editAmountWrapper}>
                                                <span style={styles.currencySymbolSmall}>$</span>
                                                <input
                                                    type="number"
                                                    value={editFormData.amount}
                                                    onChange={(e) => handleEditChange('amount', e.target.value)}
                                                    style={styles.editAmountInput}
                                                    step="0.01"
                                                    min="0"
                                                />
                                            </div>
                                        </div>
                                        <div style={styles.transactionActions}>
                                            <button 
                                                onClick={() => saveEditedTransaction(transaction.id)} 
                                                style={styles.saveButton}
                                                disabled={isUpdating}
                                            >
                                                {isUpdating ? '💾 Saving...' : '💾 Save'}
                                            </button>
                                            <button 
                                                onClick={cancelEditing} 
                                                style={styles.cancelButton}
                                                disabled={isUpdating}
                                            >
                                                ✕ Cancel
                                            </button>
                                        </div>
                                    </div>
                                );
                            } else {
                                return (
                                    <div key={transaction.id} style={styles.transactionRow}>
                                        <div style={styles.checkboxCell}>
                                            <input
                                                type="checkbox"
                                                checked={selectedTransactions.has(transaction.id)}
                                                onChange={() => handleSelectTransaction(transaction.id)}
                                                style={styles.checkbox}
                                            />
                                        </div>
                                        <div style={styles.transactionDate}>{formatDisplayDate(transaction.date)}</div>
                                        <div style={styles.transactionPayee}>
                                            {transaction.payee}
                                            {transaction.isLoanPayment && (
                                                <div style={styles.loanPaymentBadgeSmall}>🏦 Loan Payment</div>
                                            )}
                                            {transaction.isCreditCardPayment && (
                                                <div style={styles.creditCardPaymentBadgeSmall}>💳 Credit Card Payment</div>
                                            )}
                                        </div>
                                        <div style={styles.transactionCategory}>
                                            {transaction.isLoanPayment ? '🏦 Loan Transfer' : 
                                             transaction.isCreditCardPayment ? '💳 Credit Card Transfer' : 
                                             (category?.name || (transaction.category_id === null ? 'Ready to Assign' : 'Uncategorized'))}
                                        </div>
                                        <div style={{ ...styles.transactionAmount, color: transaction.amount < 0 ? '#F87171' : '#4ADE80' }}>
                                            {formatCurrency(transaction.amount)}
                                        </div>
                                        <div style={styles.transactionActions}>
                                            <button 
                                                onClick={() => startEditing(transaction)} 
                                                style={styles.editButton}
                                            >
                                                ✏️ Edit
                                            </button>
                                        </div>
                                    </div>
                                );
                            }
                        })}
                    </>
                )}
            </div>

            {/* Add Transaction Modal */}
            {showAddModal && (
                <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
                    <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div style={styles.modalHeader}>
                            <h3 style={styles.modalTitle}>Add Transaction</h3>
                            <button style={styles.closeButton} onClick={() => setShowAddModal(false)}>✕</button>
                        </div>

                        <div style={styles.modalBody}>
                            {transactionError && <div style={styles.errorMessage}>⚠️ {transactionError}</div>}

                            {/* Account Display */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Account</label>
                                <div style={styles.accountDisplay}>
                                    {account.name} ({account.type}) - Balance: {formatCurrency(account.balance)}
                                </div>
                            </div>

                            {/* Transaction Type Dropdown */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Transaction Type *</label>
                                <select
                                    value={transactionForm.transactionType}
                                    onChange={(e) => {
                                        setTransactionForm({
                                            ...transactionForm,
                                            transactionType: e.target.value,
                                            categoryId: ''
                                        });
                                    }}
                                    style={styles.select}
                                    disabled={isLoanPayment || isCreditCardTransfer}
                                >
                                    <option value="outflow">Outflow (Expense)</option>
                                    <option value="inflow">Inflow (Income/Payment)</option>
                                </select>
                            </div>

                            {/* Payee Dropdown with Transfer Options */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Payee *</label>
                                {isCashAccount && payeeOptions.length > 0 ? (
                                    <select
                                        value={transactionForm.payee}
                                        onChange={(e) => {
                                            const newPayee = e.target.value;
                                            setTransactionForm({ ...transactionForm, payee: newPayee });
                                            checkIfCreditCardTransfer(newPayee);
                                            checkIfLoanPayment(newPayee);
                                        }}
                                        style={styles.select}
                                    >
                                        <option value="">-- Select Payee --</option>
                                        {payeeOptions.length > 0 && (
                                            <optgroup label="🏦 Loan Payments (Transfer)">
                                                {payeeOptions.filter(opt => opt.type === 'loan').map(option => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {creditCardPaymentCategories.length > 0 && (
                                            <optgroup label="💳 Credit Card Payments (Transfer)">
                                                {payeeOptions.filter(opt => opt.type === 'credit').map(option => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        <option value="other">Other (Type manually)</option>
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={transactionForm.payee}
                                        onChange={(e) => {
                                            const newPayee = e.target.value;
                                            setTransactionForm({ ...transactionForm, payee: newPayee });
                                            checkIfCreditCardTransfer(newPayee);
                                            checkIfLoanPayment(newPayee);
                                        }}
                                        style={styles.input}
                                        placeholder={isLoanPayment ? `Payment/Transfer: ${selectedLoanAccount?.name || 'Loan'}` : "e.g., Starbucks, Rent, Paycheck"}
                                    />
                                )}
                                {isCashAccount && payeeOptions.length > 0 && transactionForm.payee !== 'other' && (
                                    <div style={styles.payeeHint}>
                                        💡 Select a loan or credit card to record a payment transfer. Category will be auto-managed.
                                    </div>
                                )}
                            </div>

                            {/* Category Dropdown - Grayed out for transfers */}
                            <div style={styles.formGroup}>
                                <label style={{ ...styles.label, ...((isLoanPayment || isCreditCardTransfer) ? styles.disabledLabel : {}) }}>
                                    Category {(isLoanPayment || isCreditCardTransfer) && <span style={styles.autoManagedBadge}>(Auto-managed for transfer)</span>}
                                </label>
                                {(isLoanPayment || isCreditCardTransfer) ? (
                                    <div style={styles.transferPaymentInfo}>
                                        <div style={styles.transferPaymentBadge}>
                                            {isLoanPayment ? '🏦 Loan Payment (Transfer)' : '💳 Credit Card Payment (Transfer)'}
                                        </div>
                                        <div style={styles.transferPaymentMessage}>
                                            {isLoanPayment ? (
                                                <>This is a payment transfer to <strong>{selectedLoanAccount?.name}</strong>.<br />
                                                The payment will be split: interest first, then principal.<br />
                                                A corresponding inflow will appear in your loan account.</>
                                            ) : (
                                                <>This is a payment transfer to <strong>{selectedCreditCardCategory?.name}</strong>.<br />
                                                The category is automatically managed. This will appear as an inflow in your credit card account.</>
                                            )}
                                        </div>
                                        {isLoanPayment && paymentBreakdown && paymentBreakdown.paymentAmount > 0 && (
                                            <div style={styles.paymentBreakdown}>
                                                <div style={styles.breakdownTitle}>Payment Breakdown (YNAB-style):</div>
                                                <div style={styles.breakdownRow}>
                                                    <span>Total Payment:</span>
                                                    <strong>${paymentBreakdown.paymentAmount.toFixed(2)}</strong>
                                                </div>
                                                <div style={styles.breakdownRow}>
                                                    <span>Interest Portion:</span>
                                                    <strong style={{ color: '#F59E0B' }}>${paymentBreakdown.interestPortion.toFixed(2)}</strong>
                                                </div>
                                                <div style={styles.breakdownRow}>
                                                    <span>Principal Reduction:</span>
                                                    <strong style={{ color: '#10B981' }}>${paymentBreakdown.principalPortion.toFixed(2)}</strong>
                                                </div>
                                                <div style={styles.breakdownRow}>
                                                    <span>Remaining Balance:</span>
                                                    <strong>${paymentBreakdown.newBalance.toFixed(2)}</strong>
                                                </div>
                                                <div style={styles.breakdownNote}>
                                                    ℹ️ Interest calculated at {paymentBreakdown.interestRate}% APR ({paymentBreakdown.monthlyRate.toFixed(2)}% monthly)
                                                    {paymentBreakdown.isFirstPaymentOfMonth ? 
                                                        ' - First payment of the month (interest applied)' : 
                                                        ' - Subsequent payment this month (no additional interest)'}
                                                </div>
                                            </div>
                                        )}
                                        {isCreditCardTransfer && (
                                            <div style={styles.transferNote}>
                                                💡 Tip: This payment will reduce your credit card balance. No budget category is needed since you already categorized the original spending.
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <select
                                        value={transactionForm.categoryId}
                                        onChange={(e) => setTransactionForm({ ...transactionForm, categoryId: e.target.value })}
                                        style={styles.select}
                                    >
                                        <option value="">Select a category</option>
                                        {filteredCategories.map(category => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Amount */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Amount *</label>
                                <div style={styles.inputWrapper}>
                                    <span style={styles.currencySymbol}>$</span>
                                    <input
                                        type="number"
                                        value={transactionForm.amount}
                                        onChange={(e) => {
                                            const newAmount = e.target.value;
                                            setTransactionForm({ ...transactionForm, amount: newAmount });
                                            if (isLoanPayment && selectedLoanAccount && newAmount && parseFloat(newAmount) > 0) {
                                                // Preview breakdown (assumes first payment of month for UI)
                                                const breakdown = calculateLoanPaymentBreakdown(
                                                    selectedLoanAccount, 
                                                    parseFloat(newAmount), 
                                                    true
                                                );
                                                setPaymentBreakdown(breakdown);
                                            }
                                        }}
                                        style={styles.modalInput}
                                        placeholder="0.00"
                                        step="0.01"
                                        min="0"
                                    />
                                </div>
                            </div>

                            {/* Date */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Date *</label>
                                <input
                                    type="date"
                                    value={transactionForm.date}
                                    onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
                                    style={styles.input}
                                />
                                {isFutureDate && (
                                    <div style={styles.futureDateWarning}>
                                        📅 Future date detected. This will be saved as a <strong>scheduled transaction</strong> and will NOT affect your balance until approved on {formatDisplayDate(transactionForm.date)}.
                                    </div>
                                )}
                            </div>

                            {/* Frequency Field */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Frequency (Optional)</label>
                                <select
                                    value={transactionForm.frequency}
                                    onChange={(e) => setTransactionForm({ ...transactionForm, frequency: e.target.value })}
                                    style={styles.select}
                                >
                                    {frequencyOptions.map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <div style={styles.hint}>
                                    💡 Set how often this transaction repeats. Leave as "No recurrence" for one-time transactions.
                                </div>
                            </div>

                            {/* Memo */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Memo (Optional)</label>
                                <input
                                    type="text"
                                    value={transactionForm.memo}
                                    onChange={(e) => setTransactionForm({ ...transactionForm, memo: e.target.value })}
                                    style={styles.input}
                                    placeholder="Additional notes"
                                />
                            </div>

                            {/* Cleared Checkbox - only for non-future dates */}
                            {!isFutureDate && (
                                <div style={styles.checkboxGroup}>
                                    <label style={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={transactionForm.cleared}
                                            onChange={(e) => setTransactionForm({ ...transactionForm, cleared: e.target.checked })}
                                            style={styles.checkbox}
                                        />
                                        Mark as cleared
                                    </label>
                                </div>
                            )}

                            {/* Balance Preview - only for non-transfer transactions */}
                            {!isFutureDate && transactionForm.amount && parseFloat(transactionForm.amount) > 0 && !isCreditCardTransfer && !isLoanPayment && (
                                <div style={styles.balancePreview}>
                                    <div style={styles.balancePreviewLabel}>New Balance after transaction:</div>
                                    <div style={{
                                        ...styles.balancePreviewValue,
                                        color: transactionForm.transactionType === 'outflow' ? '#F87171' : '#4ADE80'
                                    }}>
                                        {formatCurrency(account.balance + calculateBalanceChange(
                                            account.type,
                                            transactionForm.transactionType,
                                            parseFloat(transactionForm.amount) || 0
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={styles.modalFooter}>
                            <button style={styles.cancelModalButton} onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button style={styles.submitButton} onClick={handleAddTransaction} disabled={isSubmitting}>
                                {isSubmitting ? 'Adding...' : (isFutureDate ? '📅 Schedule Transaction' : 'Add Transaction')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div style={styles.modalOverlay} onClick={() => !isDeleting && setShowDeleteModal(false)}>
                    <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div style={styles.modalHeader}>
                            <h3 style={styles.modalTitle}>Confirm Delete</h3>
                            <button style={styles.closeButton} onClick={() => !isDeleting && setShowDeleteModal(false)}>✕</button>
                        </div>
                        
                        <div style={styles.modalBody}>
                            <p style={styles.confirmText}>
                                Are you sure you want to delete <strong>{selectedTransactions.size}</strong> transaction(s)?
                            </p>
                            <div style={styles.confirmDetails}>
                                <div style={styles.confirmDetailItem}>
                                    <span>Current Balance:</span>
                                    <strong>{formatCurrency(account.balance)}</strong>
                                </div>
                                {(() => {
                                    const selectedTransactionsList = transactions.filter(t => selectedTransactions.has(t.id));
                                    const totalImpact = selectedTransactionsList.reduce((sum, t) => sum + calculateBalanceChangeForTransaction(t), 0);
                                    return (
                                        <div style={styles.confirmDetailItem}>
                                            <span>Balance Change:</span>
                                            <strong style={{ color: totalImpact >= 0 ? '#4ADE80' : '#F87171' }}>
                                                {totalImpact >= 0 ? '+' : ''}{formatCurrency(totalImpact)}
                                            </strong>
                                        </div>
                                    );
                                })()}
                                <div style={styles.confirmDetailItem}>
                                    <span>New Balance:</span>
                                    <strong style={{ color: '#4ADE80' }}>
                                        {formatCurrency(account.balance + transactions.filter(t => selectedTransactions.has(t.id)).reduce((sum, t) => sum + calculateBalanceChangeForTransaction(t), 0))}
                                    </strong>
                                </div>
                            </div>
                            <p style={styles.confirmWarning}>
                                ⚠️ This action cannot be undone.
                            </p>
                        </div>
                        
                        <div style={styles.modalFooter}>
                            <button 
                                style={styles.cancelModalButton} 
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                            <button 
                                style={styles.deleteConfirmButton} 
                                onClick={confirmDelete}
                                disabled={isDeleting}
                            >
                                {isDeleting ? 'Deleting...' : `Delete ${selectedTransactions.size} Transaction(s)`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
        fontSize: '1rem',
        padding: '0.5rem 1rem',
        background: '#1E3A8A',
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
    scheduledSection: {
        maxWidth: '1200px',
        margin: '0 auto 2rem',
        background: '#1E3A8A',
        borderRadius: '0.75rem',
        border: '1px solid #374151',
        overflow: 'hidden',
    },
    scheduledHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 1.5rem',
        background: '#1E3A8A',
        cursor: 'pointer',
        borderBottom: '1px solid #1E3A8A',
    },
    scheduledHeaderLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    scheduledIcon: {
        fontSize: '1.25rem',
    },
    scheduledTitle: {
        fontSize: '1rem',
        fontWeight: '600',
        color: '#F59E0B',
    },
    scheduledCount: {
        fontSize: '0.875rem',
        color: '#9CA3AF',
    },
    scheduledToggle: {
        fontSize: '0.75rem',
        color: '#9CA3AF',
    },
    scheduledList: {
        padding: '0.5rem',
    },
    scheduledItem: {
        display: 'flex',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid #1E3A8A',
        gap: '1rem',
        ':last-child': {
            borderBottom: 'none',
        },
    },
    scheduledDate: {
        width: '90px',
        fontSize: '0.75rem',
        color: '#9CA3AF',
    },
    scheduledInfo: {
        flex: 2,
    },
    scheduledPayee: {
        fontSize: '0.875rem',
        color: 'white',
        fontWeight: '500',
    },
    scheduledCategory: {
        fontSize: '0.7rem',
        color: '#6B7280',
    },
    scheduledFrequency: {
        fontSize: '0.6rem',
        color: '#F59E0B',
        marginTop: '0.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem'
    },
    scheduledAmount: {
        fontSize: '0.875rem',
        fontWeight: '600',
        minWidth: '80px',
        textAlign: 'right',
    },
    scheduledActions: {
        display: 'flex',
        gap: '0.5rem',
    },
    approveButton: {
        padding: '0.25rem 0.75rem',
        background: '#10B981',
        color: 'white',
        border: 'none',
        borderRadius: '0.375rem',
        fontSize: '0.7rem',
        cursor: 'pointer',
        ':disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
        },
    },
    rejectButton: {
        padding: '0.25rem 0.75rem',
        background: '#EF4444',
        color: 'white',
        border: 'none',
        borderRadius: '0.375rem',
        fontSize: '0.7rem',
        cursor: 'pointer',
        ':disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
        },
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
    headerButtons: {
        display: 'flex',
        gap: '1rem',
        alignItems: 'center'
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
    deleteSelectedButton: {
        background: '#EF4444',
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
    transactionsList: {
        maxWidth: '1200px',
        margin: '0 auto',
        background: '#1E3A8A',
        borderRadius: '0.75rem',
        overflow: 'hidden'
    },
    transactionHeaderRow: {
        display: 'flex',
        alignItems: 'center',
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #1E3A8A',
        gap: '1rem',
        background: '#1E3A8A',
        fontWeight: '600',
        color: '#9CA3AF',
        fontSize: '0.875rem'
    },
    transactionRow: {
        display: 'flex',
        alignItems: 'center',
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #1E3A8A',
        gap: '1rem',
        transition: 'background-color 0.2s',
        ':hover': {
            background: '#1E3A8A'
        }
    },
    transactionRowEditing: {
        display: 'flex',
        alignItems: 'center',
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #1E3A8A',
        gap: '1rem',
        background: 'rgba(16, 185, 129, 0.1)'
    },
    checkboxCell: {
        width: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    checkbox: {
        width: '18px',
        height: '18px',
        cursor: 'pointer'
    },
    transactionDate: {
        width: '100px',
        color: '#9CA3AF',
        fontSize: '0.875rem'
    },
    transactionDateHeader: {
        width: '100px'
    },
    transactionPayee: {
        flex: 2,
        color: 'white',
        fontWeight: '500'
    },
    transactionPayeeHeader: {
        flex: 2
    },
    transactionCategory: {
        flex: 1,
        color: '#9CA3AF',
        fontSize: '0.875rem'
    },
    transactionCategoryHeader: {
        flex: 1
    },
    transactionAmount: {
        width: '120px',
        textAlign: 'right',
        fontWeight: '600'
    },
    transactionAmountHeader: {
        width: '120px',
        textAlign: 'right'
    },
    transactionActions: {
        width: '100px',
        textAlign: 'center'
    },
    transactionActionsHeader: {
        width: '100px',
        textAlign: 'center'
    },
    editButton: {
        background: '#3B82F6',
        color: 'white',
        border: 'none',
        padding: '0.25rem 0.75rem',
        borderRadius: '0.375rem',
        fontSize: '0.7rem',
        cursor: 'pointer'
    },
    saveButton: {
        background: '#10B981',
        color: 'white',
        border: 'none',
        padding: '0.25rem 0.75rem',
        borderRadius: '0.375rem',
        fontSize: '0.7rem',
        cursor: 'pointer',
        marginRight: '0.5rem'
    },
    cancelButton: {
        background: '#6B7280',
        color: 'white',
        border: 'none',
        padding: '0.25rem 0.75rem',
        borderRadius: '0.375rem',
        fontSize: '0.7rem',
        cursor: 'pointer'
    },
    editInput: {
        width: '90%',
        padding: '0.4rem',
        background: '#1E3A8A',
        border: '1px solid #10B981',
        borderRadius: '0.375rem',
        color: 'white',
        fontSize: '0.875rem'
    },
    editSelect: {
        width: '90%',
        padding: '0.4rem',
        background: '#1E3A8A',
        border: '1px solid #10B981',
        borderRadius: '0.375rem',
        color: 'white',
        fontSize: '0.875rem',
        cursor: 'pointer'
    },
    editAmountWrapper: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center'
    },
    currencySymbolSmall: {
        position: 'absolute',
        left: '0.5rem',
        color: '#9CA3AF',
        fontSize: '0.7rem'
    },
    editAmountInput: {
        width: '100%',
        padding: '0.4rem 0.4rem 0.4rem 1.5rem',
        background: '#1E3A8A',
        border: '1px solid #10B981',
        borderRadius: '0.375rem',
        color: 'white',
        fontSize: '0.875rem',
        textAlign: 'right'
    },
    emptyTransactions: {
        padding: '3rem',
        textAlign: 'center',
        color: '#6B7280'
    },
    emptyAddButton: {
        background: '#10B981',
        color: 'white',
        border: 'none',
        padding: '0.5rem 1rem',
        borderRadius: '0.5rem',
        cursor: 'pointer',
        marginLeft: '0.5rem',
        marginRight: '0.5rem'
    },
    modalOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        backdropFilter: 'blur(4px)'
    },
    modalContent: {
        background: '#1E3A8A',
        borderRadius: '1rem',
        width: '90%',
        maxWidth: '500px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
    },
    modalHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.5rem',
        borderBottom: '1px solid #1E3A8A'
    },
    modalTitle: {
        fontSize: '1.25rem',
        fontWeight: '600',
        color: 'white',
        margin: 0
    },
    closeButton: {
        background: 'none',
        border: 'none',
        color: '#9CA3AF',
        fontSize: '1.25rem',
        cursor: 'pointer',
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem'
    },
    modalBody: {
        padding: '1.5rem',
        overflowY: 'auto',
        flex: 1
    },
    modalFooter: {
        display: 'flex',
        gap: '1rem',
        padding: '1.5rem',
        borderTop: '1px solid #1E3A8A'
    },
    formGroup: {
        marginBottom: '1rem'
    },
    label: {
        display: 'block',
        marginBottom: '0.5rem',
        color: '#9CA3AF',
        fontSize: '0.875rem',
        fontWeight: '500'
    },
    disabledLabel: {
        opacity: 0.6,
    },
    autoManagedBadge: {
        fontSize: '0.7rem',
        color: '#F59E0B',
        marginLeft: '0.5rem',
    },
    accountDisplay: {
        padding: '0.75rem',
        background: '#1E3A8A',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '0.875rem'
    },
    input: {
        width: '100%',
        padding: '0.75rem',
        background: '#1E3A8A',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '0.875rem'
    },
    select: {
        width: '100%',
        padding: '0.75rem',
        background: '#1E3A8A',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '0.875rem',
        cursor: 'pointer'
    },
    futureDateWarning: {
        marginTop: '0.5rem',
        padding: '0.5rem',
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid #F59E0B',
        borderRadius: '0.25rem',
        fontSize: '0.7rem',
        color: '#F59E0B',
    },
    hint: {
        display: 'block',
        marginTop: '0.25rem',
        fontSize: '0.7rem',
        color: '#F87171'
    },
    payeeHint: {
        marginTop: '0.25rem',
        fontSize: '0.65rem',
        color: '#6B7280',
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
        background: '#1E3A8A',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '0.875rem'
    },
    checkboxGroup: {
        marginTop: '0.5rem'
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        color: '#9CA3AF',
        fontSize: '0.875rem',
        cursor: 'pointer'
    },
    balancePreview: {
        marginTop: '1rem',
        padding: '0.75rem',
        background: '#1E3A8A',
        borderRadius: '0.5rem',
        border: '1px solid #374151',
        textAlign: 'center'
    },
    balancePreviewLabel: {
        fontSize: '0.75rem',
        color: '#9CA3AF',
        marginBottom: '0.25rem'
    },
    balancePreviewValue: {
        fontSize: '1.25rem',
        fontWeight: 'bold'
    },
    errorMessage: {
        marginTop: '0.75rem',
        padding: '0.5rem',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid #EF4444',
        borderRadius: '0.25rem',
        color: '#F87171',
        fontSize: '0.75rem',
        textAlign: 'center'
    },
    cancelModalButton: {
        flex: 1,
        padding: '0.75rem',
        background: '#4B5563',
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: '500',
        cursor: 'pointer'
    },
    submitButton: {
        flex: 1,
        padding: '0.75rem',
        background: 'linear-gradient(135deg, #10B981, #059669)',
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: '600',
        cursor: 'pointer'
    },
    deleteConfirmButton: {
        flex: 1,
        padding: '0.75rem',
        background: '#EF4444',
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: '600',
        cursor: 'pointer'
    },
    confirmText: {
        color: 'white',
        marginBottom: '1rem',
        fontSize: '1rem'
    },
    confirmDetails: {
        background: '#1E3A8A',
        padding: '1rem',
        borderRadius: '0.5rem',
        marginBottom: '1rem'
    },
    confirmDetailItem: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.5rem 0',
        color: '#9CA3AF',
        fontSize: '0.875rem',
        borderBottom: '1px solid #374151',
        ':last-child': {
            borderBottom: 'none'
        }
    },
    confirmWarning: {
        color: '#F87171',
        fontSize: '0.875rem',
        textAlign: 'center',
        marginTop: '1rem'
    },
    loadingContainer: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1E3A8A 0%, #1E3A8A 100%)',
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
        background: 'linear-gradient(135deg, #1E3A8A 0%, #1E3A8A 100%)',
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
    },
    // Transfer payment specific styles
    transferPaymentInfo: {
        background: 'linear-gradient(135deg, #1E3A5F, #0F172A)',
        padding: '1rem',
        borderRadius: '0.75rem',
        border: '1px solid #F59E0B',
    },
    transferPaymentBadge: {
        fontSize: '0.7rem',
        color: '#F59E0B',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '0.5rem',
        fontWeight: 'bold',
    },
    transferPaymentMessage: {
        fontSize: '0.875rem',
        color: '#9CA3AF',
        marginBottom: '0.75rem',
    },
    transferNote: {
        fontSize: '0.7rem',
        color: '#10B981',
        marginTop: '0.5rem',
        padding: '0.5rem',
        background: 'rgba(16, 185, 129, 0.1)',
        borderRadius: '0.375rem',
    },
    creditCardPaymentBadgeSmall: {
        fontSize: '0.6rem',
        color: '#10B981',
        marginTop: '0.25rem',
        display: 'inline-block',
        background: 'rgba(16, 185, 129, 0.1)',
        padding: '0.125rem 0.375rem',
        borderRadius: '0.25rem',
    },
    loanPaymentBadgeSmall: {
        fontSize: '0.6rem',
        color: '#F59E0B',
        marginTop: '0.25rem',
        display: 'inline-block',
        background: 'rgba(245, 158, 11, 0.1)',
        padding: '0.125rem 0.375rem',
        borderRadius: '0.25rem',
    },
    paymentBreakdown: {
        background: '#111827',
        padding: '0.75rem',
        borderRadius: '0.5rem',
        marginTop: '0.75rem',
    },
    breakdownTitle: {
        fontSize: '0.75rem',
        fontWeight: 'bold',
        color: '#9CA3AF',
        marginBottom: '0.5rem',
        textTransform: 'uppercase',
    },
    breakdownRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.25rem 0',
        fontSize: '0.875rem',
        borderBottom: '1px solid #374151',
    },
    breakdownNote: {
        fontSize: '0.65rem',
        color: '#6B7280',
        marginTop: '0.5rem',
        textAlign: 'center',
    },
};

export default AccountDetailPage;