// src/views/AccountDetailView.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PlaidAccountSyncBanner from '../components/PlaidAccountSyncBanner';
import PlaidTxnBadge from '../components/PlaidTxnBadge';
import { isPlaidImportedTransaction } from '../utils/plaidTransactionUtils';
import {
  computeRegisterBalanceFromTransactions,
  computeRegisterBalances,
  getAccountDetailDisplayBalance,
  isPlaidLinkedAccount,
  withRegisterDisplayBalance,
} from '../utils/accountRegisterBalance.jsx';
import { computeTransactionsWithRunningBalance } from '../utils/accountBalanceEngine.jsx';
import AccountBalanceSummary, { formatBalanceDisplay } from '../components/accounts/AccountBalanceSummary.jsx';
import TransactionImportModal from '../components/TransactionImportModal';
import TransactionToolbar from '../components/transactions/TransactionToolbar.jsx';
import TransactionTable from '../components/transactions/TransactionTable.jsx';
import {
  DEFAULT_TRANSACTION_SORT,
  sortTransactions,
} from '../utils/transactionSortUtils.jsx';
import {
  DEFAULT_TRANSACTION_FILTERS,
  filterTransactions,
} from '../utils/transactionFilterUtils.jsx';
import useRegisterTableInlineEdit from '../hooks/useRegisterTableInlineEdit.jsx';
import useRegisterTransactionRowActions from '../hooks/useRegisterTransactionRowActions.jsx';
import RegisterTransactionActions from '../components/transactions/RegisterTransactionActions.jsx';
import RegisterPayeeExtras from '../components/transactions/RegisterPayeeExtras.jsx';
import TransactionSplitModal from '../components/transactions/TransactionSplitModal.jsx';
import { enrichTransactionsWithCategoryNames } from '../utils/categoryDisplayUtils.jsx';
import {
  countSelectedInList,
  isTransactionSelected,
  normalizeTransactionId,
  pruneTransactionSelection,
} from '../utils/transactionSelectionUtils.jsx';
import { computeAvailableCredit } from '../utils/creditCardBalanceUtils.jsx';
import {
  buildIncomeCategoryOptions,
  buildTransactionAmountUpdate,
  buildTransferSignedAmount,
  categorySelectValueForTransaction,
  getTransactionEditAmountMagnitude,
  getTransactionEditType,
  isIncomeTransaction,
  isReadyToAssignSentinel,
} from '../utils/readyToAssignCategory.jsx';
import AccountRoutingPayeeOptions from '../components/transactions/AccountRoutingPayeeOptions.jsx';
import {
  buildAccountPayeeOptions,
  formatPaymentPayeeName,
  formatTransferPayeeName,
  getAllRoutingPayees,
  mapPayeesFromFormApi,
  parseAccountRoutingDestinationName,
  EMPTY_PAYEES_FORM,
} from '../utils/transferPayeeUtils.jsx';

const TRANSACTIONS_PER_PAGE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_TRANSACTIONS_PER_PAGE = 25;

function AccountDetailView({ account: propAccount, accountId, onBack, onMakePayment }) {
  console.log('🔥 AccountDetailView mounted – timestamp', Date.now());
  console.log('🔵 Props:', { propAccount, accountId, onBack: !!onBack, onMakePayment: !!onMakePayment });

  // ----- Normalize to a single source of truth for the account ID -----
  const definitiveAccountId = accountId || propAccount?.id;
  console.log('🔍 definitiveAccountId:', definitiveAccountId);

  const [account, setAccount] = useState(propAccount || null);
  const [loading, setLoading] = useState(!propAccount && !!definitiveAccountId);
  const [error, setError] = useState(null);
  const [transactions, setTransactions] = useState([]);
  /** All active transactions (unfiltered) for balance engine. */
  const [allTransactions, setAllTransactions] = useState([]);
  /** Register total from transaction rows (Plaid-linked accounts). */
  const [registerBalance, setRegisterBalance] = useState(null);
  const [scheduledTransactions, setScheduledTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [transactionSort, setTransactionSort] = useState(DEFAULT_TRANSACTION_SORT);
  const [transactionFilters, setTransactionFilters] = useState({ ...DEFAULT_TRANSACTION_FILTERS });
  const [transactionsPerPage, setTransactionsPerPage] = useState(DEFAULT_TRANSACTIONS_PER_PAGE);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [addTransactionError, setAddTransactionError] = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScheduledSection, setShowScheduledSection] = useState(true);
  const [approvingScheduledId, setApprovingScheduledId] = useState(null);

  // ===================== PAYEE DROPDOWN STATE =====================
  const [payees, setPayees] = useState(EMPTY_PAYEES_FORM);
  const [loadingPayees, setLoadingPayees] = useState(false);

  // ===================== LOAN/CREDIT CARD PAYMENT STATE =====================
  const [isLoanPayment, setIsLoanPayment] = useState(false);
  const [selectedLoanAccount, setSelectedLoanAccount] = useState(null);
  const [loanAccounts, setLoanAccounts] = useState([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState(null);

  // Edit transaction states
  const [editingTransactionId, setEditingTransactionId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    date: '',
    payee: '',
    amount: '',
    type: 'outflow',
    categoryId: '',
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
  const [newTransaction, setNewTransaction] = useState({
    date: getTodayLocalDate(),
    payee: '',
    payeeId: null,
    isTransfer: false,
    transferAccountId: null,
    amount: '',
    transactionType: 'outflow',
    categoryId: '',
    memo: '',
    cleared: true,
    frequency: ''
  });

  // Frequency options for the dropdown
  const frequencyOptions = [
    { value: '', label: 'No recurrence (one-time)' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'bi-weekly', label: 'Bi-Weekly (every 2 weeks)' },
    { value: 'monthly', label: 'Monthly' }
  ];

  // Format currency
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
    if (newTransaction.transactionType === 'inflow') {
      return buildIncomeCategoryOptions(
        (categories || []).filter((cat) => cat && !isCategoryArchived(cat))
      );
    }
    if (!categories || categories.length === 0) {
      return [];
    }
    return categories.filter((cat) => cat && !isCategoryArchived(cat));
  };

  // Get all categories for editing
  const getAllCategories = () => {
    return categories.filter((cat) => cat && !isCategoryArchived(cat));
  };

  const editableCategories = useMemo(
    () => categories.filter((cat) => cat && !isCategoryArchived(cat)),
    [categories]
  );

  const {
    registerPayees,
    registerPayeesLoading,
    handleInlineUpdate,
    isInlineEditDisabled,
    isCategoryInlineDisabled,
    isPayeeInlineDisabled,
  } = useRegisterTableInlineEdit({
    accountId: account?.id,
    transactions,
    allTransactions,
    setTransactions,
    setAllTransactions,
    categories: editableCategories,
  });

  const reloadRegisterAfterRowAction = useCallback(async () => {
    if (!account?.id) return;
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      const userId = userResult?.data?.id;
      if (userId) {
        await syncAccountDisplayAfterMutation(account.id, userId);
      }
    } catch (e) {
      console.warn('reload after row action:', e?.message || e);
    }
    setRefreshCounter((c) => c + 1);
  }, [account?.id]);

  const {
    splitTransaction,
    setSplitTransaction,
    handleDeleteRow,
    handleToggleClearedRow,
    handleSplitSaved,
  } = useRegisterTransactionRowActions({ onAfterMutation: reloadRegisterAfterRowAction });

  const getTransactionCategoryLabel = (tx, category) => {
    if (tx.isLoanPayment) return '🏦 Loan Transfer';
    if (tx.isCreditCardPayment) return '💳 Credit Card Transfer';
    if (tx.is_transfer === 1) return '🔄 Account Transfer';
    if (category?.name) return category.name;
    if (tx.amount > 0 && !tx.category_id) return 'Ready to Assign';
    if (!tx.category_id) return '—';
    return 'Uncategorized';
  };

  // ===================== PAYEE DROPDOWN FUNCTIONS =====================

  // Fetch payees for dropdown (transfers + regular payees)
  const fetchPayees = async () => {
    setLoadingPayees(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const userId = userResult.data.id;

        let nextPayees = EMPTY_PAYEES_FORM;

        if (window.electronAPI.getPayeesForForm) {
          const formRes = await window.electronAPI.getPayeesForForm({
            userId,
            currentAccountId: account?.id,
          });
          if (formRes?.success && formRes.data) {
            nextPayees = mapPayeesFromFormApi(formRes.data);
          }
        }

        if (!nextPayees.paymentPayees.length && !nextPayees.transferPayees.length) {
          const accountsResult = await window.electronAPI.getAccountsSummary(userId);
          const allAccounts = accountsResult?.success ? (accountsResult.data || []) : [];
          const built = buildAccountPayeeOptions(allAccounts, account?.id);
          nextPayees = { ...nextPayees, ...built };
        }

        if (!nextPayees.regularPayees.length) {
          try {
            const payeesResult = await window.electronAPI.getPayees(userId);
            if (payeesResult?.success) {
              nextPayees = {
                ...nextPayees,
                regularPayees: (payeesResult.data || [])
                  .filter((p) => !p.is_transfer_payee)
                  .map((p) => ({
                    id: p.id,
                    name: p.name,
                    isTransfer: false,
                    usageCount: p.usage_count,
                  })),
              };
            }
          } catch (err) {
            console.log('Payees table not yet set up, using empty list');
          }
        }

        setPayees(nextPayees);
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
      setNewTransaction(prev => ({
        ...prev,
        payee: payee.name,
        payeeId: payee.id,
        isTransfer: true,
        transferAccountId: payee.transferAccountId,
        categoryId: ''
      }));

      // Check if this is a loan payment transfer
      const matchedLoan = loanAccounts.find(l => l.id === payee.transferAccountId);
      if (matchedLoan && payee.accountType === 'loan') {
        setIsLoanPayment(true);
        setSelectedLoanAccount(matchedLoan);
        if (newTransaction.amount && parseFloat(newTransaction.amount) > 0) {
          const breakdown = calculatePaymentBreakdown(matchedLoan, parseFloat(newTransaction.amount), true);
          setPaymentBreakdown(breakdown);
        }
      } else {
        setIsLoanPayment(false);
        setSelectedLoanAccount(null);
        setPaymentBreakdown(null);
      }
    } else {
      // Regular payee selected - category enabled
      setNewTransaction(prev => ({
        ...prev,
        payee: payee.name,
        payeeId: payee.id,
        isTransfer: false,
        transferAccountId: null
      }));
      setIsLoanPayment(false);
      setSelectedLoanAccount(null);
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
        value={newTransaction.payee}
        onChange={(e) => {
          const selectedValue = e.target.value;
          if (selectedValue === '__manual__') {
            // Allow manual entry - clear payee and show text input
            setNewTransaction(prev => ({ 
              ...prev, 
              payee: '', 
              payeeId: null,
              isTransfer: false,
              transferAccountId: null
            }));
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
            setNewTransaction(prev => ({ ...prev, payee: selectedValue, isTransfer: false }));
          }
        }}
        style={styles.select}
      >
        <option value="">-- Select or enter payee --</option>

        <AccountRoutingPayeeOptions
          paymentPayees={payees.paymentPayees}
          transferPayees={payees.transferPayees}
          serializeValue={(payee) => JSON.stringify(payee)}
        />

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

  // Calculate balance change
  const calculateBalanceChange = (accountType, transactionType, amount) => {
    const isCreditOrLoan = accountType === 'credit' || accountType === 'loan';
    const isExpense = transactionType === 'outflow';
    const absAmount = Math.abs(amount);

    let change = 0;

    if (isCreditOrLoan) {
      change = isExpense ? -absAmount : absAmount;
    } else {
      change = isExpense ? -absAmount : absAmount;
    }

    return change;
  };

  // Calculate balance change for a transaction (for deletion)
  const calculateBalanceChangeForTransaction = (transaction) => {
    const isCreditOrLoan = account.type === 'credit' || account.type === 'loan';

    if (isCreditOrLoan) {
      return transaction.amount > 0 ? transaction.amount : transaction.amount;
    } else {
      return transaction.amount > 0 ? -transaction.amount : Math.abs(transaction.amount);
    }
  };

  // ===================== LOAN PAYMENT HELPER FUNCTIONS =====================

  // Calculate how payment splits between interest and principal (YNAB-style)
  const calculatePaymentBreakdown = (loanAccount, paymentAmount, isFirstPaymentOfMonth = true) => {
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

  // Check if payee matches a loan/credit card account
  const checkIfLoanPayment = (payeeValue) => {
    if (!payeeValue || !loanAccounts.length) {
      setIsLoanPayment(false);
      setSelectedLoanAccount(null);
      setPaymentBreakdown(null);
      return false;
    }

    // Check for "Payment: to …" / "Transfer: to …" (legacy labels without "to" still work)
    const paymentPattern = /^(payment|transfer):\s*(?:to\s+)?(.+)$/i;
    const match = payeeValue.match(paymentPattern);

    let accountName = match ? match[3].trim() : payeeValue.trim();
    const parsed = parseAccountRoutingDestinationName(payeeValue);
    if (parsed) accountName = parsed;

    // Find matching account - EXCLUDE the current account (can't pay yourself)
    const matchedAccount = loanAccounts.find(acc =>
      acc.id !== account?.id &&  // Don't pay the same account
      (acc.name.toLowerCase() === accountName.toLowerCase() ||
        acc.name.toLowerCase().includes(accountName.toLowerCase()))
    );

    if (matchedAccount) {
      setIsLoanPayment(true);
      setSelectedLoanAccount(matchedAccount);

      // Calculate initial payment breakdown if amount is entered
      if (newTransaction.amount && parseFloat(newTransaction.amount) > 0) {
        const breakdown = calculatePaymentBreakdown(matchedAccount, parseFloat(newTransaction.amount), true);
        setPaymentBreakdown(breakdown);
      }
      return true;
    } else {
      setIsLoanPayment(false);
      setSelectedLoanAccount(null);
      setPaymentBreakdown(null);
      return false;
    }
  };

  // ===================== CREDIT CARD AUTO TRANSFER HELPER =====================

  // Automatically move money from spending category to credit card payment category
  const handleCreditCardAutoTransfer = async (amount, spendingCategoryId, creditCardAccountName) => {
    try {
      console.log(`🔄 Auto-transfer triggered: $${amount} from category ${spendingCategoryId} to ${creditCardAccountName} payment category`);

      if (window.moveMoneyForCreditCardTransaction) {
        const result = await window.moveMoneyForCreditCardTransaction(amount, spendingCategoryId, creditCardAccountName);
        if (result) {
          console.log('✅ Auto-transfer completed successfully');
          return true;
        } else {
          console.warn('⚠️ Auto-transfer failed');
          return false;
        }
      } else {
        console.warn('⚠️ moveMoneyForCreditCardTransaction function not available. Make sure PropertyMapView is loaded.');
        return false;
      }
    } catch (error) {
      console.error('❌ Error in auto-transfer:', error);
      return false;
    }
  };

  // Load loan and credit card accounts for payment detection
  const loadLoanAccounts = async () => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const userId = userResult.data.id;

        const accountsResult = await window.electronAPI.getAccountsSummary(userId);
        console.log('📊 Accounts loaded via getAccountsSummary:', accountsResult);

        if (accountsResult?.success) {
          const allAccounts = accountsResult.data || [];
          console.log('✅ Total accounts loaded:', allAccounts.length);
          console.log('📋 Account names:', allAccounts.map(a => ({ name: a.name, type: a.type })));

          // Filter for credit cards and loans only
          const loanAndCreditAccounts = allAccounts.filter(acc =>
            acc.type === 'credit' || acc.type === 'loan'
          );

          setLoanAccounts(loanAndCreditAccounts);
          console.log('🏦 Credit/Loan accounts found:', loanAndCreditAccounts.length);
          console.log('🏦 Account names:', loanAndCreditAccounts.map(a => a.name));
        } else {
          console.error('❌ Failed to load accounts:', accountsResult.error);
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
      amount: getTransactionEditAmountMagnitude(transaction),
      type: getTransactionEditType(transaction),
      categoryId: categorySelectValueForTransaction(transaction),
      memo: transaction.memo || ''
    });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingTransactionId(null);
    setEditFormData({
      date: '',
      payee: '',
      amount: '',
      type: 'outflow',
      categoryId: '',
      memo: ''
    });
  };

  // Handle edit form changes
  const handleEditChange = (field, value) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

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

      // ==================== CHECK IF THIS IS A TRANSFER ====================
      // If this transaction is part of a linked transfer, use the transfer update API
      if (originalTransaction.is_transfer === 1) {
        console.log('🔄 Updating linked transfer transaction');
        
        const newTransferAmount = buildTransferSignedAmount(
          originalTransaction,
          amountValue,
          editFormData.type
        );
        
        // Use the linked transfer update API
        const updateResult = await window.electronAPI.updateLinkedTransfer(transactionId, {
          date: editFormData.date,
          payee: editFormData.payee,
          amount: newTransferAmount,
          memo: editFormData.memo
        });
        
        if (!updateResult.success) {
          throw new Error(updateResult.error || 'Failed to update transfer');
        }
        
        console.log('✅ Transfer updated successfully:', updateResult.data);
        
        await syncAccountDisplayAfterMutation(account.id, userId);

        cancelEditing();

        window.dispatchEvent(new CustomEvent('accounts-updated'));
        window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

        alert('✅ Transfer updated successfully!');
        setIsUpdating(false);
        return;
      }

      // ==================== REGULAR TRANSACTION UPDATE ====================
      const amountUpdate = buildTransactionAmountUpdate(
        originalTransaction,
        amountValue,
        editFormData.type
      );

      const updateData = {
        date: editFormData.date,
        payee: editFormData.payee,
        description: editFormData.payee,
        ...amountUpdate,
        category_id:
          isReadyToAssignSentinel(editFormData.categoryId)
            ? null
            : editFormData.categoryId,
        memo: editFormData.memo || null,
      };

      const updateResult = await window.electronAPI.updateTransaction(transactionId, updateData);
      if (!updateResult.success) {
        throw new Error(updateResult.error || 'Failed to update transaction');
      }

      const newBalance = await syncAccountDisplayAfterMutation(account.id, userId);

      cancelEditing();

      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

      alert(`✅ Transaction updated successfully!\nNew balance: ${formatCurrency(Math.abs(newBalance ?? 0))}`);
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert('Error updating transaction: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // Load categories
  const loadCategories = async () => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        return;
      }
      const userId = userResult.data.id;

      if (window.electronAPI?.getGroupsWithCategories) {
        const grouped = await window.electronAPI.getGroupsWithCategories(userId);
        if (grouped?.success && Array.isArray(grouped.data)) {
          const seen = new Set();
          const flat = [];
          for (const group of grouped.data) {
            const gName = group?.name || '';
            for (const c of group.categories || []) {
              if (!c?.id || seen.has(c.id)) continue;
              if (isCategoryArchived(c)) continue;
              seen.add(c.id);
              flat.push({ ...c, group_name: c.group_name || gName });
            }
          }
          flat.sort((a, b) => {
            const ga = (a.group_name || '').localeCompare(b.group_name || '');
            if (ga !== 0) return ga;
            return (a.name || '').localeCompare(b.name || '');
          });
          setCategories(flat);
          console.log('✅ Categories loaded (grouped flatten):', flat.length);
          return;
        }
      }

      const categoriesResult = await window.electronAPI.getCategories(userId);
      if (categoriesResult?.success) {
        setCategories(categoriesResult.data || []);
        console.log('✅ Categories loaded:', (categoriesResult.data || []).length);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  // Load scheduled transactions for this account
  const normalizeScheduledTransaction = (row) => ({
    ...row,
    transactionType: row.transactionType ?? row.transaction_type ?? 'outflow',
    categoryId: row.categoryId ?? row.category_id ?? null,
  });

  const loadScheduledTransactions = async () => {
    try {
      if (window.electronAPI.getScheduledTransactions && account?.id) {
        const result = await window.electronAPI.getScheduledTransactions(account.id);
        if (result?.success) {
          const rows = (result.data || []).map(normalizeScheduledTransaction);
          setScheduledTransactions(rows);
          console.log('📅 Scheduled transactions loaded:', rows.length);
        }
      }
    } catch (error) {
      console.error('Error loading scheduled transactions:', error);
    }
  };

  // Approve a scheduled transaction
  const handleApproveScheduled = async (scheduledTx) => {
    const scheduledId = scheduledTx.id;
    if (!scheduledId || approvingScheduledId) return;

    setApprovingScheduledId(scheduledId);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('Please log in to approve transaction');
        return;
      }

      const userId = userResult.data.id;
      const txType = scheduledTx.transactionType ?? scheduledTx.transaction_type ?? 'outflow';
      const categoryId = scheduledTx.categoryId ?? scheduledTx.category_id ?? null;
      const isExpense = txType === 'outflow';
      const amountValue = Math.abs(parseFloat(scheduledTx.amount));

      let transactionAmount = isExpense ? -amountValue : amountValue;

      const isReadyToAssign = txType === 'inflow' && isReadyToAssignSentinel(categoryId);

      const transactionData = {
        accountId: account.id,
        date: getTodayLocalDate(),
        payee: scheduledTx.payee,
        description: scheduledTx.payee,
        amount: transactionAmount,
        categoryId: isReadyToAssign ? null : categoryId,
        memo: scheduledTx.memo,
        cleared: 1,
        frequency: scheduledTx.frequency || null
      };

      const addResult = await window.electronAPI.addTransaction(transactionData);
      if (!addResult.success) {
        alert('Failed to add transaction: ' + addResult.error);
        return;
      }

      if (window.electronAPI.deleteScheduledTransaction) {
        await window.electronAPI.deleteScheduledTransaction(scheduledId);
      }

      setScheduledTransactions((prev) => prev.filter((tx) => tx.id !== scheduledId));

      const [, newBalance] = await Promise.all([
        loadScheduledTransactions(),
        syncAccountDisplayAfterMutation(account.id, userId),
      ]);

      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

      alert(`✅ Transaction approved and added!\nNew balance: ${formatCurrency(Math.abs(newBalance ?? 0))}`);
    } catch (error) {
      console.error('Error approving scheduled transaction:', error);
      alert('Error approving transaction: ' + error.message);
      await loadScheduledTransactions();
    } finally {
      setApprovingScheduledId(null);
    }
  };

  // Reject/Delete a scheduled transaction
  const handleRejectScheduled = async (scheduledTx) => {
    if (!window.confirm(`Are you sure you want to delete this scheduled transaction?\n\nPayee: ${scheduledTx.payee}\nAmount: ${formatCurrency(scheduledTx.amount)}`)) {
      return;
    }

    try {
      if (window.electronAPI.deleteScheduledTransaction) {
        const result = await window.electronAPI.deleteScheduledTransaction(scheduledTx.id);
        if (result.success) {
          await loadScheduledTransactions();
          alert('✅ Scheduled transaction deleted');
        } else {
          alert('Failed to delete: ' + result.error);
        }
      }
    } catch (error) {
      console.error('Error deleting scheduled transaction:', error);
      alert('Error deleting transaction: ' + error.message);
    }
  };

  // Load regular transactions; returns register sum (all non-deleted rows).
  const loadTransactions = useCallback(async (id, accountOverride = null) => {
    const targetId = id || accountOverride?.id || account?.id;
    if (!targetId) return null;
    const acct = accountOverride ?? account;
    try {
      if (window.electronAPI?.getAccountTransactions) {
        const result = await window.electronAPI.getAccountTransactions(targetId);
        if (result.success) {
          const allActive = (result.data || []).filter(
            (tx) => tx.is_deleted !== 1 && tx.is_deleted !== true
          );
          const namedActive = enrichTransactionsWithCategoryNames(allActive, categories);
          const balances = acct
            ? computeRegisterBalances(acct, namedActive)
            : null;
          const registerSum =
            balances?.working_balance ??
            computeRegisterBalanceFromTransactions(namedActive, acct);
          setRegisterBalance(registerSum);
          setAllTransactions(
            acct
              ? computeTransactionsWithRunningBalance(acct, namedActive)
              : namedActive
          );
          const today = getTodayLocalDate();
          const regularTransactions = namedActive.filter(
            (tx) => tx.date <= today || tx.cleared === 1
          );
          setTransactions(regularTransactions);
          return registerSum;
        }
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
    return null;
  }, [account, categories]);

  useEffect(() => {
    if (!categories?.length) return;
    setTransactions((prev) =>
      prev?.length ? enrichTransactionsWithCategoryNames(prev, categories) : prev
    );
    setAllTransactions((prev) =>
      prev?.length ? enrichTransactionsWithCategoryNames(prev, categories) : prev
    );
  }, [categories]);

  /** Reload account row + transactions and apply register balance on this page only. */
  const syncAccountDisplayAfterMutation = useCallback(async (targetId, userId) => {
    const id = targetId || account?.id;
    if (!id) return null;
    const registerSum = await loadTransactions(id);
    let acct = account;
    if (window.electronAPI?.getAccountById) {
      const result = await window.electronAPI.getAccountById(id, userId);
      if (result?.success && result.data) {
        acct = result.data;
      }
    }
    if (acct && registerSum != null && Number.isFinite(registerSum)) {
      setAccount(
        isPlaidLinkedAccount(acct)
          ? withRegisterDisplayBalance(acct, registerSum)
          : { ...acct, balance: registerSum, working_balance: registerSum }
      );
      return registerSum;
    }
    if (acct) setAccount(acct);
    return acct?.balance ?? null;
  }, [account, loadTransactions]);

  // Categories are required for the register table (inline category dropdown / labels).
  useEffect(() => {
    if (definitiveAccountId) {
      loadCategories();
    }
  }, [definitiveAccountId]);

  useEffect(() => {
    if (showAddTransaction) {
      loadLoanAccounts();
      fetchPayees();
    }
  }, [showAddTransaction]);

  // Listen for account updates
  useEffect(() => {
    const handleAccountsUpdated = () => {
      console.log('🔄 AccountDetailView received accounts-updated event');
      if (definitiveAccountId) {
        setRefreshCounter(prev => prev + 1);
      }
    };
    window.addEventListener('accounts-updated', handleAccountsUpdated);
    return () => window.removeEventListener('accounts-updated', handleAccountsUpdated);
  }, [definitiveAccountId]);

  // Always hydrate the full account row (initial_balance, etc.) — summary cards omit required fields.
  useEffect(() => {
    const targetId = definitiveAccountId || propAccount?.id;
    if (!targetId) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    const fetchAccount = async () => {
      setLoading(true);
      setError(null);
      try {
        const userResult = await window.electronAPI?.getCurrentUser?.();
        const userId = userResult?.data?.id || 2;
        const result = await window.electronAPI?.getAccountById?.(targetId, userId);
        if (result?.success && result.data) {
          if (isMounted) setAccount(result.data);
        } else if (propAccount && isMounted) {
          setAccount(propAccount);
          setError('Account not found');
        } else if (isMounted) {
          setError('Account not found');
        }
      } catch (err) {
        console.error('❌ Fetch error:', err);
        if (isMounted) setError('Failed to load account');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    void fetchAccount();
    return () => {
      isMounted = false;
    };
  }, [propAccount?.id, definitiveAccountId, refreshCounter]);

  // Load transactions once the full account row is available (needs initial_balance).
  useEffect(() => {
    if (!account?.id) return;
    if (!Object.prototype.hasOwnProperty.call(account, 'initial_balance')) return;
    let cancelled = false;
    (async () => {
      const reg = await loadTransactions(account.id, account);
      if (cancelled || reg == null) return;
      setAccount((prev) => {
        if (!prev) return prev;
        return isPlaidLinkedAccount(prev)
          ? withRegisterDisplayBalance(prev, reg)
          : { ...prev, balance: reg, working_balance: reg };
      });
    })();
    loadScheduledTransactions();
    return () => { cancelled = true; };
  }, [account?.id, account?.initial_balance, refreshCounter, loadTransactions]);

  const loadAccountData = async (id) => {
    const targetId = id || account?.id;
    if (!targetId) return;
    try {
      const userResult = await window.electronAPI?.getCurrentUser?.();
      const userId = userResult?.data?.id || 2;
      const result = await window.electronAPI?.getAccountById?.(targetId, userId);
      if (result?.success && result.data) {
        setAccount(result.data);
        if (!isPlaidLinkedAccount(result.data)) {
          setRegisterBalance(null);
        }
      }
    } catch (error) {
      console.error('Error loading account data:', error);
    }
  };

  // Add regular transaction
  const handleAddRegularTransaction = async (amountValue, userId) => {
    if (!account) throw new Error('No account loaded');

    const isCreditOrLoan = account.type === 'credit' || account.type === 'loan';
    const isExpense = newTransaction.transactionType === 'outflow';

    let transactionAmount = 0;

    // ==================== HANDLE CREDIT CARD TRANSFER ====================
    if (newTransaction.isTransfer && newTransaction.transferAccountId) {
      console.log('💳 Processing transfer using linked transfer API');

      // Find the destination account to check if it's a loan
      const destAccount = loanAccounts.find(a => a.id === newTransaction.transferAccountId);
      const isDestLoan = destAccount?.type === 'loan';

      if (isDestLoan && isLoanPayment) {
        // This is a loan payment - use existing loan payment logic
        console.log('🏦 Processing loan payment');
        const result = await createLoanPaymentTransaction(amountValue, userId);
        return result;
      } else {
        // Regular transfer between accounts
        const transferResult = await window.electronAPI.createLinkedTransfer({
          sourceAccountId: account.id,
          destinationAccountId: newTransaction.transferAccountId,
          amount: amountValue,
          date: newTransaction.date,
          sourcePayeeName: newTransaction.payee,
          memo: newTransaction.memo,
          cleared: newTransaction.cleared
        });

        if (!transferResult.success) {
          throw new Error(transferResult.error || 'Failed to create transfer');
        }

        console.log('✅ Transfer created:', transferResult.data);
        const newBal = await syncAccountDisplayAfterMutation(account.id, userId);
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        return newBal ?? transferResult.data.sourceNewBalance;
      }
    }

    // ==================== HANDLE REGULAR TRANSACTION (Non-transfer) ====================
    // Save payee to payees table if this is a regular transaction
    let finalPayeeId = newTransaction.payeeId;
    if (!newTransaction.isTransfer && newTransaction.payee && !finalPayeeId) {
      try {
        const payeeResult = await window.electronAPI.createOrUpdatePayee({
          name: newTransaction.payee,
          userId: userId,
          isTransferPayee: false
        });
        if (payeeResult?.success && payeeResult?.data?.id) {
          finalPayeeId = payeeResult.data.id;
          console.log('💾 Saved new payee:', newTransaction.payee, 'ID:', finalPayeeId);
        }
      } catch (payeeError) {
        console.warn('Failed to save payee, continuing with transaction:', payeeError);
      }
    }

    // Calculate transaction amount based on account type
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

    const isReadyToAssign = newTransaction.transactionType === 'inflow' &&
      isReadyToAssignSentinel(newTransaction.categoryId);

    const transactionData = {
      accountId: account.id,
      date: newTransaction.date,
      payee: newTransaction.payee,
      description: newTransaction.payee,
      amount: transactionAmount,
      categoryId: isReadyToAssign ? null : newTransaction.categoryId,
      memo: newTransaction.memo,
      cleared: newTransaction.cleared ? 1 : 0,
      frequency: newTransaction.frequency || null,
      // Add payee tracking
      payeeId: finalPayeeId,
      // Add transfer flags (false for regular transaction)
      isTransfer: 0,
      transferAccountId: null
    };

    console.log('📝 Creating regular transaction:', transactionData);

    const result = await window.electronAPI.addTransaction(transactionData);
    if (!result.success) {
      throw new Error(result.error || 'Failed to add transaction');
    }

    const newBalance = await syncAccountDisplayAfterMutation(account.id, userId);
    console.log(`✅ Regular transaction added. Display balance: ${newBalance}`);
    return newBalance;
  };

  // Create loan payment transaction (simplified version)
  const createLoanPaymentTransaction = async (amountValue, userId) => {
    console.log('🔷 LOAN PAYMENT: Starting...');
    console.log('Amount:', amountValue);
    console.log('To loan account:', selectedLoanAccount?.name, selectedLoanAccount?.id);

    if (!amountValue || amountValue <= 0) throw new Error('Invalid amount');
    if (!selectedLoanAccount) throw new Error('No loan account selected');
    if (!account) throw new Error('No source account');

    // Check if this is the first payment of the month for interest calculation
    const paymentMonth = newTransaction.date.substring(0, 7);
    let isFirstPaymentOfMonth = true;
    try {
      const loanTransactions = await window.electronAPI.getAccountTransactions(selectedLoanAccount.id);
      if (loanTransactions?.success) {
        const paymentsThisMonth = loanTransactions.data.filter(tx => 
          tx.date && tx.date.startsWith(paymentMonth) && 
          (tx.is_loan_payment_inflow === 1 || tx.is_transfer === 1)
        );
        isFirstPaymentOfMonth = paymentsThisMonth.length === 0;
      }
    } catch (err) {
      console.warn('Could not check previous payments, assuming first payment:', err);
    }
    
    // Calculate payment breakdown
    const breakdown = calculatePaymentBreakdown(selectedLoanAccount, amountValue, isFirstPaymentOfMonth);
    if (!breakdown) throw new Error('Failed to calculate payment breakdown');

    console.log('Breakdown:', breakdown);

    // ========== STEP 1: Create OUTFLOW in checking account ==========
    const outflowData = {
      accountId: account.id,
      userId: userId,
      date: newTransaction.date,
      description: formatPaymentPayeeName(selectedLoanAccount.name),
      amount: -amountValue,
      payee: formatPaymentPayeeName(selectedLoanAccount.name),
      memo: newTransaction.memo || `Loan payment to ${selectedLoanAccount.name}`,
      cleared: newTransaction.cleared ? 1 : 0,
      isTransfer: 1,
      transferAccountId: selectedLoanAccount.id
    };

    console.log('📤 Creating outflow transaction...');
    const outflowResult = await window.electronAPI.addTransaction(outflowData);
    
    if (!outflowResult.success) {
      throw new Error('Failed to create outflow: ' + outflowResult.error);
    }

    const outflowTransaction = outflowResult.data;
    const outflowId = outflowTransaction.id;
    console.log('✅ Outflow created with ID:', outflowId);

    // ========== STEP 2: Create INFLOW in loan account ==========
    const inflowData = {
      accountId: selectedLoanAccount.id,
      userId: userId,
      date: newTransaction.date,
      description: formatTransferPayeeName(account.name),
      amount: breakdown.principalPortion,
      payee: formatTransferPayeeName(account.name),
      memo: newTransaction.memo || `Payment from ${account.name}`,
      cleared: newTransaction.cleared ? 1 : 0,
      isTransfer: 1,
      transferAccountId: account.id,
      linkedTransactionId: outflowId,
      isLoanPaymentInflow: true,
      isPrincipalPayment: true
    };

    console.log('📥 Creating inflow transaction...');
    const inflowResult = await window.electronAPI.addTransaction(inflowData);
    
    if (!inflowResult.success) {
      console.error('❌ Inflow creation failed:', inflowResult.error);
      throw new Error('Failed to create inflow: ' + inflowResult.error);
    }

    const inflowTransaction = inflowResult.data;
    const inflowId = inflowTransaction.id;
    console.log('✅ Inflow created with ID:', inflowId);

    // ========== STEP 3: Link outflow to inflow ==========
    try {
      await window.electronAPI.updateTransaction(outflowId, {
        linked_transaction_id: inflowId
      });
      console.log('✅ Transactions linked: outflow', outflowId, '<-> inflow', inflowId);
    } catch (linkError) {
      console.warn('⚠️ Could not link transactions:', linkError.message);
    }

    // ========== STEP 4: Create interest transaction if needed ==========
    if (breakdown.interestPortion > 0 && isFirstPaymentOfMonth) {
      const interestData = {
        accountId: selectedLoanAccount.id,
        userId: userId,
        date: newTransaction.date,
        description: `Interest Charge - ${selectedLoanAccount.name}`,
        amount: -breakdown.interestPortion,
        payee: `Interest Charge - ${selectedLoanAccount.name}`,
        memo: `Monthly interest at ${breakdown.interestRate}% APR`,
        cleared: 1,
        isInterestCharge: true,
        interestRate: breakdown.interestRate
      };

      console.log('💰 Creating interest transaction...');
      const interestResult = await window.electronAPI.addTransaction(interestData);
      if (interestResult.success) {
        console.log('✅ Interest created with ID:', interestResult.data.id);
      } else {
        console.warn('⚠️ Interest creation failed:', interestResult.error);
      }
    }

    const newBalance = await syncAccountDisplayAfterMutation(account.id, userId);

    console.log('🔷 LOAN PAYMENT: Complete!');
    
    return newBalance;
  };

  // Add scheduled transaction
  const handleAddScheduledTransaction = async (amountValue, userId) => {
    const scheduledData = {
      accountId: account.id,
      date: newTransaction.date,
      payee: newTransaction.payee,
      amount: amountValue,
      transactionType: newTransaction.transactionType,
      categoryId: newTransaction.categoryId,
      memo: newTransaction.memo,
      userId: userId,
      status: 'pending',
      frequency: newTransaction.frequency || null,
      isLoanPayment: isLoanPayment,
      loanAccountId: selectedLoanAccount?.id,
      paymentBreakdown: paymentBreakdown
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

  // Main handler for adding transactions
  const handleAddTransaction = async () => {
    setAddTransactionError(null);

    const amountValue = parseFloat(newTransaction.amount);
    const isFuture = isFutureLocalDate(newTransaction.date);

    if (isNaN(amountValue) || amountValue === 0) {
      setAddTransactionError('Please enter a valid amount');
      return;
    }
    if (!newTransaction.payee.trim()) {
      setAddTransactionError('Please select or enter a payee');
      return;
    }

    if (!newTransaction.isTransfer && !newTransaction.categoryId) {
      setAddTransactionError('Please select a category');
      return;
    }

    setIsSubmitting(true);

    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        setAddTransactionError('Please log in to add transaction');
        return;
      }

      const userId = userResult.data.id;

      if (isFuture) {
        await handleAddScheduledTransaction(amountValue, userId);
        await loadScheduledTransactions();
        const [year, month, day] = newTransaction.date.split('-');
        const displayDate = new Date(year, month - 1, day).toLocaleDateString();
        let frequencyMessage = '';
        if (newTransaction.frequency) {
          frequencyMessage = `\n\n🔄 This is a ${newTransaction.frequency} recurring transaction.`;
        }
        let loanMessage = '';
        if (newTransaction.isTransfer && isLoanPayment && selectedLoanAccount) {
          loanMessage = `\n\n🏦 This is a payment to ${selectedLoanAccount.name}. Interest will be calculated on the approval date.`;
        }
        alert(`📅 Scheduled transaction added for ${displayDate}${frequencyMessage}${loanMessage}\n\nThis will NOT affect your balance until approved on that date.`);
      } else {
        const newBalance = await handleAddRegularTransaction(amountValue, userId);
        let frequencyMessage = '';
        if (newTransaction.frequency) {
          frequencyMessage = `\n\n🔄 This is a ${newTransaction.frequency} recurring transaction.`;
        }
        let loanMessage = '';
        if (newTransaction.isTransfer && isLoanPayment && selectedLoanAccount && paymentBreakdown) {
          loanMessage = `\n\n🏦 Payment to ${selectedLoanAccount.name}:\n   • Total Payment: ${formatCurrency(paymentBreakdown.paymentAmount)}\n   • Interest: ${formatCurrency(paymentBreakdown.interestPortion)}\n   • Principal: ${formatCurrency(paymentBreakdown.principalPortion)}\n   • New Balance: ${formatCurrency(paymentBreakdown.newBalance)}`;
          if (paymentBreakdown.isFirstPaymentOfMonth && paymentBreakdown.interestPortion > 0) {
            loanMessage += `\n\n💡 Interest calculated at ${paymentBreakdown.interestRate}% APR (${paymentBreakdown.monthlyRate.toFixed(2)}% monthly)`;
          } else if (!paymentBreakdown.isFirstPaymentOfMonth && paymentBreakdown.interestPortion === 0) {
            loanMessage += `\n\n💡 Since you've already made a payment this month, the entire payment goes to principal (no additional interest).`;
          }
        }

        let autoTransferMessage = '';
        if (account.type === 'credit' && !newTransaction.isTransfer && newTransaction.transactionType === 'outflow' && newTransaction.categoryId) {
          autoTransferMessage = `\n\n💳 Auto-transfer: $${amountValue.toFixed(2)} moved from "${categories.find(c => c.id === newTransaction.categoryId)?.name || 'spending category'}" to "${account.name} Payment" category.`;
        }

        alert(`✅ Transaction added successfully!${frequencyMessage}${loanMessage}${autoTransferMessage}\n\nNew balance: ${formatCurrency(Math.abs(newBalance ?? 0))}`);
      }

      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

      setShowAddTransaction(false);
      setNewTransaction({
        date: getTodayLocalDate(),
        payee: '',
        payeeId: null,
        isTransfer: false,
        transferAccountId: null,
        amount: '',
        transactionType: 'outflow',
        categoryId: '',
        memo: '',
        cleared: true,
        frequency: ''
      });
      setIsLoanPayment(false);
      setSelectedLoanAccount(null);
      setPaymentBreakdown(null);
      fetchPayees();

    } catch (error) {
      console.error('Error adding transaction:', error);
      setAddTransactionError(error.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatAccountNumber = (number) => {
    if (!number) return 'Not provided';
    const last4 = number.slice(-4);
    return `•••• •••• •••• ${last4}`;
  };

  const filteredCategories = getFilteredCategories();
  const isFutureDate = isFutureLocalDate(newTransaction.date);

  const displayBalance = useMemo(
    () => getAccountDetailDisplayBalance(account, allTransactions, registerBalance),
    [account, allTransactions, registerBalance]
  );

  const accountBalances = useMemo(() => {
    if (!account || !allTransactions.length) {
      return registerBalance != null
        ? {
            working_balance: registerBalance,
            cleared_balance: registerBalance,
            uncleared_balance: 0,
            initial_balance: Number(account?.initial_balance) || 0,
          }
        : null;
    }
    return computeRegisterBalances(account, allTransactions);
  }, [account, allTransactions, registerBalance]);

  const filteredTransactions = useMemo(
    () =>
      filterTransactions(allTransactions.length ? allTransactions : transactions, transactionFilters, {
        categories,
        fixedAccountId: account?.id,
      }),
    [allTransactions, transactions, transactionFilters, categories, account?.id]
  );

  const sortedTransactions = useMemo(
    () => sortTransactions(filteredTransactions, transactionSort, { categories }),
    [filteredTransactions, transactionSort, categories]
  );

  const totalTransactionCount = sortedTransactions.length;
  const totalTransactionPages = Math.max(
    1,
    Math.ceil(totalTransactionCount / transactionsPerPage) || 1
  );
  const safeTransactionsPage = Math.min(transactionsPage, totalTransactionPages);

  const paginatedTransactions = useMemo(() => {
    const start = (safeTransactionsPage - 1) * transactionsPerPage;
    return sortedTransactions.slice(start, start + transactionsPerPage);
  }, [sortedTransactions, safeTransactionsPage, transactionsPerPage]);

  useEffect(() => {
    setTransactionsPage(1);
  }, [transactions.length, transactionSort, transactionsPerPage, transactionFilters]);

  useEffect(() => {
    if (transactionsPage > totalTransactionPages) {
      setTransactionsPage(totalTransactionPages);
    }
  }, [transactionsPage, totalTransactionPages]);

  const registerTransactionsForSelection = useMemo(
    () => (allTransactions.length ? allTransactions : transactions),
    [allTransactions, transactions],
  );

  useEffect(() => {
    setSelectedTransactions(new Set());
  }, [account?.id]);

  useEffect(() => {
    setSelectedTransactions((prev) => {
      const pruned = pruneTransactionSelection(prev, registerTransactionsForSelection);
      if (pruned.size === prev.size) {
        let unchanged = true;
        for (const id of prev) {
          if (!pruned.has(id)) {
            unchanged = false;
            break;
          }
        }
        if (unchanged) return prev;
      }
      return pruned;
    });
  }, [registerTransactionsForSelection]);

  const handleSelectTransaction = useCallback((transactionId) => {
    const key = normalizeTransactionId(transactionId);
    if (!key) return;
    setSelectedTransactions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const scopeIds = sortedTransactions
      .map((t) => normalizeTransactionId(t.id))
      .filter(Boolean);
    if (!scopeIds.length) return;
    setSelectedTransactions((prev) => {
      const next = new Set(prev);
      const allScopeSelected = scopeIds.every((id) => next.has(id));
      if (allScopeSelected) {
        scopeIds.forEach((id) => next.delete(id));
      } else {
        scopeIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [sortedTransactions]);

  const effectiveSelectedCount = useMemo(
    () => countSelectedInList(selectedTransactions, registerTransactionsForSelection),
    [selectedTransactions, registerTransactionsForSelection],
  );

  const selectedTransactionsListForDelete = useMemo(
    () =>
      registerTransactionsForSelection.filter((t) =>
        isTransactionSelected(selectedTransactions, t.id),
      ),
    [registerTransactionsForSelection, selectedTransactions],
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedTransactionsListForDelete.length === 0) {
      alert('Please select at least one transaction to delete.');
      return;
    }
    setShowDeleteModal(true);
  }, [selectedTransactionsListForDelete.length]);

  const confirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('Please log in to delete transactions');
        return;
      }

      const userId = userResult.data.id;
      const selectedIds = selectedTransactionsListForDelete.map((t) => t.id);
      const selectedCount = selectedIds.length;

      if (!selectedIds.length) {
        alert('Please select at least one transaction to delete.');
        return;
      }

      if (!window.electronAPI?.bulkDeleteTransactions) {
        throw new Error('Bulk delete is not available. Restart the app and try again.');
      }

      const deleteResult = await window.electronAPI.bulkDeleteTransactions(selectedIds);
      if (!deleteResult?.success) {
        throw new Error(deleteResult?.error || 'Bulk delete failed');
      }

      const newBalance = await syncAccountDisplayAfterMutation(account.id, userId);

      setSelectedTransactions(new Set());
      setShowDeleteModal(false);

      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

      alert(
        `✅ Successfully deleted ${deleteResult.data?.deleted ?? selectedCount} transaction(s)!\nNew balance: ${formatCurrency(newBalance)}`,
      );
    } catch (error) {
      console.error('Error deleting transactions:', error);
      alert('Error deleting transactions: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  }, [account?.id, selectedTransactionsListForDelete, syncAccountDisplayAfterMutation]);

  const transactionRangeStart = totalTransactionCount === 0
    ? 0
    : (safeTransactionsPage - 1) * transactionsPerPage + 1;
  const transactionRangeEnd = Math.min(
    safeTransactionsPage * transactionsPerPage,
    totalTransactionCount
  );

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading account details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>{error}</div>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
      </div>
    );
  }

  if (!account) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>Account not found</div>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
      </div>
    );
  }

  const isCreditCard = account.type === 'credit';
  const creditLimit = account.credit_limit || account.limit || 0;
  const availableCredit = isCreditCard
    ? computeAvailableCredit(creditLimit, displayBalance)
    : 0;

  // Check if this is a loan account for special display
  const isLoanAccount = account.type === 'loan';

  // Calculate loan statistics if this is a loan account
  const loanStats = isLoanAccount ? (() => {
    const originalBalance = account.original_balance || Math.abs(displayBalance);
    const progress = originalBalance > 0 ? ((originalBalance - Math.abs(displayBalance)) / originalBalance) * 100 : 0;
    return { progress: Math.min(100, Math.max(0, progress)), originalBalance };
  })() : null;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
        <div style={styles.headerTitle}>
          <h2 style={styles.title}>{account.name}</h2>
          <span style={styles.accountType}>
            {isCreditCard ? '💳 Credit Card' : isLoanAccount ? '🏦 Loan' : account.type || 'Account'}
            {account.institution && ` • ${account.institution}`}
          </span>
        </div>
        <button onClick={() => setRefreshCounter(prev => prev + 1)} style={styles.refreshButton}>
          🔄 Refresh
        </button>
        {(isCreditCard || isLoanAccount) && (
          <button
            onClick={() => {
              if (isCreditCard && onMakePayment) {
                onMakePayment(account.id);
              } else if (isLoanAccount) {
                alert(`💡 How to make a payment to "${account.name}":\n\n1. Go to your CHECKING or SAVINGS account page\n2. Click "Add Transaction"\n3. Set Payee to "${formatPaymentPayeeName(account.name)}"\n4. Enter the payment amount\n5. The system will automatically calculate:\n   • Interest portion (first payment of month)\n   • Principal reduction\n   • Update both account balances\n\nThis ensures accurate interest calculations and proper tracking.`);
              }
            }}
            style={styles.paymentButton}
          >
            💰 Make Payment
          </button>
        )}
      </div>

      <PlaidAccountSyncBanner account={account} />

      {/* Account Summary — three-tier balances */}
      {accountBalances && (
        <AccountBalanceSummary
          account={account}
          balances={accountBalances}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Credit / loan extras below balance summary */}
      {(isCreditCard || isLoanAccount) && (
      <div style={styles.summaryCard}>
        <div style={styles.summaryRow}>
          {isCreditCard && (
            <>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Credit Limit</div>
                <div style={styles.summaryValue}>{formatCurrency(creditLimit)}</div>
              </div>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Available Credit</div>
                <div style={styles.summaryValue}>{formatCurrency(availableCredit)}</div>
              </div>
            </>
          )}
          {isLoanAccount && loanStats && (
            <>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Original Balance</div>
                <div style={styles.summaryValue}>{formatCurrency(loanStats.originalBalance)}</div>
              </div>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Progress</div>
                <div style={styles.summaryValue}>{loanStats.progress.toFixed(1)}%</div>
              </div>
            </>
          )}
        </div>
        {isLoanAccount && loanStats && (
          <div style={styles.progressSection}>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${loanStats.progress}%` }} />
            </div>
          </div>
        )}
      </div>
      )}

      {/* Info Banner for Loan Accounts - Shows how to make payments */}
      {isLoanAccount && (
        <div style={styles.infoBanner}>
          <div style={styles.infoBannerIcon}>ℹ️</div>
          <div style={styles.infoBannerContent}>
            <strong>📋 Making Loan Payments:</strong><br />
            To pay down this loan, go to your <strong>checking or savings account</strong> and create a transaction with payee:<br />
            <code style={styles.codeExample}>{formatPaymentPayeeName(account.name)}</code><br />
            The system will automatically calculate interest (first payment of month) and apply the rest to principal.
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
                        {tx.isLoanPayment ? '🏦 Loan Payment (Auto)' : (category?.name || 'Uncategorized')}
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
                        style={{
                          ...styles.approveButton,
                          ...(approvingScheduledId === tx.id ? styles.approveButtonBusy : {}),
                        }}
                        title="Approve and move to transactions"
                        disabled={!!approvingScheduledId}
                      >
                        {approvingScheduledId === tx.id ? '⏳ Approving…' : '✅ Approve'}
                      </button>
                      <button
                        onClick={() => handleRejectScheduled(tx)}
                        style={styles.rejectButton}
                        title="Delete scheduled transaction"
                        disabled={!!approvingScheduledId}
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

      {/* Regular Transactions Header */}
      <div style={styles.transactionsHeader}>
        <div>
          <h3 style={styles.transactionsTitle}>Recent Transactions</h3>
          <p style={styles.transactionsCountMeta}>
            {totalTransactionCount === 0
              ? '0 transactions'
              : `${totalTransactionCount} transaction${totalTransactionCount === 1 ? '' : 's'} total`}
          </p>
        </div>
        <div style={styles.headerButtons}>
          {effectiveSelectedCount > 0 && (
            <button
              onClick={handleDeleteSelected}
              style={styles.deleteSelectedButton}
            >
              🗑️ Delete Selected ({effectiveSelectedCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            style={styles.importButton}
            title="Import transactions from CSV"
          >
            Import CSV
          </button>
          <button onClick={() => setShowAddTransaction(true)} style={styles.addButton}>
            + Add Transaction
          </button>
        </div>
      </div>

      {/* Regular Transactions List */}
      <div style={styles.transactionsList}>
        {transactions.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No transactions yet</p>
            <button onClick={() => setShowAddTransaction(true)} style={styles.emptyAddButton}>
              + Add Your First Transaction
            </button>
          </div>
        ) : (
          <>
            <TransactionToolbar
              filters={transactionFilters}
              onFiltersChange={setTransactionFilters}
              categories={categories}
              accounts={account ? [account] : []}
              hideAccountFilter
              resultCount={sortedTransactions.length}
              totalCount={transactions.length}
            />

            <div style={styles.transactionsPaginationBar}>
              <label style={styles.perPageLabel}>
                Per page
                <select
                  value={transactionsPerPage}
                  onChange={(e) => setTransactionsPerPage(Number(e.target.value))}
                  style={styles.perPageSelect}
                >
                  {TRANSACTIONS_PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span style={styles.paginationSummary}>
                Showing {transactionRangeStart}–{transactionRangeEnd} of {totalTransactionCount}
              </span>
              <div style={styles.paginationNav}>
                <button
                  type="button"
                  style={styles.paginationButton}
                  disabled={safeTransactionsPage <= 1}
                  onClick={() => setTransactionsPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={styles.paginationPageLabel}>
                  Page {safeTransactionsPage} of {totalTransactionPages}
                </span>
                <button
                  type="button"
                  style={styles.paginationButton}
                  disabled={safeTransactionsPage >= totalTransactionPages}
                  onClick={() =>
                    setTransactionsPage((p) => Math.min(totalTransactionPages, p + 1))
                  }
                >
                  Next
                </button>
              </div>
            </div>

            <TransactionTable
              transactions={paginatedTransactions}
              categories={editableCategories}
              sort={transactionSort}
              onSortChange={setTransactionSort}
              formatDate={formatDisplayDate}
              showRunningBalance
              formatRunningBalance={(bal) => formatBalanceDisplay(bal, account?.type)}
              enableInlineEdit
              onInlineUpdate={handleInlineUpdate}
              isInlineEditDisabled={isInlineEditDisabled}
              isCategoryInlineDisabled={isCategoryInlineDisabled}
              isPayeeInlineDisabled={isPayeeInlineDisabled}
              registerPayees={registerPayees}
              registerPayeesLoading={registerPayeesLoading}
              emptyMessage="No transactions match your search or filters"
              showCheckbox
              selectedIds={selectedTransactions}
              onToggleSelect={(txId) => handleSelectTransaction(txId)}
              onSelectAll={handleSelectAll}
                            allSelected={
                                paginatedTransactions.length > 0 &&
                                paginatedTransactions.every((t) =>
                                  isTransactionSelected(selectedTransactions, t.id),
                                )
                            }
              editingId={editingTransactionId}
              renderPayeeExtra={(tx) => {
                const isInflowToLoan =
                  isLoanAccount &&
                  tx.amount > 0 &&
                  (tx.isLoanPaymentInflow === true || tx.is_transfer === 1);
                const isInterestCharge = tx.isInterestCharge === true;
                const isPrincipalPayment = tx.isPrincipalPayment === true;
                return (
                  <RegisterPayeeExtras
                    transaction={tx}
                    extra={
                      <>
                        {isInterestCharge && (
                          <div style={styles.interestBadgeSmall}>💰 Interest Charge</div>
                        )}
                        {isPrincipalPayment && (
                          <div style={styles.principalBadgeSmall}>📉 Principal Payment</div>
                        )}
                        {isInflowToLoan && !isInterestCharge && !isPrincipalPayment && (
                          <div style={styles.paymentBadgeSmall}>💵 Payment Received</div>
                        )}
                        {tx.isLoanPayment && !isInflowToLoan && !isInterestCharge && (
                          <div style={styles.loanPaymentBadgeSmall}>🏦 Loan Payment</div>
                        )}
                      </>
                    }
                  />
                );
              }}
              renderEditRow={(tx) => {
                const isTransfer = tx.is_transfer === 1;
                const editCategories = [
                  ...(isIncomeTransaction(tx)
                    ? buildIncomeCategoryOptions(editableCategories)
                    : []),
                  ...getAllCategories(),
                ];
                return (
                  <tr key={tx.id} style={{ background: 'rgba(16, 185, 129, 0.08)' }}>
                    <td style={styles.tableEditCell}>
                      <input type="checkbox" disabled style={styles.checkbox} />
                    </td>
                    <td style={styles.tableEditCell}>
                      <input
                        type="date"
                        value={editFormData.date}
                        onChange={(e) => handleEditChange('date', e.target.value)}
                        style={styles.editInput}
                        readOnly={isPlaidImportedTransaction(tx)}
                        disabled={isPlaidImportedTransaction(tx)}
                      />
                    </td>
                    <td style={styles.tableEditCell}>
                      <input
                        type="text"
                        value={editFormData.payee}
                        onChange={(e) => handleEditChange('payee', e.target.value)}
                        style={styles.editInput}
                        placeholder="Payee"
                      />
                    </td>
                    <td style={styles.tableEditCell}>
                      <select
                        value={editFormData.categoryId}
                        onChange={(e) => handleEditChange('categoryId', e.target.value)}
                        style={styles.editSelect}
                        disabled={isTransfer}
                      >
                        <option value="">Select category</option>
                        {editCategories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={styles.tableEditCell}>
                      <input
                        type="number"
                        value={editFormData.type === 'outflow' ? editFormData.amount : ''}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            type: 'outflow',
                            amount: e.target.value,
                          }))
                        }
                        style={styles.editInput}
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                      />
                    </td>
                    <td style={styles.tableEditCell}>
                      <input
                        type="number"
                        value={editFormData.type === 'inflow' ? editFormData.amount : ''}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            type: 'inflow',
                            amount: e.target.value,
                          }))
                        }
                        style={styles.editInput}
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                      />
                    </td>
                    <td style={styles.tableEditCell}>
                      <button
                        onClick={() => saveEditedTransaction(tx.id)}
                        style={styles.saveButton}
                        disabled={isUpdating}
                      >
                        {isUpdating ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEditing}
                        style={styles.cancelButton}
                        disabled={isUpdating}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              }}
              renderActions={(tx) => (
                <RegisterTransactionActions
                  transaction={tx}
                  onEdit={startEditing}
                  onDelete={handleDeleteRow}
                  onToggleCleared={handleToggleClearedRow}
                  onSplit={setSplitTransaction}
                />
              )}
            />
          </>
        )}
      </div>

      <TransactionImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        fixedAccountId={account?.id}
        accounts={account ? [account] : []}
        title="Import transactions into this account"
        onComplete={async () => {
          if (account?.id) {
            const userResult = await window.electronAPI.getCurrentUser();
            const userId = userResult?.data?.id;
            if (userId) {
              await syncAccountDisplayAfterMutation(account.id, userId);
            }
            setRefreshCounter((c) => c + 1);
          }
        }}
      />

      <TransactionSplitModal
        open={!!splitTransaction}
        transaction={splitTransaction}
        categories={editableCategories}
        onClose={() => setSplitTransaction(null)}
        onSaved={handleSplitSaved}
      />

      {/* Add Transaction Modal */}
      {showAddTransaction && (
        <div style={styles.modalOverlay} onClick={() => setShowAddTransaction(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Add Transaction</h3>
              <button style={styles.closeButton} onClick={() => setShowAddTransaction(false)}>✕</button>
            </div>

            <div style={styles.modalBody}>
              {addTransactionError && <div style={styles.errorMessage}>⚠️ {addTransactionError}</div>}

              {/* Account Display */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Account</label>
                <div style={styles.accountDisplay}>
                  {account.name} ({account.type}) - Balance: {formatCurrency(Math.abs(displayBalance))}{displayBalance < 0 ? ' (owed)' : ''}
                </div>
              </div>

              {/* Transaction Type Dropdown */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Transaction Type *</label>
                <select
                  value={newTransaction.transactionType}
                  onChange={(e) => {
                    setNewTransaction({
                      ...newTransaction,
                      transactionType: e.target.value,
                      categoryId: ''
                    });
                  }}
                  style={styles.select}
                  disabled={newTransaction.isTransfer}
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
                {newTransaction.isTransfer && (
                  <div style={styles.payeeHint}>
                    💡 Transfer selected. Category will be auto-managed.
                  </div>
                )}
              </div>

              {/* Manual Payee Input (shown when "Other" is selected or payee needs manual entry) */}
              {(newTransaction.payee === '' || (newTransaction.payee && !getAllRoutingPayees(payees).some(p => p.name === newTransaction.payee) &&
                !payees.regularPayees.some(p => p.name === newTransaction.payee))) && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Enter Payee Name</label>
                  <input
                    type="text"
                    value={newTransaction.payee}
                    onChange={(e) => setNewTransaction(prev => ({ ...prev, payee: e.target.value, isTransfer: false }))}
                    style={styles.input}
                    placeholder="Enter payee name (e.g., Starbucks, Rent, Amazon)"
                  />
                </div>
              )}

              {/* Category Dropdown - Grayed out for loan payments */}
              <div style={styles.formGroup}>
                <label style={{ ...styles.label, ...(newTransaction.isTransfer ? styles.disabledLabel : {}) }}>
                  Category {newTransaction.isTransfer && <span style={styles.autoManagedBadge}>(Auto-managed for transfer)</span>}
                </label>
                {newTransaction.isTransfer ? (
                  <div style={styles.transferPaymentInfo}>
                    <div style={styles.transferPaymentBadge}>
                      {isLoanPayment ? '🏦 Loan Payment (Transfer)' : '🔄 Account Transfer'}
                    </div>
                    <div style={styles.transferPaymentMessage}>
                      {isLoanPayment ? (
                        <>This is a payment transfer to <strong>{selectedLoanAccount?.name}</strong>.<br />
                          The payment will be split: interest first, then principal.<br />
                          A corresponding inflow will appear in your loan account.</>
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
                ) : (
                  <select
                    value={newTransaction.categoryId}
                    onChange={(e) => setNewTransaction({ ...newTransaction, categoryId: e.target.value })}
                    style={styles.select}
                  >
                    <option value="">Select a category</option>
                    {filteredCategories.map((category) => (
                      <option key={category.id} value={category.id}>
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
                    value={newTransaction.amount}
                    onChange={(e) => {
                      const newAmount = e.target.value;
                      setNewTransaction({ ...newTransaction, amount: newAmount });
                      if (newTransaction.isTransfer && isLoanPayment && selectedLoanAccount && newAmount && parseFloat(newAmount) > 0) {
                        const breakdown = calculatePaymentBreakdown(selectedLoanAccount, parseFloat(newAmount), true);
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
                  value={newTransaction.date}
                  onChange={(e) => setNewTransaction({ ...newTransaction, date: e.target.value })}
                  style={styles.input}
                />
                {isFutureDate && (
                  <div style={styles.futureDateWarning}>
                    📅 Future date detected. This will be saved as a <strong>scheduled transaction</strong> and will NOT affect your balance until approved on {formatDisplayDate(newTransaction.date)}.
                  </div>
                )}
              </div>

              {/* Frequency Field */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Frequency (Optional)</label>
                <select
                  value={newTransaction.frequency}
                  onChange={(e) => setNewTransaction({ ...newTransaction, frequency: e.target.value })}
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
                  value={newTransaction.memo}
                  onChange={(e) => setNewTransaction({ ...newTransaction, memo: e.target.value })}
                  style={styles.input}
                  placeholder="Additional notes"
                />
              </div>

              {/* Cleared Checkbox */}
              {!isFutureDate && (
                <div style={styles.checkboxGroup}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={newTransaction.cleared}
                      onChange={(e) => setNewTransaction({ ...newTransaction, cleared: e.target.checked })}
                      style={styles.checkbox}
                    />
                    Mark as cleared
                  </label>
                </div>
              )}

              {/* Balance Preview */}
              {!isFutureDate && newTransaction.amount && parseFloat(newTransaction.amount) > 0 && !newTransaction.isTransfer && (
                (() => {
                  const currentBalance = displayBalance;
                  const amountValue = parseFloat(newTransaction.amount) || 0;
                  const balanceChange = calculateBalanceChange(account.type, newTransaction.transactionType, amountValue);
                  const newBalance = currentBalance + balanceChange;

                  const isCreditOrLoan = account.type === 'credit' || account.type === 'loan';
                  const isInflow = newTransaction.transactionType === 'inflow';

                  let actionText = '';
                  if (isCreditOrLoan) {
                    actionText = isInflow ? 'Payment' : 'Purchase';
                  } else {
                    actionText = isInflow ? 'Income' : 'Expense';
                  }

                  return (
                    <div style={styles.balancePreview}>
                      <div style={styles.balancePreviewLabel}>New Balance after transaction:</div>
                      <div style={{
                        ...styles.balancePreviewValue,
                        color: newBalance < 0 ? '#F87171' : '#4ADE80'
                      }}>
                        {formatCurrency(Math.abs(newBalance))}
                        {newBalance < 0 && <span style={styles.balancePreviewOwed}> (you owe)</span>}
                      </div>
                      <div style={styles.balancePreviewDetail}>
                        Current: {formatCurrency(Math.abs(currentBalance))}
                        {currentBalance < 0 && ' (owed)'} →
                        {actionText}: {formatCurrency(amountValue)} →
                        New: {formatCurrency(Math.abs(newBalance))}
                        {newBalance < 0 && ' (owed)'}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => setShowAddTransaction(false)} style={styles.cancelModalButton}>
                Cancel
              </button>
              <button onClick={handleAddTransaction} style={styles.submitButton} disabled={isSubmitting}>
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
                Are you sure you want to delete <strong>{effectiveSelectedCount}</strong> transaction(s)?
              </p>
              <div style={styles.confirmDetails}>
                <div style={styles.confirmDetailItem}>
                  <span>Current Balance:</span>
                  <strong>{formatCurrency(Math.abs(displayBalance))}{displayBalance < 0 ? ' (owed)' : ''}</strong>
                </div>
                {(() => {
                  const selectedTransactionsList = selectedTransactionsListForDelete;
                  const totalImpact = selectedTransactionsList.reduce((sum, t) => sum + calculateBalanceChangeForTransaction(t), 0);
                  return (
                    <div style={styles.confirmDetailItem}>
                      <span>Balance Change:</span>
                      <strong style={{ color: totalImpact >= 0 ? '#4ADE80' : '#F87171' }}>
                        {totalImpact >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalImpact))}
                      </strong>
                    </div>
                  );
                })()}
                <div style={styles.confirmDetailItem}>
                  <span>New Balance:</span>
                  <strong style={{ color: '#4ADE80' }}>
                    {formatCurrency(
                      Math.abs(
                        displayBalance +
                          selectedTransactionsListForDelete.reduce(
                            (sum, t) => sum + calculateBalanceChangeForTransaction(t),
                            0,
                          ),
                      ),
                    )}
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
                {isDeleting ? 'Deleting...' : `Delete ${effectiveSelectedCount} Transaction(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1000px',
    margin: '0 auto',
    color: 'white',
  },
  refreshButton: {
    padding: '0.5rem 1rem',
    background: '#0047AB',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '2rem',
    flexWrap: 'wrap',
  },
  backButton: {
    padding: '0.5rem 1rem',
    background: '#374151',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    margin: '0 0 0.25rem 0',
    color: 'white',
  },
  accountType: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
  },
  paymentButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  summaryCard: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '2rem',
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem',
  },
  summaryItem: {
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    lineHeight: '1.2',
  },
  negativeIndicator: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    display: 'block',
    fontWeight: 'normal',
  },
  registerBalanceNote: {
    fontSize: '0.7rem',
    color: '#6B7280',
    marginTop: '0.35rem',
    fontWeight: 'normal',
  },
  progressSection: {
    marginTop: '1rem',
    paddingTop: '0.5rem',
  },
  progressBar: {
    height: '0.5rem',
    background: '#374151',
    borderRadius: '0.25rem',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #0047AB, #8B5CF6)',
    transition: 'width 0.3s ease',
  },
  infoBanner: {
    background: 'linear-gradient(135deg, #1E3A5F, #0F172A)',
    border: '1px solid #0047AB',
    borderRadius: '0.75rem',
    padding: '1rem',
    marginBottom: '2rem',
    display: 'flex',
    gap: '1rem',
    alignItems: 'flex-start',
  },
  infoBannerIcon: {
    fontSize: '1.5rem',
    color: '#0047AB',
  },
  infoBannerContent: {
    flex: 1,
    fontSize: '0.875rem',
    color: '#D1D5DB',
    lineHeight: '1.5',
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
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '2rem',
    overflow: 'hidden',
  },
  scheduledHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    background: '#111827',
    cursor: 'pointer',
    borderBottom: '1px solid #374151',
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
    borderBottom: '1px solid #374151',
    gap: '1rem',
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
    gap: '0.25rem',
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
  },
  approveButtonBusy: {
    opacity: 0.85,
    cursor: 'wait',
  },
  rejectButton: {
    padding: '0.25rem 0.75rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  transactionsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  transactionsTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: 0,
    color: 'white',
  },
  transactionsCountMeta: {
    margin: '0.35rem 0 0',
    fontSize: '0.8125rem',
    color: '#9CA3AF',
    fontWeight: 500,
  },
  transactionsPaginationBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem 1rem',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #374151',
    background: '#111827',
    fontSize: '0.8125rem',
    color: '#9CA3AF',
  },
  perPageLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#D1D5DB',
  },
  perPageSelect: {
    padding: '0.35rem 0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid #374151',
    background: '#1F2937',
    color: 'white',
    fontSize: '0.8125rem',
  },
  paginationSummary: {
    flex: '1 1 auto',
    textAlign: 'center',
    minWidth: '11rem',
  },
  paginationNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  paginationButton: {
    padding: '0.35rem 0.75rem',
    borderRadius: '0.375rem',
    border: '1px solid #374151',
    background: '#374151',
    color: 'white',
    fontSize: '0.8125rem',
    cursor: 'pointer',
  },
  paginationPageLabel: {
    color: '#E5E7EB',
    fontSize: '0.8125rem',
    whiteSpace: 'nowrap',
  },
  headerButtons: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  addButton: {
    padding: '0.5rem 1rem',
    background: 'linear-gradient(135deg, #0047AB, #001a40)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  importButton: {
    padding: '0.5rem 1rem',
    background: 'rgba(255,255,255,0.12)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  deleteSelectedButton: {
    padding: '0.5rem 1rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  transactionsList: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    overflow: 'hidden',
  },
  transactionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #374151',
    background: '#111827',
    fontWeight: '600',
    color: '#9CA3AF',
    fontSize: '0.75rem',
  },
  checkboxCell: {
    width: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionDateHeader: {
    width: '100px',
  },
  transactionDescriptionHeader: {
    flex: 1,
    minWidth: 0,
  },
  transactionCategoryHeader: {
    flex: 1,
    minWidth: '120px',
  },
  transactionAmountHeader: {
    width: '100px',
    textAlign: 'right',
  },
  transactionActionsHeader: {
    width: '100px',
    textAlign: 'center',
  },
  emptyState: {
    padding: '3rem',
    textAlign: 'center',
    color: '#9CA3AF',
  },
  emptyAddButton: {
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    background: '#0047AB',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
  },
  transactionItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #374151',
    transition: 'background-color 0.2s',
  },
  transactionRowEditing: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #374151',
    background: 'rgba(16, 185, 129, 0.1)',
  },
  transactionDate: {
    width: '100px',
    fontSize: '0.875rem',
    color: '#9CA3AF',
  },
  transactionDescription: {
    flex: 1,
    minWidth: 0,
    margin: '0 0.5rem',
  },
  transactionCategory: {
    flex: 1,
    minWidth: '120px',
    fontSize: '0.875rem',
    color: '#9CA3AF',
    margin: '0 0.5rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  transactionAmount: {
    fontSize: '1rem',
    fontWeight: '600',
    width: '100px',
    textAlign: 'right',
  },
  transactionActions: {
    width: '100px',
    display: 'flex',
    justifyContent: 'center',
    gap: '0.5rem',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  editButton: {
    padding: '0.25rem 0.75rem',
    background: '#0047AB',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  saveButton: {
    padding: '0.25rem 0.75rem',
    background: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '0.25rem 0.75rem',
    background: '#6B7280',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  editInput: {
    width: '90%',
    padding: '0.4rem',
    background: '#111827',
    border: '1px solid #10B981',
    borderRadius: '0.375rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  editSelect: {
    width: '100%',
    padding: '0.4rem',
    background: '#111827',
    border: '1px solid #10B981',
    borderRadius: '0.375rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  tableEditCell: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #374151',
    verticalAlign: 'middle',
  },
  editAmountWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  currencySymbolSmall: {
    position: 'absolute',
    left: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.7rem',
  },
  editAmountInput: {
    width: '100%',
    padding: '0.4rem 0.4rem 0.4rem 1.5rem',
    background: '#111827',
    border: '1px solid #10B981',
    borderRadius: '0.375rem',
    color: 'white',
    fontSize: '0.875rem',
    textAlign: 'right',
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
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    background: '#1F2937',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    borderBottom: '1px solid #374151',
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'white',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
  },
  modalBody: {
    padding: '1.5rem',
    overflowY: 'auto',
    flex: 1,
  },
  modalFooter: {
    display: 'flex',
    gap: '1rem',
    padding: '1.5rem',
    borderTop: '1px solid #374151',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    fontWeight: '500',
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
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
    cursor: 'pointer',
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
    color: '#6B7280',
  },
  payeeHint: {
    marginTop: '0.25rem',
    fontSize: '0.65rem',
    color: '#6B7280',
  },
  inputWrapper: {
    position: 'relative',
  },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF',
    zIndex: 1,
  },
  modalInput: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  checkboxGroup: {
    marginTop: '0.5rem',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  balancePreview: {
    marginTop: '1rem',
    padding: '0.75rem',
    background: '#111827',
    borderRadius: '0.5rem',
    border: '1px solid #374151',
    textAlign: 'center',
  },
  balancePreviewLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem',
  },
  balancePreviewValue: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
  },
  balancePreviewOwed: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    display: 'inline',
    marginLeft: '0.25rem',
  },
  balancePreviewDetail: {
    fontSize: '0.65rem',
    color: '#6B7280',
    marginTop: '0.5rem',
  },
  errorMessage: {
    marginTop: '0.75rem',
    padding: '0.5rem',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #EF4444',
    borderRadius: '0.25rem',
    color: '#F87171',
    fontSize: '0.75rem',
    textAlign: 'center',
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
    cursor: 'pointer',
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
    cursor: 'pointer',
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
    cursor: 'pointer',
  },
  confirmText: {
    color: 'white',
    marginBottom: '1rem',
    fontSize: '1rem',
  },
  confirmDetails: {
    background: '#111827',
    padding: '1rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
  },
  confirmDetailItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    borderBottom: '1px solid #374151',
  },
  confirmWarning: {
    color: '#F87171',
    fontSize: '0.875rem',
    textAlign: 'center',
    marginTop: '1rem',
  },
  loading: {
    textAlign: 'center',
    padding: '2rem',
    color: '#9CA3AF',
  },
  error: {
    textAlign: 'center',
    padding: '2rem',
    color: '#F87171',
    marginBottom: '1rem',
  },
  loadingPayees: {
    padding: '0.75rem',
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: '0.875rem',
  },
  // Loan payment specific styles
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
  loanPaymentBadgeSmall: {
    fontSize: '0.6rem',
    color: '#F59E0B',
    marginTop: '0.25rem',
    display: 'inline-block',
    background: 'rgba(245, 158, 11, 0.1)',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
  },
  interestBadgeSmall: {
    fontSize: '0.6rem',
    color: '#F59E0B',
    marginTop: '0.25rem',
    display: 'inline-block',
    background: 'rgba(245, 158, 11, 0.1)',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
  },
  principalBadgeSmall: {
    fontSize: '0.6rem',
    color: '#10B981',
    marginTop: '0.25rem',
    display: 'inline-block',
    background: 'rgba(16, 185, 129, 0.1)',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
  },
  paymentBadgeSmall: {
    fontSize: '0.6rem',
    color: '#0047AB',
    marginTop: '0.25rem',
    display: 'inline-block',
    background: 'rgba(59, 130, 246, 0.1)',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
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
  interestRateSmall: {
    fontSize: '0.55rem',
    color: '#9CA3AF',
    marginTop: '0.125rem',
    textAlign: 'right',
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

export default AccountDetailView;