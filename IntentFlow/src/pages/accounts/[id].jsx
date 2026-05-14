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
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [transactionError, setTransactionError] = useState('');
    const [showScheduledSection, setShowScheduledSection] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // ===================== PAYEE DROPDOWN STATE =====================
    const [payees, setPayees] = useState({ transferPayees: [], regularPayees: [] });
    const [loadingPayees, setLoadingPayees] = useState(false);
    const [selectedPayeeType, setSelectedPayeeType] = useState(null);

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
        payeeId: null,
        isTransfer: false,
        transferAccountId: null,
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

    const isCategoryArchived = (cat) => {
        if (!cat) return true;
        const a = cat.archived;
        return a === true || a === 1 || a === '1' || a === 'true';
    };

    // Get filtered categories based on transaction type
    const getFilteredCategories = () => {
        if (transactionForm.transactionType === 'inflow') {
            return [{ id: 'inflow_ready_to_assign', name: '💰 Inflow: Ready to Assign' }];
        }
        if (!categories || categories.length === 0) {
            return [];
        }
        return categories.filter((cat) => cat && !isCategoryArchived(cat));
    };

    // ===================== PAYEE DROPDOWN FUNCTIONS =====================

    // Fetch payees for dropdown (transfers + regular payees)
    const fetchPayees = async () => {
        setLoadingPayees(true);
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (userResult?.success && userResult?.data) {
                const userId = userResult.data.id;

                // Get all accounts for transfer payees
                const accountsResult = await window.electronAPI.getAccountsSummary(userId);
                const allAccounts = accountsResult?.success ? (accountsResult.data || []) : [];

                // Filter out current account for transfers
                const transferPayees = allAccounts
                    .filter(acc => acc.id !== account?.id)
                    .map(acc => ({
                        id: `transfer_${acc.id}`,
                        name: `Transfer: ${acc.name}`,
                        isTransfer: true,
                        transferAccountId: acc.id,
                        accountType: acc.type
                    }));

                // Get regular payees from payees table
                let regularPayees = [];
                try {
                    const payeesResult = await window.electronAPI.getPayees(userId);
                    if (payeesResult?.success) {
                        regularPayees = (payeesResult.data || [])
                            .filter(p => !p.is_transfer_payee)
                            .map(p => ({
                                id: p.id,
                                name: p.name,
                                isTransfer: false,
                                usageCount: p.usage_count
                            }));
                    }
                } catch (err) {
                    console.log('Payees table not yet set up, using empty list');
                }

                setPayees({ transferPayees, regularPayees });
            }
        } catch (error) {
            console.error('Error fetching payees:', error);
        } finally {
            setLoadingPayees(false);
        }
    };

    // Handle payee selection from dropdown
    const handlePayeeSelect = (payee) => {
        if (payee.isTransfer) {
            // Transfer selected - category disabled
            setTransactionForm(prev => ({
                ...prev,
                payee: payee.name,
                payeeId: payee.id,
                isTransfer: true,
                transferAccountId: payee.transferAccountId,
                categoryId: ''
            }));
            setSelectedPayeeType('transfer');
            setIsLoanPayment(false);
            setIsCreditCardTransfer(false);
            
            // Check if this is a loan payment transfer
            if (payee.accountType === 'loan') {
                const matchedLoan = loanAccounts.find(l => l.id === payee.transferAccountId);
                if (matchedLoan) {
                    setIsLoanPayment(true);
                    setSelectedLoanAccount(matchedLoan);
                    if (transactionForm.amount && parseFloat(transactionForm.amount) > 0) {
                        const breakdown = calculateLoanPaymentBreakdown(matchedLoan, parseFloat(transactionForm.amount), true);
                        setPaymentBreakdown(breakdown);
                    }
                }
            }
            
            // Check if this is a credit card payment transfer
            if (payee.accountType === 'credit') {
                const matchedCredit = creditCardPaymentCategories.find(c => 
                    c.name.toLowerCase() === payee.name.replace('Transfer: ', '').toLowerCase()
                );
                if (matchedCredit) {
                    setIsCreditCardTransfer(true);
                    setSelectedCreditCardCategory(matchedCredit);
                }
            }
        } else {
            // Regular payee selected - category enabled
            setTransactionForm(prev => ({
                ...prev,
                payee: payee.name,
                payeeId: payee.id,
                isTransfer: false,
                transferAccountId: null,
                categoryId: prev.categoryId
            }));
            setSelectedPayeeType('regular');
            setIsLoanPayment(false);
            setIsCreditCardTransfer(false);
            setSelectedLoanAccount(null);
            setSelectedCreditCardCategory(null);
            setPaymentBreakdown(null);
        }
    };

    // Save a new regular payee to the database
    const savePayee = async (payeeName, userId) => {
        try {
            const result = await window.electronAPI.createOrUpdatePayee({
                name: payeeName,
                userId: userId,
                isTransferPayee: false
            });
            return result.success ? result.data?.id : null;
        } catch (error) {
            console.error('Error saving payee:', error);
            return null;
        }
    };

    // Render payee dropdown with two sections - FIXED for manual entry
    const renderPayeeDropdown = () => {
        return (
            <select
                value={transactionForm.payee}
                onChange={(e) => {
                    const selectedValue = e.target.value;
                    if (selectedValue === '__manual__') {
                        // Allow manual entry - clear payee and show text input
                        setTransactionForm(prev => ({ 
                            ...prev, 
                            payee: '', 
                            payeeId: null,
                            isTransfer: false,
                            transferAccountId: null
                        }));
                        setSelectedPayeeType(null);
                        setIsLoanPayment(false);
                        setSelectedLoanAccount(null);
                        setPaymentBreakdown(null);
                        return;
                    }
                    try {
                        const payee = JSON.parse(selectedValue);
                        handlePayeeSelect(payee);
                    } catch (err) {
                        // Handle manual entry
                        setTransactionForm(prev => ({ ...prev, payee: selectedValue, isTransfer: false }));
                    }
                }}
                style={styles.select}
            >
                <option value="">-- Select or enter payee --</option>
                
                {/* Section 1: Payments & Transfers */}
                {payees.transferPayees.length > 0 && (
                    <optgroup label="📤 PAYMENTS & TRANSFERS">
                        {payees.transferPayees.map(payee => (
                            <option key={payee.id} value={JSON.stringify(payee)}>
                                {payee.name}
                            </option>
                        ))}
                    </optgroup>
                )}
                
                {/* Section 2: Recent Payees */}
                {payees.regularPayees.length > 0 && (
                    <optgroup label="📋 RECENT PAYEES">
                        {payees.regularPayees.map(payee => (
                            <option key={payee.id} value={JSON.stringify(payee)}>
                                {payee.name}
                            </option>
                        ))}
                    </optgroup>
                )}
                
                <option value="__manual__">✏️ Other (type manually)</option>
            </select>
        );
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
                            const paymentCategories = categoriesResult.data.filter((cat) =>
                                String(cat.group_id) === String(paymentGroup.id) && !isCategoryArchived(cat)
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

    // Create a transfer transaction to credit card
    const createCreditCardTransferTransaction = async (amountValue, userId) => {
        const isExpense = transactionForm.transactionType === 'outflow';
        const transactionAmount = isExpense ? -amountValue : amountValue;

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
            isTransfer: 1,
            transferAccountId: selectedCreditCardCategory ? 
                creditCardPaymentCategories.find(c => c.id === selectedCreditCardCategory.id)?.linked_account_id : null,
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
                    payee: `Transfer: ${account.name}`,
                    description: `Transfer: ${account.name}`,
                    amount: amountValue,
                    categoryId: null,
                    memo: transactionForm.memo || `Payment from ${account.name}`,
                    cleared: transactionForm.cleared ? 1 : 0,
                    frequency: transactionForm.frequency || null,
                    isLinkedTransfer: true,
                    isTransfer: 1,
                    transferAccountId: account.id,
                    sourceAccountId: account.id,
                    sourceAccountName: account.name,
                    linkedTransactionId: result.data?.id
                };

                await window.electronAPI.addTransaction(creditCardTransactionData);
            }
        }

        const summary = await window.electronAPI.getAccountsSummary(userId);
        const refreshed = summary?.success && summary.data
            ? summary.data.find(a => a.id === account.id)
            : null;
        const newBalance = refreshed != null ? refreshed.balance : account.balance;

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
        if (!account) return 0;
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

    // ===================== UPDATED: Create loan payment with linked transactions =====================
    const createLoanPaymentTransaction = async (amountValue, userId) => {
        console.group('🔷🔷🔷 LOAN PAYMENT DEBUG - START 🔷🔷🔷');
        console.log('📌 amountValue:', amountValue);
        console.log('📌 userId:', userId);
        console.log('📌 account (checking/savings):', account ? { id: account.id, name: account.name, balance: account.balance } : 'UNDEFINED');
        console.log('📌 selectedLoanAccount:', selectedLoanAccount ? { id: selectedLoanAccount.id, name: selectedLoanAccount.name, balance: selectedLoanAccount.balance } : 'UNDEFINED');

        if (!amountValue || amountValue <= 0) {
            console.error('❌ DEBUG: Invalid amountValue:', amountValue);
            throw new Error('Invalid payment amount');
        }
        if (!selectedLoanAccount) {
            console.error('❌ DEBUG: selectedLoanAccount is undefined/null');
            throw new Error('No loan account selected');
        }
        if (!account) {
            console.error('❌ DEBUG: account (checking) is undefined/null');
            throw new Error('No source account selected');
        }

        const isExpense = transactionForm.transactionType === 'outflow';
        const balanceChange = isExpense ? -amountValue : amountValue;
        console.log('📌 isExpense:', isExpense);
        console.log('📌 balanceChange:', balanceChange);

        // Check if this is the first payment of the month for interest calculation
        const isFirstPaymentOfMonth = await checkInterestAppliedThisMonth(selectedLoanAccount.id, transactionForm.date);
        console.log('📌 isFirstPaymentOfMonth result:', isFirstPaymentOfMonth);

        // Calculate payment breakdown
        const breakdown = calculateLoanPaymentBreakdown(selectedLoanAccount, amountValue, isFirstPaymentOfMonth);
        console.log('📌 breakdown result:', breakdown);

        if (!breakdown) {
            console.error('❌ DEBUG: Breakdown calculation returned null/undefined');
            throw new Error('Failed to calculate payment breakdown');
        }

        console.log('📝 Creating loan payment - Breakdown:', breakdown);

        // ========== STEP 1: Create OUTFLOW transaction in checking account ==========
        console.group('🏦 STEP 1: CREATING OUTFLOW (CHECKING SIDE)');

        const outflowTransactionData = {
            accountId: account.id,
            date: transactionForm.date,
            payee: transactionForm.payee,
            description: transactionForm.payee,
            amount: -amountValue,
            categoryId: null,
            memo: transactionForm.memo || `Loan payment to ${selectedLoanAccount.name}`,
            cleared: transactionForm.cleared ? 1 : 0,
            frequency: transactionForm.frequency || null,
            isLoanPayment: true,
            loanAccountId: selectedLoanAccount.id,
            isTransfer: 1,
            transferAccountId: selectedLoanAccount.id
        };

        console.log('📤 Outflow transaction data:', JSON.stringify(outflowTransactionData, null, 2));

        const outflowResult = await window.electronAPI.addTransaction(outflowTransactionData);

        if (!outflowResult.success) {
            console.error('❌ Outflow transaction FAILED:', outflowResult.error);
            throw new Error(outflowResult.error || 'Failed to create loan payment transaction');
        }

        const outflowTransaction = outflowResult.data;
        const outflowId = outflowTransaction.id;
        console.log('✅ Outflow transaction created with ID:', outflowId);
        console.groupEnd();

        // ========== STEP 2: Create INFLOW transaction in loan account ==========
        console.group('🏦 STEP 2: CREATING INFLOW (LOAN SIDE)');

        const inflowTransactionData = {
            accountId: selectedLoanAccount.id,
            date: transactionForm.date,
            payee: `Transfer: ${account.name}`,
            description: `Transfer: ${account.name}`,
            amount: breakdown.principalPortion,
            categoryId: null,
            memo: transactionForm.memo || `Payment from ${account.name}`,
            cleared: transactionForm.cleared ? 1 : 0,
            frequency: transactionForm.frequency || null,
            isTransfer: 1,
            transferAccountId: account.id,
            linkedTransactionId: outflowId,
            isLoanPaymentInflow: true,
            isPrincipalPayment: true
        };

        console.log('📥 Inflow transaction data:', JSON.stringify(inflowTransactionData, null, 2));

        const inflowResult = await window.electronAPI.addTransaction(inflowTransactionData);

        if (!inflowResult.success) {
            console.error('❌ Inflow transaction FAILED:', inflowResult.error);
            console.error('⚠️ Outflow was created but inflow failed! Data inconsistency may exist.');
            throw new Error(`LOAN PAYMENT FAILED: ${inflowResult.error || 'Could not create loan transaction'}`);
        }

        const inflowTransaction = inflowResult.data;
        const inflowId = inflowTransaction.id;
        console.log('✅ Inflow transaction created with ID:', inflowId);
        console.groupEnd();

        // ========== STEP 3: Update outflow with linked transaction ID ==========
        console.group('🔗 STEP 3: LINKING TRANSACTIONS');

        try {
            await window.electronAPI.updateTransaction(outflowId, {
                linked_transaction_id: inflowId
            });
            console.log('✅ Outflow transaction updated with link to inflow:', inflowId);
        } catch (linkError) {
            console.warn('⚠️ Could not update outflow with link:', linkError.message);
        }
        console.groupEnd();

        // ========== STEP 4: Create INTEREST transaction if applicable ==========
        console.group('💰 STEP 4: INTEREST TRANSACTION');

        let interestId = null;
        if (breakdown.interestPortion > 0 && isFirstPaymentOfMonth) {
            const interestTransactionData = {
                accountId: selectedLoanAccount.id,
                date: transactionForm.date,
                payee: `Interest Charge - ${selectedLoanAccount.name}`,
                description: `Interest Charge - ${selectedLoanAccount.name}`,
                amount: -breakdown.interestPortion,
                categoryId: null,
                memo: `Monthly interest at ${breakdown.interestRate}% APR`,
                cleared: 1,
                isInterestCharge: true,
                interestRate: breakdown.interestRate,
                interestAmount: breakdown.interestPortion
            };

            console.log('💰 Interest transaction data:', JSON.stringify(interestTransactionData, null, 2));
            const interestResult = await window.electronAPI.addTransaction(interestTransactionData);

            if (interestResult.success) {
                interestId = interestResult.data.id;
                console.log('✅ Interest transaction created with ID:', interestId);
            } else {
                console.warn('⚠️ Failed to record interest transaction:', interestResult.error);
            }
        } else {
            console.log('No interest transaction needed');
        }
        console.groupEnd();

        console.group('🔍🔍🔍 FINAL VERIFICATION');
        console.log('Created transactions:');
        console.log('  - Outflow ID:', outflowId, '(Checking: -' + amountValue + ')');
        console.log('  - Inflow ID:', inflowId, '(Loan: +' + breakdown.principalPortion + ')');
        if (interestId) console.log('  - Interest ID:', interestId, '(Loan: -' + breakdown.interestPortion + ')');
        console.log('✅ Loan payment completed successfully');
        console.groupEnd();

        const summary = await window.electronAPI.getAccountsSummary(userId);
        const checkingRefreshed = summary?.success && summary.data
            ? summary.data.find(a => a.id === account.id)
            : null;
        const newBalance = checkingRefreshed != null ? checkingRefreshed.balance : account.balance;

        console.groupEnd('🔷🔷🔷 LOAN PAYMENT DEBUG - END 🔷🔷🔷');

        return { newBalance, breakdown, outflowId, inflowId, interestId };
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

            const updateResult = await window.electronAPI.updateTransaction(transactionId, updateData);
            if (!updateResult.success) {
                throw new Error(updateResult.error || 'Failed to update transaction');
            }

            await loadAccountData(account.id);

            const summary = await window.electronAPI.getAccountsSummary(userId);
            const refreshed = summary?.success && summary.data
                ? summary.data.find(a => a.id === account.id)
                : null;
            const newBalance = refreshed != null ? refreshed.balance : account.balance;

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

            await window.electronAPI.deleteScheduledTransaction(scheduledTx.id);

            await loadAccountData(account.id);
            await loadScheduledTransactions();

            const summary = await window.electronAPI.getAccountsSummary(userId);
            const refreshed = summary?.success && summary.data
                ? summary.data.find(a => a.id === account.id)
                : null;
            const newBalance = refreshed != null ? refreshed.balance : account.balance;

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

            for (const transaction of selectedTransactionsList) {
                const deleteResult = await window.electronAPI.deleteTransaction(transaction.id);
                if (!deleteResult.success) {
                    throw new Error(`Failed to delete transaction ${transaction.id}: ${deleteResult.error}`);
                }
            }

            await loadAccountData(account.id);

            const summary = await window.electronAPI.getAccountsSummary(userId);
            const refreshed = summary?.success && summary.data
                ? summary.data.find(a => a.id === account.id)
                : null;
            const newBalance = refreshed != null ? refreshed.balance : account.balance;

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

    // Load payees and related data when modal opens (categories loaded below when Outflow)
    useEffect(() => {
        if (showAddModal) {
            loadLoanAccounts();
            loadCreditCardPaymentCategories();
            fetchPayees();
        }
    }, [showAddModal]);

    // Always load fresh categories from DB for Outflow (single source of truth for the dropdown)
    useEffect(() => {
        if (!showAddModal || transactionForm.transactionType !== 'outflow') return;
        loadCategories();
    }, [showAddModal, transactionForm.transactionType]);

    const loadCategories = async () => {
        setLoadingCategories(true);
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            if (!userResult?.success || !userResult?.data) {
                setCategories([]);
                return;
            }
            const userId = userResult.data.id;

            const flattenGrouped = (groupedData) => {
                const seen = new Set();
                const flat = [];
                for (const group of groupedData || []) {
                    const gName = group?.name || '';
                    for (const c of group.categories || []) {
                        if (c?.id == null || c.id === '') continue;
                        const idKey = String(c.id);
                        if (seen.has(idKey)) continue;
                        if (isCategoryArchived(c)) continue;
                        seen.add(idKey);
                        flat.push({
                            ...c,
                            group_name: c.group_name || gName
                        });
                    }
                }
                flat.sort((a, b) => {
                    const ga = (a.group_name || '').localeCompare(b.group_name || '');
                    if (ga !== 0) return ga;
                    return (a.name || '').localeCompare(b.name || '');
                });
                return flat;
            };

            let flat = [];

            if (window.electronAPI?.getGroupsWithCategories) {
                try {
                    const grouped = await window.electronAPI.getGroupsWithCategories(userId);
                    if (grouped?.success && Array.isArray(grouped.data) && grouped.data.length > 0) {
                        flat = flattenGrouped(grouped.data);
                    }
                } catch (e) {
                    console.warn('getGroupsWithCategories failed, falling back to getCategories:', e.message);
                }
            }

            if (flat.length === 0) {
                const categoriesResult = await window.electronAPI.getCategories(userId);
                if (categoriesResult?.success) {
                    const rows = categoriesResult.data || [];
                    flat = rows.filter((c) => c && !isCategoryArchived(c));
                }
            }

            setCategories(flat);
        } catch (error) {
            console.error('Error loading categories:', error);
            setCategories([]);
        } finally {
            setLoadingCategories(false);
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
            payeeId: null,
            isTransfer: false,
            transferAccountId: null,
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
        setSelectedPayeeType(null);
    };

    // Add regular transaction (for today/past dates)
    const handleAddRegularTransaction = async (amountValue, userId) => {
        if (!account) throw new Error('No account loaded');

        const isCreditOrLoan = account.type === 'credit' || account.type === 'loan';
        const isExpense = transactionForm.transactionType === 'outflow';

        let transactionAmount = 0;

        // Handle credit card transfer
        if (transactionForm.isTransfer && selectedCreditCardCategory && account.type !== 'credit') {
            return await createCreditCardTransferTransaction(amountValue, userId);
        }

        // Handle loan payment (YNAB-style with interest calculation)
        if (transactionForm.isTransfer && isLoanPayment && selectedLoanAccount) {
            const result = await createLoanPaymentTransaction(amountValue, userId);
            return result.newBalance;
        }

        // Handle regular transaction
        if (isCreditOrLoan) {
            if (isExpense) {
                transactionAmount = -amountValue;
            } else {
                transactionAmount = amountValue;
            }
        } else {
            if (isExpense) {
                transactionAmount = -amountValue;
            } else {
                transactionAmount = amountValue;
            }
        }

        const isReadyToAssign = transactionForm.transactionType === 'inflow' &&
            transactionForm.categoryId === 'inflow_ready_to_assign';

        // Save payee to payees table if this is a regular transaction (not a transfer)
        let finalPayeeId = transactionForm.payeeId;
        if (!transactionForm.isTransfer && transactionForm.payee && !finalPayeeId) {
            finalPayeeId = await savePayee(transactionForm.payee, userId);
        }

        const transactionData = {
            accountId: account.id,
            date: transactionForm.date,
            payee: transactionForm.payee,
            description: transactionForm.payee,
            amount: transactionAmount,
            categoryId: isReadyToAssign ? null : transactionForm.categoryId,
            memo: transactionForm.memo,
            cleared: transactionForm.cleared ? 1 : 0,
            frequency: transactionForm.frequency || null,
            payeeId: finalPayeeId
        };

        const result = await window.electronAPI.addTransaction(transactionData);
        if (!result.success) {
            throw new Error(result.error || 'Failed to add transaction');
        }

        const summary = await window.electronAPI.getAccountsSummary(userId);
        const refreshed = summary?.success && summary.data
            ? summary.data.find(a => a.id === account.id)
            : null;
        return refreshed != null ? refreshed.balance : account.balance;
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
            setTransactionError('Please select or enter a payee');
            return;
        }

        // For loan payments or credit card transfers, category is auto-managed
        if (!transactionForm.isTransfer && !transactionForm.categoryId) {
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
                if (transactionForm.isTransfer && isLoanPayment && selectedLoanAccount) {
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
                if (transactionForm.isTransfer && isLoanPayment && selectedLoanAccount && paymentBreakdown) {
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
            // Refresh payees list after adding transaction (for new payees)
            fetchPayees();

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

    // Determine if this is a checking/savings account (where transfers make sense)
    const isCashAccount = account && (account.type === 'checking' || account.type === 'savings');

    // Check if this is a loan account being viewed
    const isLoanAccountView = account && account.type === 'loan';

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

    const frequencyOptions = [
        { value: '', label: 'No recurrence (one-time)' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'bi-weekly', label: 'Bi-Weekly (every 2 weeks)' },
        { value: 'monthly', label: 'Monthly' }
    ];

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

            {/* Info Banner for Loan Accounts - When viewing a loan account from this page */}
            {isLoanAccountView && (
                <div style={styles.loanViewInfoBanner}>
                    <div style={styles.loanViewInfoIcon}>ℹ️</div>
                    <div style={styles.loanViewInfoContent}>
                        <strong>📋 Viewing a Loan Account:</strong><br />
                        To make a payment to this loan, you need to use your <strong>checking or savings account</strong>.<br />
                        <code style={styles.codeExample}>Transfer: {account.name}</code><br />
                        The system will automatically calculate interest (first payment of month) and apply the rest to principal.
                    </div>
                </div>
            )}

            {/* Info Banner for Checking/Savings Accounts - Shows how to make loan payments */}
            {isCashAccount && loanAccounts.length > 0 && (
                <div style={styles.loanPaymentTipBanner}>
                    <div style={styles.loanPaymentTipIcon}>💡</div>
                    <div style={styles.loanPaymentTipContent}>
                        <strong>Make a Loan Payment:</strong> Select a transfer from the Payee dropdown to record a payment. Interest will be calculated automatically (first payment of month only).
                    </div>
                </div>
            )}

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
                                const editCategories = categories.filter((cat) => cat && !isCategoryArchived(cat));

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
                                            {transaction.is_transfer === 1 && (
                                                <div style={styles.transferBadgeSmall}>🔄 Transfer</div>
                                            )}
                                        </div>
                                        <div style={styles.transactionCategory}>
                                            {transaction.isLoanPayment ? '🏦 Loan Transfer' :
                                                transaction.isCreditCardPayment ? '💳 Credit Card Transfer' :
                                                    transaction.is_transfer === 1 ? '🔄 Account Transfer' :
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
                                    disabled={transactionForm.isTransfer}
                                >
                                    <option value="outflow">Outflow (Expense)</option>
                                    <option value="inflow">Inflow (Income/Payment)</option>
                                </select>
                            </div>

                            {/* Payee Dropdown with Transfer Options */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Payee *</label>
                                {loadingPayees ? (
                                    <div style={styles.loadingPayees}>Loading payees...</div>
                                ) : (
                                    renderPayeeDropdown()
                                )}
                                {transactionForm.isTransfer && (
                                    <div style={styles.payeeHint}>
                                        💡 Transfer selected. Category will be auto-managed.
                                    </div>
                                )}
                            </div>

                            {/* Manual Payee Input (shown when "Other" is selected or payee needs manual entry) */}
                            {(transactionForm.payee === '' || (transactionForm.payee && !payees.transferPayees.some(p => p.name === transactionForm.payee) &&
                             !payees.regularPayees.some(p => p.name === transactionForm.payee))) && (
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Enter Payee Name</label>
                                    <input
                                        type="text"
                                        value={transactionForm.payee}
                                        onChange={(e) => setTransactionForm(prev => ({ ...prev, payee: e.target.value, isTransfer: false }))}
                                        style={styles.input}
                                        placeholder="Enter payee name (e.g., Starbucks, Rent, Amazon)"
                                    />
                                </div>
                            )}

                            {/* Category Dropdown - Grayed out for transfers */}
                            <div style={styles.formGroup}>
                                <label style={{ ...styles.label, ...(transactionForm.isTransfer ? styles.disabledLabel : {}) }}>
                                    Category {transactionForm.isTransfer && <span style={styles.autoManagedBadge}>(Auto-managed for transfer)</span>}
                                </label>
                                {transactionForm.isTransfer ? (
                                    <div style={styles.transferPaymentInfo}>
                                        <div style={styles.transferPaymentBadge}>
                                            {isLoanPayment ? '🏦 Loan Payment (Transfer)' : isCreditCardTransfer ? '💳 Credit Card Payment (Transfer)' : '🔄 Account Transfer'}
                                        </div>
                                        <div style={styles.transferPaymentMessage}>
                                            {isLoanPayment ? (
                                                <>This is a payment transfer to <strong>{selectedLoanAccount?.name}</strong>.<br />
                                                    The payment will be split: interest first, then principal.<br />
                                                    A corresponding inflow will appear in your loan account.</>
                                            ) : isCreditCardTransfer ? (
                                                <>This is a payment transfer to <strong>{selectedCreditCardCategory?.name}</strong>.<br />
                                                    The category is automatically managed. This will appear as an inflow in your credit card account.</>
                                            ) : (
                                                <>This is a transfer to another account. No category is needed.</>
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
                                    </div>
                                ) : transactionForm.transactionType === 'outflow' && loadingCategories ? (
                                    <div style={styles.loadingPayees}>Loading categories…</div>
                                ) : (
                                    <select
                                        value={transactionForm.categoryId != null ? String(transactionForm.categoryId) : ''}
                                        onChange={(e) => setTransactionForm({ ...transactionForm, categoryId: e.target.value })}
                                        style={styles.select}
                                        disabled={transactionForm.transactionType === 'outflow' && loadingCategories}
                                    >
                                        <option value="">
                                            {transactionForm.transactionType === 'outflow' && filteredCategories.length === 0 && !loadingCategories
                                                ? 'No categories found — check database / login'
                                                : 'Select a category'}
                                        </option>
                                        {filteredCategories.map((category) => (
                                            <option key={String(category.id)} value={String(category.id)}>
                                                {(category.group_name ? `${category.group_name} › ` : '')}{category.name}
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
                                            if (transactionForm.isTransfer && isLoanPayment && selectedLoanAccount && newAmount && parseFloat(newAmount) > 0) {
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

// Keep your existing styles object - only add missing styles if needed

const styles = {
    container: {
        minHeight: '100vh',
        background: '#3B82F6',
        color: '#0047AB',
        padding: '2rem',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto'
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
    transferBadgeSmall: {
        fontSize: '0.6rem',
        color: '#8B5CF6',
        marginTop: '0.25rem',
        display: 'inline-block',
        background: 'rgba(139, 92, 246, 0.1)',
        padding: '0.125rem 0.375rem',
        borderRadius: '0.25rem',
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
    loanViewInfoBanner: {
        maxWidth: '1200px',
        margin: '0 auto 1.5rem',
        background: 'linear-gradient(135deg, #1E3A5F, #0F172A)',
        border: '1px solid #3B82F6',
        borderRadius: '0.75rem',
        padding: '1rem',
        display: 'flex',
        gap: '1rem',
        alignItems: 'flex-start',
    },
    loanViewInfoIcon: {
        fontSize: '1.5rem',
        color: '#3B82F6',
    },
    loanViewInfoContent: {
        flex: 1,
        fontSize: '0.875rem',
        color: '#D1D5DB',
        lineHeight: '1.5',
    },
    loanPaymentTipBanner: {
        maxWidth: '1200px',
        margin: '0 auto 1.5rem',
        background: 'linear-gradient(135deg, #1E3A5F, #0F172A)',
        border: '1px solid #F59E0B',
        borderRadius: '0.75rem',
        padding: '0.75rem 1rem',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
    },
    loanPaymentTipIcon: {
        fontSize: '1.25rem',
    },
    loanPaymentTipContent: {
        flex: 1,
        fontSize: '0.8rem',
        color: '#D1D5DB',
    },
    codeExample: {
        background: '#111827',
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem',
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        color: '#10B981',
        display: 'inline-block',
        marginTop: '0.25rem',
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
        overflow: 'hidden',
        overflowX: 'auto',
        minWidth: 0
    },
    transactionHeaderRow: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
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
        flexWrap: 'wrap',
        alignItems: 'flex-start',
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
        flexWrap: 'wrap',
        alignItems: 'flex-start',
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
        minWidth: 0,
        color: 'white',
        fontWeight: '500'
    },
    transactionPayeeHeader: {
        flex: 2,
        minWidth: 0
    },
    transactionCategory: {
        flex: 1,
        minWidth: 0,
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
        width: 'min(95%, 600px)',
        maxWidth: '600px',
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
        background: '#3B82F6',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#0047AB'
    },
    loadingSpinner: {
        width: '48px',
        height: '48px',
        border: '4px solid #0047AB',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '1rem'
    },
    loadingPayees: {
        padding: '0.75rem',
        textAlign: 'center',
        color: '#9CA3AF',
        fontSize: '0.875rem'
    },
    errorContainer: {
        minHeight: '100vh',
        background: '#3B82F6',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#0047AB',
        textAlign: 'center'
    },
    backLink: {
        marginTop: '1rem',
        color: '#3B82F6',
        textDecoration: 'none'
    },
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