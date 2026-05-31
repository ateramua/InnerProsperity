// src/views/LoanManager.jsx
import React, { useState, useEffect } from 'react';
import EditAccountModal from './EditAccountModal';
import PlaidLinkedBadge from '../components/PlaidLinkedBadge';
import PlaidManageConnectionLink from '../components/PlaidManageConnectionLink';
import ConnectBankCTA from '../components/ConnectBankCTA';
import {
  confirmNoDuplicateAccount,
  maskFromAccountNumber,
} from '../utils/plaidDuplicateCheck';
import {
  getLoanAccountDeleteConfirmMessage,
  permanentlyDeleteLoanAccountViaApi,
  formatLoanDeleteError,
} from '../utils/loanAccountUtils.jsx';
import { normalizeAccountId } from '../utils/cashAccountUtils.jsx';
import TransactionImportModal from '../components/TransactionImportModal';

function LoanManager({
  onNavigate,
  loans = [],
  onMakePayment,
  onEditLoan,
  onAddLoan,
  onViewDetails,
  onOpenStrategist,
  onDeleteLoan,
}) {
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [filter, setFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [deletingLoanId, setDeletingLoanId] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importAccountId, setImportAccountId] = useState(null);
  
  // ===================== LOAN PAYMENT MODAL STATE =====================
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentLoan, setSelectedPaymentLoan] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMemo, setPaymentMemo] = useState('');
  const [paymentBreakdown, setPaymentBreakdown] = useState(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [availableCashAccounts, setAvailableCashAccounts] = useState([]);
  const [selectedSourceAccountId, setSelectedSourceAccountId] = useState('');
  
  // ===================== LOAN PAIRING STATE =====================
  const [availableCategories, setAvailableCategories] = useState([]);
  const [categoryGroups, setCategoryGroups] = useState([]);
  const [pairingOption, setPairingOption] = useState('skip');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  // Form state for new loan
  const [newLoanData, setNewLoanData] = useState({
    name: '',
    type: 'loan',
    loan_type: 'personal',
    institution: '',
    account_number: '',
    account_holder_name: '',
    balance: 0,
    original_balance: null,
    interest_rate: null,
    monthly_payment: null,
    term_months: null,
    due_date: '',
    notes: ''
  });

  // Load categories for pairing
  const loadCategoriesForPairing = async () => {
    setIsLoadingCategories(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const userId = userResult.data.id;
        
        const groupsResult = await window.electronAPI.getCategoryGroups(userId);
        if (groupsResult?.success) {
          setCategoryGroups(groupsResult.data || []);
        }
        
        const categoriesResult = await window.electronAPI.getCategories(userId);
        if (categoriesResult?.success) {
          const availableCats = (categoriesResult.data || []).filter(cat => 
            !cat.archived && !cat.is_loan_payment_category
          );
          setAvailableCategories(availableCats);
        }
      }
    } catch (error) {
      console.error('Error loading categories for pairing:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  };
  
  // Load cash accounts (checking/savings) for payment source
  const loadCashAccounts = async () => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const userId = userResult.data.id;
        const accountsResult = await window.electronAPI.getAccountsSummary(userId);
        if (accountsResult?.success) {
          const cashAccounts = accountsResult.data.filter(acc => 
            acc.type === 'checking' || acc.type === 'savings'
          );
          setAvailableCashAccounts(cashAccounts);
          if (cashAccounts.length > 0 && !selectedSourceAccountId) {
            setSelectedSourceAccountId(cashAccounts[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Error loading cash accounts:', error);
    }
  };

  // Calculate payment breakdown (YNAB-style: interest first, then principal)
  const calculatePaymentBreakdown = (loan, amount) => {
    if (!loan || !amount || amount <= 0) return null;
    
    const balance = Math.abs(loan.balance || 0);
    const apr = loan.interest_rate || loan.apr || 0;
    const monthlyRate = apr / 100 / 12;
    const monthlyInterest = balance * monthlyRate;
    
    let interestPortion = Math.min(monthlyInterest, amount);
    let principalPortion = amount - interestPortion;
    
    if (principalPortion > balance) {
      principalPortion = balance;
      interestPortion = amount - principalPortion;
    }
    
    const newBalance = balance - principalPortion;
    
    return {
      paymentAmount: amount,
      interestPortion: Math.max(0, interestPortion),
      principalPortion: Math.max(0, principalPortion),
      oldBalance: balance,
      newBalance: Math.max(0, newBalance),
      interestRate: apr,
      monthlyRate: monthlyRate * 100,
      monthlyInterest
    };
  };
  
  // Handle payment amount change - recalculate breakdown
  const handlePaymentAmountChange = (e) => {
    const amount = parseFloat(e.target.value) || 0;
    setPaymentAmount(e.target.value);
    if (selectedPaymentLoan && amount > 0) {
      const breakdown = calculatePaymentBreakdown(selectedPaymentLoan, amount);
      setPaymentBreakdown(breakdown);
    } else {
      setPaymentBreakdown(null);
    }
  };
  
  // Open payment modal for a loan
  const handleOpenPaymentModal = (loan) => {
    setSelectedPaymentLoan(loan);
    setPaymentAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMemo('');
    setPaymentBreakdown(null);
    loadCashAccounts();
    setShowPaymentModal(true);
  };
  
  // Submit loan payment
  const handleSubmitPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }
    
    if (!selectedSourceAccountId) {
      alert('Please select a source account');
      return;
    }
    
    setIsSubmittingPayment(true);
    
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('Please log in to make a payment');
        return;
      }
      
      const userId = userResult.data.id;
      const breakdown = calculatePaymentBreakdown(selectedPaymentLoan, amount);
      
      // 1. Create outflow transaction in source account (checking/savings)
      const outflowTransactionData = {
        accountId: selectedSourceAccountId,
        date: paymentDate,
        payee: `Payment/Transfer: ${selectedPaymentLoan.name}`,
        description: `Payment/Transfer: ${selectedPaymentLoan.name}`,
        amount: -amount,
        categoryId: selectedPaymentLoan.paired_category_id || null,
        memo: paymentMemo || `Loan payment to ${selectedPaymentLoan.name}`,
        cleared: 1,
        isLoanPayment: true,
        loanAccountId: selectedPaymentLoan.id,
        paymentBreakdown: breakdown
      };
      
      const outflowResult = await window.electronAPI.addTransaction(outflowTransactionData);
      if (!outflowResult.success) {
        throw new Error(outflowResult.error || 'Failed to create payment transaction');
      }
      
      // 2. Create inflow transaction in loan account (principal reduction)
      const inflowTransactionData = {
        accountId: selectedPaymentLoan.id,
        date: paymentDate,
        payee: `Payment/Transfer: ${availableCashAccounts.find(a => a.id === selectedSourceAccountId)?.name || 'Payment'}`,
        description: `Payment/Transfer: ${availableCashAccounts.find(a => a.id === selectedSourceAccountId)?.name || 'Payment'}`,
        amount: breakdown.principalPortion,
        categoryId: null,
        memo: paymentMemo || `Payment from ${availableCashAccounts.find(a => a.id === selectedSourceAccountId)?.name}`,
        cleared: 1,
        isLoanPaymentInflow: true,
        sourceAccountId: selectedSourceAccountId,
        isPrincipalPayment: true
      };
      
      const inflowResult = await window.electronAPI.addTransaction(inflowTransactionData);
      if (!inflowResult.success) {
        throw new Error(inflowResult.error || 'Failed to create loan inflow transaction');
      }
      
      // 3. Create interest transaction if applicable
      if (breakdown.interestPortion > 0) {
        const interestTransactionData = {
          accountId: selectedPaymentLoan.id,
          date: paymentDate,
          payee: `Interest Charge - ${selectedPaymentLoan.name}`,
          description: `Interest Charge - ${selectedPaymentLoan.name}`,
          amount: -breakdown.interestPortion,
          categoryId: null,
          memo: `Monthly interest at ${breakdown.interestRate}% APR`,
          cleared: 1,
          isInterestCharge: true,
          interestRate: breakdown.interestRate,
          interestAmount: breakdown.interestPortion
        };
        
        await window.electronAPI.addTransaction(interestTransactionData);
      }
      
      // 4. Update source account balance
      const sourceAccount = availableCashAccounts.find(a => a.id === selectedSourceAccountId);
      if (sourceAccount) {
        const newSourceBalance = (sourceAccount.balance || 0) - amount;
        await window.electronAPI.updateAccount(selectedSourceAccountId, userId, { balance: newSourceBalance });
      }
      
      // 5. Update loan account balance
      const newLoanBalance = (selectedPaymentLoan.balance || 0) + breakdown.principalPortion;
      await window.electronAPI.updateAccount(selectedPaymentLoan.id, userId, { balance: newLoanBalance });
      
      // 6. Refresh the page
      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
      
      // 7. Show success message
      alert(`✅ Payment of $${amount.toFixed(2)} recorded to ${selectedPaymentLoan.name}!\n\n` +
        `• Interest: $${breakdown.interestPortion.toFixed(2)}\n` +
        `• Principal: $${breakdown.principalPortion.toFixed(2)}\n` +
        `• New Balance: $${breakdown.newBalance.toFixed(2)}`);
      
      setShowPaymentModal(false);
      setSelectedPaymentLoan(null);
      setPaymentAmount('');
      setPaymentBreakdown(null);
      
    } catch (error) {
      console.error('Error making loan payment:', error);
      alert('Error making payment: ' + error.message);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Load categories when modal opens
  useEffect(() => {
    if (showAddModal) {
      loadCategoriesForPairing();
      setPairingOption('skip');
      setSelectedCategoryId('');
      setNewCategoryName('');
      setSelectedGroupId('');
    }
  }, [showAddModal]);

  const getFilteredLoans = () => {
    if (filter === 'all') return loans;
    return loans.filter(loan => loan.type?.toLowerCase().includes(filter) ||
      loan.loan_type?.toLowerCase().includes(filter));
  };

  const calculateLoanStats = (loan) => {
    const originalBalance = loan.original_balance || Math.abs(loan.balance);
    const progress = ((originalBalance - Math.abs(loan.balance)) / originalBalance) * 100;
    const monthlyPayment = loan.payment_amount || loan.monthly_payment || loan.monthlyPayment;
    const remainingMonths = loan.remainingPayments ||
      Math.ceil(Math.abs(loan.balance) / (monthlyPayment || 1));
    const totalInterest = (monthlyPayment * remainingMonths) - Math.abs(loan.balance);
    return {
      progress: Math.max(0, Math.min(100, progress)),
      remainingMonths,
      totalInterest,
      payoffDate: new Date(Date.now() + remainingMonths * 30 * 24 * 60 * 60 * 1000)
    };
  };

  const createPairedCategory = async (userId, loanName) => {
    try {
      const groupsResult = await window.electronAPI.getCategoryGroups(userId);
      let loanPaymentGroup = null;
      
      if (groupsResult?.success) {
        loanPaymentGroup = groupsResult.data.find(g => 
          g.name === 'Loan Payments' || g.name.toLowerCase() === 'loan payments'
        );
      }
      
      if (!loanPaymentGroup) {
        const createGroupResult = await window.electronAPI.createCategoryGroup(
          userId,
          'Loan Payments',
          (groupsResult?.data?.length || 0)
        );
        if (createGroupResult?.success) {
          loanPaymentGroup = createGroupResult.data;
        }
      }
      
      if (!loanPaymentGroup) {
        console.error('Could not create Loan Payments group');
        return null;
      }
      
      const categoryData = {
        name: loanName,
        assigned: 0,
        group_id: loanPaymentGroup.id,
        user_id: userId,
        target_amount: 0,
        target_type: 'monthly_debt_payment',
        target_date: null,
        priority: 2,
        archived: 0,
        is_loan_payment_category: 1
      };
      
      const result = await window.electronAPI.createCategory(categoryData);
      if (result?.success) {
        console.log(`✅ Created loan payment category "${loanName}" in Loan Payments group`);
        return result.data;
      }
      return null;
    } catch (error) {
      console.error('Error creating paired category:', error);
      return null;
    }
  };

  const handleCreateLoan = async () => {
    try {
      if (!newLoanData.name.trim()) {
        alert('Please enter a loan name');
        return;
      }

      if (!newLoanData.balance || newLoanData.balance <= 0) {
        alert('Please enter a valid loan balance');
        return;
      }

      const mask = maskFromAccountNumber(newLoanData.account_number);
      const proceed = await confirmNoDuplicateAccount({
        type: 'loan',
        mask,
        name: newLoanData.name,
        institution: newLoanData.institution,
      });
      if (!proceed) return;

      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in to create a loan');
        return;
      }

      const userId = userResult.data.id;
      
      let pairedCategoryId = null;
      
      if (pairingOption === 'existing' && selectedCategoryId) {
        pairedCategoryId = selectedCategoryId;
        await window.electronAPI.updateCategory(selectedCategoryId, {
          is_loan_payment_category: 1,
          target_type: 'monthly_debt_payment'
        });
        alert(`✅ Loan will be paired with existing category.`);
      } else if (pairingOption === 'new' && newCategoryName.trim()) {
        let targetGroupId = selectedGroupId;
        
        if (!targetGroupId) {
          const groupsResult = await window.electronAPI.getCategoryGroups(userId);
          let loanPaymentGroup = groupsResult?.data?.find(g => 
            g.name === 'Loan Payments' || g.name.toLowerCase() === 'loan payments'
          );
          
          if (!loanPaymentGroup) {
            const createGroupResult = await window.electronAPI.createCategoryGroup(
              userId,
              'Loan Payments',
              (groupsResult?.data?.length || 0)
            );
            if (createGroupResult?.success) {
              loanPaymentGroup = createGroupResult.data;
            }
          }
          targetGroupId = loanPaymentGroup?.id;
        }
        
        if (targetGroupId) {
          const categoryData = {
            name: newCategoryName.trim(),
            assigned: 0,
            group_id: targetGroupId,
            user_id: userId,
            target_amount: 0,
            target_type: 'monthly_debt_payment',
            target_date: null,
            priority: 2,
            archived: 0,
            is_loan_payment_category: 1
          };
          
          const categoryResult = await window.electronAPI.createCategory(categoryData);
          if (categoryResult?.success) {
            pairedCategoryId = categoryResult.data.id;
            alert(`✅ New category "${newCategoryName}" created and paired with this loan.`);
          }
        }
      }

      const loanData = {
        name: newLoanData.name.trim(),
        type: 'loan',
        loan_type: newLoanData.loan_type,
        account_type_category: 'loan',
        balance: -Math.abs(parseFloat(newLoanData.balance)),
        original_balance: newLoanData.original_balance ? parseFloat(newLoanData.original_balance) : null,
        interest_rate: newLoanData.interest_rate ? parseFloat(newLoanData.interest_rate) : null,
        payment_amount: newLoanData.monthly_payment ? parseFloat(newLoanData.monthly_payment) : null,
        term_months: newLoanData.term_months ? parseInt(newLoanData.term_months) : null,
        due_date: newLoanData.due_date || null,
        institution: newLoanData.institution.trim() || null,
        account_number: newLoanData.account_number.trim() || null,
        account_holder_name: newLoanData.account_holder_name.trim() || null,
        notes: newLoanData.notes.trim() || null,
        user_id: userId,
        currency: 'USD',
        paired_category_id: pairedCategoryId,
        forceCreate: true,
      };

      console.log('📝 Creating loan with data:', loanData);

      const result = await window.electronAPI.createAccount(loanData);

      if (result.success) {
        console.log('✅ Loan created successfully:', result.data);
        setShowAddModal(false);

        setNewLoanData({
          name: '',
          type: 'loan',
          loan_type: 'personal',
          institution: '',
          account_number: '',
          account_holder_name: '',
          balance: 0,
          original_balance: null,
          interest_rate: null,
          monthly_payment: null,
          term_months: null,
          due_date: '',
          notes: ''
        });

        setPairingOption('skip');
        setSelectedCategoryId('');
        setNewCategoryName('');
        setSelectedGroupId('');

        if (onAddLoan) {
          await onAddLoan(result.data);
        }

        window.dispatchEvent(new Event('accounts-changed'));
        window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
        
        const pairingMessage = pairedCategoryId 
          ? `\n\n📋 A payment category has been paired with this loan. You can now set a Monthly Debt Payment target in your budget.`
          : `\n\nℹ️ You can pair a category with this loan later by editing the loan account.`;
        
        alert(`✅ Loan created successfully!${pairingMessage}`);
      } else {
        console.error('❌ Failed to create loan:', result.error);
        alert(`Failed to create loan: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Error creating loan:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const handleEditClick = (loan) => {
    console.log('✏️ Opening EditAccountModal for loan:', loan);

    const loanWithAllFields = {
      id: loan.id,
      name: loan.name || '',
      type: 'loan',
      balance: loan.balance || 0,
      interest_rate: loan.interest_rate || loan.interestRate || null,
      due_date: loan.due_date || null,
      institution: loan.institution || loan.lender || '',
      account_number: loan.account_number || '',
      account_holder_name: loan.account_holder_name || '',
      notes: loan.notes || '',
      original_balance: loan.original_balance || null,
      term_months: loan.term_months || null,
      monthly_payment: loan.payment_amount || loan.monthly_payment || loan.monthlyPayment || null,
      loan_type: loan.loan_type || loan.type || 'personal',
      paired_category_id: loan.paired_category_id || null
    };

    setEditingLoan(loanWithAllFields);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (accountId, updatedData) => {
    console.log('📥 Saving loan edit from EditAccountModal:', accountId, updatedData);

    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return;
      }

      const userId = userResult.data.id;
      
      const updatePayload = {
        name: updatedData.name,
        type: 'loan',
        account_type_category: 'loan',
        institution: updatedData.institution || null,
        account_number: updatedData.account_number || null,
        account_holder_name: updatedData.account_holder_name || null,
        notes: updatedData.notes || null,
        balance: -Math.abs(parseFloat(updatedData.balance) || 0),
        interest_rate: updatedData.interest_rate ? parseFloat(updatedData.interest_rate) : null,
        due_date: updatedData.due_date || null,
        original_balance: updatedData.original_balance ? parseFloat(updatedData.original_balance) : null,
        term_months: updatedData.term_months ? parseInt(updatedData.term_months) : null,
        payment_amount: updatedData.monthly_payment ? parseFloat(updatedData.monthly_payment) : null,
        loan_type: updatedData.loan_type || 'personal',
        paired_category_id: updatedData.paired_category_id || null
      };

      console.log('📝 Updating loan with payload:', updatePayload);

      const result = await window.electronAPI.updateAccount(accountId, userId, updatePayload);

      if (result && result.success) {
        console.log('✅ Loan updated successfully');
        setShowEditModal(false);
        setEditingLoan(null);
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
        alert('✅ Loan updated successfully!');
      } else {
        const errorMsg = result?.error || 'Unknown error occurred';
        console.error('❌ Failed to update loan:', errorMsg);
        alert(`Failed to update loan: ${errorMsg}`);
      }
    } catch (error) {
      console.error('❌ Error updating loan:', error);
      alert(`Error updating loan: ${error.message}`);
    }
  };

  const handleDeleteLoanAccount = async (loanId) => {
    const normalizedId = normalizeAccountId(loanId);
    const loan = loans.find((l) => normalizeAccountId(l.id) === normalizedId);
    if (!loan) {
      alert('Loan not found');
      return;
    }
    if (deletingLoanId) return;
    if (!window.confirm(getLoanAccountDeleteConfirmMessage(loan))) {
      return;
    }

    setDeletingLoanId(normalizedId);
    try {
      const result = await permanentlyDeleteLoanAccountViaApi(loan);

      if (result?.success) {
        if (selectedLoan === normalizedId || normalizeAccountId(selectedLoan) === normalizedId) {
          setSelectedLoan(null);
        }
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
      } else {
        alert('Failed to delete loan: ' + formatLoanDeleteError(result));
      }
    } catch (error) {
      console.error('Error deleting loan:', error);
      alert('Error: ' + error.message);
    } finally {
      setDeletingLoanId(null);
    }
  };

  const filteredLoans = getFilteredLoans();
  const totalBalance = loans.reduce((sum, l) => sum + Math.abs(l.balance || 0), 0);
  const totalMonthlyPayment = loans.reduce((sum, l) => sum + (l.payment_amount || l.monthly_payment || l.monthlyPayment || 0), 0);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>🏦 Loan Manager</h2>
          <p style={styles.subtitle}>Track and manage all your loans</p>
        </div>
        <div style={styles.headerActions}>
          <button onClick={onOpenStrategist} style={styles.strategistButton}>
            🎯 Open Loan Strategist
          </button>
          <button onClick={() => setShowAddModal(true)} style={styles.addButton}>
            ➕ Add Loan
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💰</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Total Loan Balance</div>
            <div style={styles.summaryValue}>${totalBalance.toFixed(2)}</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📊</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Monthly Payments</div>
            <div style={styles.summaryValue}>${totalMonthlyPayment.toFixed(2)}</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📈</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Average Interest</div>
            <div style={styles.summaryValue}>
              {(loans.reduce((sum, l) => sum + (l.interest_rate || l.interestRate || 0), 0) / (loans.length || 1)).toFixed(1)}%
            </div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>⏱️</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Total Loans</div>
            <div style={styles.summaryValue}>{loans.length}</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={styles.filterTabs}>
        <button
          onClick={() => setFilter('all')}
          style={{ ...styles.filterTab, ...(filter === 'all' ? styles.activeFilter : {}) }}
        >
          All Loans ({loans.length})
        </button>
        <button
          onClick={() => setFilter('auto')}
          style={{ ...styles.filterTab, ...(filter === 'auto' ? styles.activeFilter : {}) }}
        >
          Auto ({loans.filter(l => (l.type?.toLowerCase().includes('auto') || l.loan_type === 'auto')).length})
        </button>
        <button
          onClick={() => setFilter('student')}
          style={{ ...styles.filterTab, ...(filter === 'student' ? styles.activeFilter : {}) }}
        >
          Student ({loans.filter(l => (l.type?.toLowerCase().includes('student') || l.loan_type === 'student')).length})
        </button>
        <button
          onClick={() => setFilter('personal')}
          style={{ ...styles.filterTab, ...(filter === 'personal' ? styles.activeFilter : {}) }}
        >
          Personal ({loans.filter(l => (l.type?.toLowerCase().includes('personal') || l.loan_type === 'personal')).length})
        </button>
      </div>

      {/* Loans Grid */}
      {filteredLoans.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>🏦</div>
          <h3 style={styles.emptyTitle}>No loans found</h3>
          <p style={styles.emptyText}>
            {filter === 'all'
              ? (<ConnectBankCTA label="loans" onNavigate={onNavigate} />)
              : 'No loans match the selected filter'}
          </p>
          {filter === 'all' && (
            <button onClick={() => setShowAddModal(true)} style={styles.emptyAddButton}>
              ➕ Add Your First Loan
            </button>
          )}
        </div>
      ) : (
        <div style={styles.loansGrid}>
          {filteredLoans.map(loan => {
            const stats = calculateLoanStats(loan);
            const isSelected = selectedLoan === loan.id;
            const hasPairedCategory = !!loan.paired_category_id;

            return (
              <div
                key={loan.id}
                style={{
                  ...styles.loanCard,
                  ...(isSelected ? styles.selectedLoan : {}),
                  borderLeft: hasPairedCategory ? '4px solid #10B981' : '4px solid #F59E0B'
                }}
                onClick={() => setSelectedLoan(isSelected ? null : loan.id)}
              >
                {hasPairedCategory && (
                  <div style={styles.pairedBadge}>
                    🔗 Paired with category
                  </div>
                )}
                
                <div style={styles.loanHeader}>
                  <div>
                    <h3 style={styles.loanName}>
                      {loan.name}
                      <PlaidLinkedBadge account={loan} />
                      <PlaidManageConnectionLink account={loan} onNavigate={onNavigate} />
                    </h3>
                    <div style={styles.loanLender}>{loan.lender || loan.institution || 'Lender'}</div>
                  </div>
                  <div style={styles.loanRate}>{loan.interest_rate || loan.interestRate || 0}%</div>
                </div>

                <div style={styles.balanceSection}>
                  <div style={styles.balanceLabel}>Current Balance</div>
                  <div style={styles.balanceAmount}>
                    ${Math.abs(loan.balance).toFixed(2)}
                  </div>
                </div>

                <div style={styles.progressSection}>
                  <div style={styles.progressLabel}>
                    <span>Progress: {stats.progress.toFixed(1)}%</span>
                    <span>{stats.remainingMonths} months left</span>
                  </div>
                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${stats.progress}%` }} />
                  </div>
                </div>

                <div style={styles.loanDetails}>
                  <div style={styles.detailItem}>
                    <span>Monthly Payment</span>
                    <strong>${(loan.payment_amount || loan.monthly_payment || loan.monthlyPayment || 0).toFixed(2)}</strong>
                  </div>
                  <div style={styles.detailItem}>
                    <span>Term</span>
                    <strong>{loan.term_months || loan.term || 'N/A'} months</strong>
                  </div>
                  <div style={styles.detailItem}>
                    <span>Payoff Date</span>
                    <strong>{stats.payoffDate.toLocaleDateString()}</strong>
                  </div>
                </div>

                {(loan.account_number || loan.account_holder_name) && (
                  <div style={styles.additionalDetails}>
                    {loan.account_number && (
                      <div style={styles.detailBadge}>
                        Acct: ••••{loan.account_number.slice(-4)}
                      </div>
                    )}
                    {loan.account_holder_name && (
                      <div style={styles.detailBadge}>
                        Holder: {loan.account_holder_name}
                      </div>
                    )}
                  </div>
                )}

                {hasPairedCategory && (
                  <div style={styles.pairedInfo}>
                    <span style={styles.pairedInfoIcon}>📋</span>
                    <span style={styles.pairedInfoText}>
                      Paired with budget category. Set a Monthly Debt Payment target in your budget.
                    </span>
                  </div>
                )}

                <div style={styles.loanActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPaymentModal(loan);
                    }}
                    style={styles.paymentButton}
                  >
                    💰 Make Payment
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditClick(loan);
                    }}
                    style={styles.editButton}
                    title="Edit Loan"
                  >
                    ✏️ Edit
                  </button>
                </div>

                <div style={styles.loanManagementActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setImportAccountId(loan.id);
                      setShowImportModal(true);
                    }}
                    style={styles.transactionsButton}
                    title="Import transactions from CSV"
                  >
                    Import CSV
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetails && onViewDetails(loan.id);
                    }}
                    style={styles.transactionsButton}
                    title="View account transactions"
                  >
                    Transactions
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteLoanAccount(loan.id);
                    }}
                    style={{
                      ...styles.deleteButtonInline,
                      opacity: deletingLoanId === normalizeAccountId(loan.id) ? 0.6 : 1,
                    }}
                    disabled={deletingLoanId === normalizeAccountId(loan.id)}
                    title="Permanently delete this loan"
                  >
                    {deletingLoanId === normalizeAccountId(loan.id)
                      ? 'Deleting…'
                      : 'Delete Loan'}
                  </button>
                </div>
                
                {isSelected && (
                  <div style={styles.expandedDetails}>
                    <h4 style={styles.expandedTitle}>Amortization Preview</h4>
                    <div style={styles.amortizationGrid}>
                      <div style={styles.amortizationItem}>
                        <span>Principal</span>
                        <strong>${Math.abs(loan.balance).toFixed(2)}</strong>
                      </div>
                      <div style={styles.amortizationItem}>
                        <span>Total Interest</span>
                        <strong>${stats.totalInterest.toFixed(2)}</strong>
                      </div>
                      <div style={styles.amortizationItem}>
                        <span>Total Cost</span>
                        <strong>${(Math.abs(loan.balance) + stats.totalInterest).toFixed(2)}</strong>
                      </div>
                    </div>
                    
                    {hasPairedCategory && (
                      <div style={styles.pairedTip}>
                        💡 Tip: Go to your budget, find the paired category, and set a Monthly Debt Payment target to track your payoff progress.
                      </div>
                    )}
                    
                    <button
                      onClick={() => onOpenStrategist && onOpenStrategist()}
                      style={styles.strategistLink}
                    >
                      View in Loan Strategist →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Loan Modal */}
      {showAddModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>Add New Loan</h2>

            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Basic Information</h3>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Loan Name <span style={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  value={newLoanData.name}
                  onChange={(e) => setNewLoanData({ ...newLoanData, name: e.target.value })}
                  style={styles.input}
                  placeholder="e.g., Auto Loan, Student Loan, Mortgage"
                  autoFocus
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Loan Type</label>
                <select
                  value={newLoanData.loan_type}
                  onChange={(e) => setNewLoanData({ ...newLoanData, loan_type: e.target.value })}
                  style={styles.select}
                >
                  <option value="personal">Personal Loan</option>
                  <option value="auto">Auto Loan</option>
                  <option value="student">Student Loan</option>
                  <option value="mortgage">Mortgage</option>
                  <option value="business">Business Loan</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Lender / Institution</label>
                <input
                  type="text"
                  value={newLoanData.institution}
                  onChange={(e) => setNewLoanData({ ...newLoanData, institution: e.target.value })}
                  style={styles.input}
                  placeholder="e.g., Wells Fargo, Sallie Mae, Chase"
                />
              </div>

              {/* FIXED: Current Balance input - supports cents properly */}
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Current Balance <span style={styles.required}>*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newLoanData.balance === 0 ? '' : newLoanData.balance}
                  onChange={(e) => {
                    const value = e.target.value === '' ? 0 : parseFloat(e.target.value);
                    setNewLoanData({ ...newLoanData, balance: isNaN(value) ? 0 : value });
                  }}
                  style={styles.input}
                  placeholder="0.00"
                />
                <small style={styles.hint}>Current amount owed (use decimal for cents, e.g., 1500.50)</small>
              </div>
            </div>

            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Loan Details</h3>

              {/* FIXED: Original Loan Amount input - supports cents properly */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Original Loan Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={newLoanData.original_balance === null || newLoanData.original_balance === 0 ? '' : newLoanData.original_balance}
                  onChange={(e) => {
                    const value = e.target.value === '' ? null : parseFloat(e.target.value);
                    setNewLoanData({ ...newLoanData, original_balance: isNaN(value) ? null : value });
                  }}
                  style={styles.input}
                  placeholder="Original loan amount"
                />
              </div>

              {/* FIXED: Interest Rate input - allows decimals */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Interest Rate (APR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newLoanData.interest_rate === null || newLoanData.interest_rate === 0 ? '' : newLoanData.interest_rate}
                  onChange={(e) => {
                    const value = e.target.value === '' ? null : parseFloat(e.target.value);
                    setNewLoanData({ ...newLoanData, interest_rate: isNaN(value) ? null : value });
                  }}
                  style={styles.input}
                  placeholder="e.g., 5.99"
                />
                <small style={styles.hint}>Annual Percentage Rate</small>
              </div>

              {/* FIXED: Monthly Payment input - supports cents properly */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Monthly Payment</label>
                <input
                  type="number"
                  step="0.01"
                  value={newLoanData.monthly_payment === null || newLoanData.monthly_payment === 0 ? '' : newLoanData.monthly_payment}
                  onChange={(e) => {
                    const value = e.target.value === '' ? null : parseFloat(e.target.value);
                    setNewLoanData({ ...newLoanData, monthly_payment: isNaN(value) ? null : value });
                  }}
                  style={styles.input}
                  placeholder="Monthly payment amount"
                />
              </div>

              {/* FIXED: Loan Term input - integers only */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Loan Term (months)</label>
                <input
                  type="number"
                  step="1"
                  value={newLoanData.term_months === null || newLoanData.term_months === 0 ? '' : newLoanData.term_months}
                  onChange={(e) => {
                    const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                    setNewLoanData({ ...newLoanData, term_months: isNaN(value) ? null : value });
                  }}
                  style={styles.input}
                  placeholder="e.g., 60 for 5 years"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Due Date</label>
                <input
                  type="date"
                  value={newLoanData.due_date}
                  onChange={(e) => setNewLoanData({ ...newLoanData, due_date: e.target.value })}
                  style={styles.input}
                />
                <small style={styles.hint}>Monthly payment due date</small>
              </div>
            </div>

            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Account Details</h3>

              <div style={styles.formGroup}>
                <label style={styles.label}>Account Number</label>
                <input
                  type="text"
                  value={newLoanData.account_number}
                  onChange={(e) => setNewLoanData({ ...newLoanData, account_number: e.target.value })}
                  style={styles.input}
                  placeholder="Enter full account number (up to 16 digits)"
                  maxLength="16"
                />
                <small style={styles.hint}>For reference only. Only last 4 digits will be visible after saving.</small>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Account Holder Name</label>
                <input
                  type="text"
                  value={newLoanData.account_holder_name}
                  onChange={(e) => setNewLoanData({ ...newLoanData, account_holder_name: e.target.value })}
                  style={styles.input}
                  placeholder="Name on the loan account"
                />
              </div>
            </div>

            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>🔗 Pair with Budget Category (Optional)</h3>
              <p style={styles.pairingDescription}>
                Pairing a category with this loan allows you to track payments in your budget,
                see payoff progress, and use the Monthly Debt Payment target.
              </p>
              
              <div style={styles.radioGroup}>
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="pairingOption"
                    value="skip"
                    checked={pairingOption === 'skip'}
                    onChange={() => setPairingOption('skip')}
                    style={styles.radioInput}
                  />
                  <span>Skip pairing (I'll manage payments manually)</span>
                </label>
                
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="pairingOption"
                    value="existing"
                    checked={pairingOption === 'existing'}
                    onChange={() => setPairingOption('existing')}
                    style={styles.radioInput}
                  />
                  <span>Pair with an existing category</span>
                </label>
                
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="pairingOption"
                    value="new"
                    checked={pairingOption === 'new'}
                    onChange={() => setPairingOption('new')}
                    style={styles.radioInput}
                  />
                  <span>Create a new category for this loan</span>
                </label>
              </div>
              
              {pairingOption === 'existing' && (
                <div style={styles.pairingSection}>
                  <label style={styles.label}>Select Category</label>
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    style={styles.select}
                    disabled={isLoadingCategories}
                  >
                    <option value="">-- Select a category --</option>
                    {availableCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} {cat.group_name ? `(${cat.group_name})` : ''}
                      </option>
                    ))}
                  </select>
                  {availableCategories.length === 0 && !isLoadingCategories && (
                    <small style={styles.hintWarning}>
                      No available categories found. You may need to create a new category.
                    </small>
                  )}
                </div>
              )}
              
              {pairingOption === 'new' && (
                <div style={styles.pairingSection}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>New Category Name</label>
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      style={styles.input}
                      placeholder="e.g., Auto Loan Payment, Student Loan"
                    />
                  </div>
                  
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Category Group (Optional)</label>
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      style={styles.select}
                    >
                      <option value="">-- Auto-create in "Loan Payments" group --</option>
                      {categoryGroups.map(group => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <small style={styles.hint}>
                      If no group is selected, the category will be created in a "Loan Payments" group.
                    </small>
                  </div>
                </div>
              )}
              
              {pairingOption !== 'skip' && (
                <div style={styles.pairingNote}>
                  💡 <strong>What happens when you pair?</strong><br />
                  • A budget category will be linked to this loan<br />
                  • You'll see loan payoff progress in your budget<br />
                  • You can set a Monthly Debt Payment target<br />
                  • The category can only be used for payments to this loan
                </div>
              )}
            </div>

            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Additional Notes</h3>

              <div style={styles.formGroup}>
                <label style={styles.label}>Notes</label>
                <textarea
                  value={newLoanData.notes}
                  onChange={(e) => setNewLoanData({ ...newLoanData, notes: e.target.value })}
                  style={styles.textarea}
                  rows="3"
                  placeholder="Add any additional notes about this loan..."
                />
              </div>
            </div>

            <div style={styles.modalActions}>
              <button onClick={handleCreateLoan} style={styles.saveButton}>
                Create Loan
              </button>
              <button onClick={() => setShowAddModal(false)} style={styles.cancelButton}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedPaymentLoan && (
        <div style={styles.modalOverlay} onClick={() => setShowPaymentModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Make a Payment</h3>
            <p style={{ color: '#9CA3AF', marginBottom: '1rem' }}>
              Make a payment to <strong>{selectedPaymentLoan.name}</strong>
            </p>

            <div style={styles.formGroup}>
              <label style={styles.label}>Source Account</label>
              <select
                value={selectedSourceAccountId}
                onChange={(e) => setSelectedSourceAccountId(e.target.value)}
                style={styles.select}
              >
                <option value="">Select account</option>
                {availableCashAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type}) - Balance: ${Math.abs(acc.balance || 0).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Payment Amount</label>
              <div style={styles.inputWrapper}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={handlePaymentAmountChange}
                  style={styles.modalInput}
                  placeholder="0.00"
                  min="0"
                  autoFocus
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Payment Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Memo (Optional)</label>
              <input
                type="text"
                value={paymentMemo}
                onChange={(e) => setPaymentMemo(e.target.value)}
                style={styles.input}
                placeholder="Additional notes"
              />
            </div>

            {paymentBreakdown && paymentBreakdown.paymentAmount > 0 && (
              <div style={styles.paymentBreakdownModal}>
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
                </div>
              </div>
            )}

            <div style={styles.modalActions}>
              <button onClick={handleSubmitPayment} style={styles.submitButton} disabled={isSubmittingPayment}>
                {isSubmittingPayment ? 'Processing...' : 'Make Payment'}
              </button>
              <button onClick={() => setShowPaymentModal(false)} style={styles.cancelButton}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <TransactionImportModal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportAccountId(null);
        }}
        fixedAccountId={importAccountId}
        accounts={loans}
        title="Import loan account transactions"
        onComplete={() => window.dispatchEvent(new CustomEvent('accounts-updated'))}
      />

      {/* EditAccountModal for editing loans */}
      <EditAccountModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingLoan(null);
        }}
        onSave={handleSaveEdit}
        account={editingLoan}
        onNavigate={onNavigate}
      />
    </div>
  );
}

// Styles
const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1400px',
    margin: '0 auto',
    color: 'white'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    flexWrap: 'wrap',
    gap: '1rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    margin: '0 0 0.25rem 0',
    background: 'linear-gradient(135deg, #10B981, #0047AB)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    margin: 0
  },
  headerActions: {
    display: 'flex',
    gap: '1rem'
  },
  strategistButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  addButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #0047AB, #001a40)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem'
  },
  summaryCard: {
    background: '#0047AB',
    padding: '1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  summaryIcon: {
    fontSize: '2rem'
  },
  summaryContent: {
    flex: 1
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem',
    textTransform: 'uppercase'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold'
  },
  transactionsButton: {
    flex: 1,
    padding: '0.5rem',
    background: 'transparent',
    border: '1px solid #9CA3AF',
    color: '#F3F4F6',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  loanManagementActions: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.5rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #374151'
  },
  deleteButtonInline: {
    flex: 1,
    padding: '0.5rem',
    background: 'transparent',
    border: '1px solid #EF4444',
    color: '#EF4444',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterTabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '2rem',
    background: '#0047AB',
    padding: '0.25rem',
    borderRadius: '0.5rem',
    width: 'fit-content'
  },
  filterTab: {
    padding: '0.5rem 1rem',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem'
  },
  activeFilter: {
    background: '#0047AB',
    color: 'white'
  },
  loansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
    gap: '1.5rem'
  },
  loanCard: {
    background: '#0047AB',
    borderRadius: '1rem',
    padding: '1.5rem',
    border: '1px solid #374151',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    }
  },
  selectedLoan: {
    border: '2px solid #0047AB'
  },
  pairedBadge: {
    position: 'absolute',
    top: '0.75rem',
    right: '0.75rem',
    background: '#10B98120',
    color: '#10B981',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    fontWeight: '500'
  },
  loanHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
    marginRight: '2rem'
  },
  loanName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    margin: '0 0 0.25rem 0',
    color: 'white'
  },
  loanLender: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  loanRate: {
    fontSize: '1.125rem',
    fontWeight: 'bold',
    color: '#F59E0B'
  },
  balanceSection: {
    marginBottom: '1rem'
  },
  balanceLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem'
  },
  balanceAmount: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white'
  },
  progressSection: {
    marginBottom: '1rem'
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem'
  },
  progressBar: {
    height: '0.5rem',
    background: '#374151',
    borderRadius: '0.25rem',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #0047AB, #8B5CF6)'
  },
  loanDetails: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
    marginBottom: '1rem'
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  additionalDetails: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
    flexWrap: 'wrap'
  },
  detailBadge: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    background: '#374151',
    padding: '0.125rem 0.5rem',
    borderRadius: '0.25rem',
    display: 'inline-block'
  },
  pairedInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '1rem',
    padding: '0.5rem',
    background: '#10B98110',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    color: '#10B981'
  },
  pairedInfoIcon: {
    fontSize: '0.8rem'
  },
  pairedInfoText: {
    flex: 1
  },
  loanActions: {
    display: 'flex',
    gap: '0.5rem'
  },
  paymentButton: {
    flex: 1,
    padding: '0.5rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  editButton: {
    flex: 1,
    padding: '0.5rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    cursor: 'pointer'
  },
  expandedDetails: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #374151'
  },
  expandedTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    margin: '0 0 0.75rem 0',
    color: 'white'
  },
  amortizationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
    marginBottom: '1rem'
  },
  amortizationItem: {
    background: '#0047AB',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    textAlign: 'center'
  },
  pairedTip: {
    background: '#1E3A5F',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    color: '#9CA3AF',
    marginBottom: '0.75rem',
    textAlign: 'center'
  },
  strategistLink: {
    width: '100%',
    padding: '0.5rem',
    background: 'none',
    border: '1px solid #8B5CF6',
    color: '#8B5CF6',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.75rem'
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem',
    background: '#0047AB',
    borderRadius: '1rem'
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: '1rem'
  },
  emptyTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '0.5rem'
  },
  emptyText: {
    color: '#9CA3AF',
    marginBottom: '1.5rem'
  },
  emptyAddButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #0047AB, #001a40)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer'
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
    zIndex: 1000
  },
  modalContent: {
    background: '#0047AB',
    padding: '2rem',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '650px',
    maxHeight: '90vh',
    overflowY: 'auto'
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
  required: {
    color: '#EF4444',
    marginLeft: '0.25rem'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#0047AB',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#0047AB',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#0047AB',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  hint: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  hintWarning: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: '#F59E0B'
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1.5rem'
  },
  saveButton: {
    flex: 1,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #0047AB, #001a40)',
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
  },
  submitButton: {
    flex: 1,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  // Payment modal specific styles
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
    background: '#0047AB',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  paymentBreakdownModal: {
    background: '#0047AB',
    padding: '1rem',
    borderRadius: '0.5rem',
    marginTop: '1rem',
    marginBottom: '1rem'
  },
  breakdownTitle: {
    fontSize: '0.75rem',
    fontWeight: 'bold',
    color: '#9CA3AF',
    marginBottom: '0.5rem',
    textTransform: 'uppercase'
  },
  breakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.25rem 0',
    fontSize: '0.875rem',
    borderBottom: '1px solid #374151'
  },
  breakdownNote: {
    fontSize: '0.65rem',
    color: '#6B7280',
    marginTop: '0.5rem',
    textAlign: 'center'
  },
  // Pairing specific styles
  pairingDescription: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '1rem',
    lineHeight: '1.4'
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '1rem'
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#FFFFFF',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  radioInput: {
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  },
  pairingSection: {
    background: '#0047AB',
    padding: '1rem',
    borderRadius: '0.5rem',
    marginTop: '0.5rem'
  },
  pairingNote: {
    background: '#1E3A5F',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    fontSize: '0.7rem',
    color: '#9CA3AF',
    marginTop: '0.75rem',
    lineHeight: '1.4'
  }
};

export default LoanManager;