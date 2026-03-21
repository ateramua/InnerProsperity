import React, { useState, useEffect } from 'react';
import CashAccountsView from './CashAccountsView';
import AllAccountsView from './AllAccountsView';
import PropertyMapView from './PropertyMapView';
import ReflectsView from './ReflectsView';
import CashView from './CashView';
import CreditCardsView from './CreditCardsView';
import LoansView from './LoansView';
import AccountDetailView from './AccountDetailView';
import MoneyMapView from './MoneyMapView';
import ProsperityOptimizerView from './ProsperityOptimizerView';
import CashFlowView from './CashFlowView';
import CashFlowForecast from './CashFlowForecast';
import StrategicInvestmentPortfolio from './StrategicInvestmentPortfolio';
import CreditCardManager from './CreditCardManager';
import CreditCardPlanner from './CreditCardPlanner';
import AddCreditCardForm from './AddCreditCardForm';
import LoanManager from './LoanManager';
import LoanStrategist from './LoanStrategist';
import AddLoanForm from './AddLoanForm';
import ForecastPage from '../pages/forecast';
import AccountModal from './AccountModal';
import LinkedBanksView from './LinkedBanksView';

const ViewContainer = ({ currentView, accounts, budgetData, transactions, onNavigate }) => {
  console.log('🔍 ViewContainer received currentView:', currentView);
  console.log('🔍 Available views: "accounts", "allAccounts", "creditCards", etc.');
  console.log('🔍 accounts length:', accounts?.length);

  // Modal state
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [editingAccount, setEditingAccount] = useState(null);
  const [modalDefaultType, setModalDefaultType] = useState('checking');

  // Credit cards state
  const [creditCards, setCreditCards] = useState([]);
  const [isLoadingCards, setIsLoadingCards] = useState(false);

  // Loans state
  const [loans, setLoans] = useState([]);
  const [isLoadingLoans, setIsLoadingLoans] = useState(false);

  // Load credit cards
  const loadCreditCards = async () => {
    console.log('🔍 Loading credit cards from database...');
    setIsLoadingCards(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        setCreditCards([]);
        return;
      }

      const userId = userResult.data.id;
      const accountsResult = await window.electronAPI.getAccountsSummary(userId);

      if (accountsResult?.success) {
        const allAccounts = accountsResult.data || [];
        const creditCardsOnly = allAccounts.filter(acc => acc.type === 'credit');
        console.log(`💰 Found ${creditCardsOnly.length} credit cards`);
        setCreditCards(creditCardsOnly);
      } else {
        setCreditCards([]);
      }
    } catch (error) {
      console.error('Error loading credit cards:', error);
      setCreditCards([]);
    } finally {
      setIsLoadingCards(false);
    }
  };

  // Load loans
  const loadLoans = async () => {
    console.log('📥 loadLoans started');
    if (typeof setIsLoadingLoans !== 'function') {
      console.error('❌ setIsLoadingLoans is not a function – cannot proceed');
      return;
    }
    setIsLoadingLoans(true);
    try {
      if (!window.electronAPI?.getCurrentUser) {
        throw new Error('electronAPI.getCurrentUser is not available');
      }
      if (!window.electronAPI?.getAccountsSummary) {
        throw new Error('electronAPI.getAccountsSummary is not available');
      }

      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data?.id) {
        console.log('❌ No user logged in or invalid user data');
        if (typeof setLoans === 'function') setLoans([]);
        return;
      }

      const userId = userResult.data.id;
      const accountsResult = await window.electronAPI.getAccountsSummary(userId);

      let loanAccounts = [];
      if (accountsResult?.success && Array.isArray(accountsResult.data)) {
        loanAccounts = accountsResult.data.filter(acc => acc && acc.type === 'loan');
        console.log(`💰 Found ${loanAccounts.length} loans`);
      } else {
        console.error('❌ Failed to load accounts or invalid response:', accountsResult?.error);
        if (Array.isArray(accountsResult?.data)) {
          loanAccounts = accountsResult.data.filter(acc => acc && acc.type === 'loan');
          console.log(`💰 Found ${loanAccounts.length} loans from fallback data`);
        } else {
          if (typeof setLoans === 'function') setLoans([]);
          return;
        }
      }

      const mappedLoans = loanAccounts.map(acc => {
        if (!acc || typeof acc !== 'object') return null;
        const balance = Math.abs(parseFloat(acc.balance) || 0);
        const originalBalance = acc.original_balance !== undefined && acc.original_balance !== null
          ? Math.abs(parseFloat(acc.original_balance))
          : balance;
        const interestRate = parseFloat(acc.interest_rate) || 5.0;
        const term = parseInt(acc.term_months, 10) || 60;
        const remainingPayments = parseInt(acc.remaining_payments, 10) || term;
        const monthlyPayment = parseFloat(acc.payment_amount) || Math.max(25, balance * 0.02);
        const nextPaymentDate = acc.next_payment_date || acc.due_date || null;

        return {
          id: acc.id || `temp-${Date.now()}-${Math.random()}`,
          name: acc.name || 'Unnamed Loan',
          type: acc.loan_type || 'personal',
          lender: acc.institution || 'Unknown',
          originalBalance,
          balance,
          interestRate,
          term,
          remainingPayments,
          monthlyPayment,
          nextPaymentDate,
          userId: acc.user_id || null
        };
      }).filter(loan => loan !== null);

      if (typeof setLoans === 'function') {
        setLoans(mappedLoans);
      } else {
        console.error('❌ setLoans is not a function');
      }
    } catch (error) {
      console.error('❌ Unexpected error in loadLoans:', error);
      if (typeof setLoans === 'function') {
        setLoans([]);
      }
    } finally {
      if (typeof setIsLoadingLoans === 'function') {
        setIsLoadingLoans(false);
      }
      console.log('🏁 loadLoans finished');
    }
  };

  // Load credit cards when entering credit-related views
  useEffect(() => {
    if (currentView === 'credit-dashboard' ||
      currentView === 'credit-planner' ||
      currentView === 'credit-add' ||
      currentView.startsWith('account-')) {
      loadCreditCards();
    }
  }, [currentView]);

  // Load loans when entering loan-related views
  useEffect(() => {
    if (currentView === 'loan-dashboard' ||
      currentView === 'loan-planner' ||
      currentView === 'loan-strategist' ||
      currentView === 'loan-add' ||
      currentView.startsWith('account-')) {
      loadLoans();
    }
  }, [currentView]);

  // Listen for global account updates and refresh credit cards & loans
  useEffect(() => {
    const handleAccountsUpdated = () => {
      console.log('🔄 ViewContainer: accounts-updated event received, refreshing credit cards and loans');
      loadCreditCards();
      loadLoans();
    };
    window.addEventListener('accounts-updated', handleAccountsUpdated);
    return () => window.removeEventListener('accounts-updated', handleAccountsUpdated);
  }, []);

  // Modal handlers for loans
  const handleAddLoanClick = () => {
    setModalMode('add');
    setEditingAccount(null);
    setModalDefaultType('loan');
    setShowAccountModal(true);
  };

  const handleEditLoanClick = (loan) => {
    setModalMode('edit');
    setEditingAccount(loan);
    setShowAccountModal(true);
  };

  // Unified account save handler (for modal)
  const handleSaveAccount = async (data, accountId) => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return;
      }
      const userId = userResult.data.id;

      if (accountId) {
        // EDIT mode – remove type from updates (account type should not change)
        const { type, ...updateData } = data;   // <-- excludes type
        const result = await window.electronAPI.updateAccount(accountId, userId, updateData);
        if (result.success) {
          // After update, refresh lists based on original type (from data)
          if (data.type === 'credit') await loadCreditCards();
          else if (data.type === 'loan') await loadLoans();
          window.dispatchEvent(new CustomEvent('accounts-updated'));
          alert('✅ Account updated successfully');
        } else {
          alert('Update failed: ' + result.error);
        }
      } else {
        // ADD mode
        const accountData = { ...data, user_id: userId };
        const result = await window.electronAPI.createAccount(accountData);
        if (result.success) {
          if (data.type === 'credit') await loadCreditCards();
          else if (data.type === 'loan') await loadLoans();
          window.dispatchEvent(new CustomEvent('accounts-updated'));
          alert('✅ Account added successfully');
          if (onNavigate && result.data?.id) {
            onNavigate(`account-${result.data.id}`);
          }
        } else {
          alert('Add failed: ' + result.error);
        }
      }
    } catch (error) {
      console.error('Error saving account:', error);
      alert('Error: ' + error.message);
    }
  };

  // Payment handlers
  const handleMakePayment = async (paymentData) => {
    console.log('Processing payment:', paymentData);
    try {
      if (window.electronAPI?.processPayment) {
        const result = await window.electronAPI.processPayment(paymentData);
        if (result.success) {
          await loadCreditCards();
          alert('Payment processed successfully!');
          return result;
        }
      } else {
        alert(`✅ Payment of $${paymentData.amount} scheduled for ${paymentData.date}`);
        setCreditCards(prev => prev.map(card => {
          if (card.id === paymentData.cardId) {
            return {
              ...card,
              balance: card.balance + paymentData.amount,
              lastStatementBalance: Math.max(0, card.lastStatementBalance - paymentData.amount)
            };
          }
          return card;
        }));
        return { success: true };
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Failed to process payment');
      return { success: false, error: error.message };
    }
  };

  const handleDeleteAccount = async (account) => {
  if (!account || !account.id) return;
  const confirmDelete = window.confirm(`Are you sure you want to delete "${account.name}"? This action cannot be undone.`);
  if (!confirmDelete) return;

  try {
    if (account.type === 'credit') {
      await handleDeleteCard(account.id);
    } else if (account.type === 'loan') {
      await handleDeleteLoan(account.id);
    } else {
      // checking, savings, or other
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return;
      }
      const userId = userResult.data.id;
      const result = await window.electronAPI.deleteAccount(account.id, userId);
      if (result.success) {
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        alert('✅ Account deleted successfully');
      } else {
        alert('❌ Failed to delete account: ' + result.error);
        return;
      }
    }
    // Close the modal after successful deletion
    setShowAccountModal(false);
    setEditingAccount(null);
    setModalMode('add');
  } catch (error) {
    console.error('Error deleting account:', error);
    alert('Error: ' + error.message);
  }
};
  

  const handleLoanPayment = async (loanId) => {
    console.log('Processing loan payment for:', loanId);
    alert(`Payment for loan ${loanId} - This would open a payment modal`);
  };

  const handleAddLoan = async (loanData) => {
    console.log('📝 Adding new loan:', loanData);
    try {
      const userResult = await window.electronAPI?.getCurrentUser?.();
      if (!userResult?.success || !userResult?.data?.id) {
        const errorMsg = 'You must be logged in to add a loan';
        console.error('❌ handleAddLoan: no user', userResult);
        alert(errorMsg);
        return { success: false, error: errorMsg };
      }
      const userId = userResult.data.id;

      const name = loanData?.name?.trim();
      if (!name) {
        alert('Loan name is required');
        return { success: false, error: 'Loan name missing' };
      }

      const balanceRaw = loanData?.balance;
      const balance = balanceRaw ? -Math.abs(parseFloat(balanceRaw)) : 0;
      if (balanceRaw && isNaN(balance)) {
        alert('Invalid balance amount');
        return { success: false, error: 'Invalid balance' };
      }

      const interestRateRaw = loanData?.interestRate;
      const interestRate = interestRateRaw ? parseFloat(interestRateRaw) : null;
      if (interestRateRaw && isNaN(interestRate)) {
        alert('Invalid interest rate');
        return { success: false, error: 'Invalid interest rate' };
      }

      const originalBalanceRaw = loanData?.originalBalance;
      const originalBalance = originalBalanceRaw ? parseFloat(originalBalanceRaw) : null;
      if (originalBalanceRaw && isNaN(originalBalance)) {
        alert('Invalid original balance');
        return { success: false, error: 'Invalid original balance' };
      }

      const termRaw = loanData?.term;
      const term = termRaw ? parseInt(termRaw, 10) : null;
      if (termRaw && isNaN(term)) {
        alert('Invalid term (months)');
        return { success: false, error: 'Invalid term' };
      }

      const monthlyPaymentRaw = loanData?.monthlyPayment;
      const monthlyPayment = monthlyPaymentRaw ? parseFloat(monthlyPaymentRaw) : null;
      if (monthlyPaymentRaw && isNaN(monthlyPayment)) {
        alert('Invalid monthly payment');
        return { success: false, error: 'Invalid monthly payment' };
      }

      const accountData = {
        name,
        type: 'loan',
        account_type_category: 'loan',
        balance,
        institution: loanData?.lender?.trim() || '',
        interest_rate: interestRate,
        original_balance: originalBalance,
        term_months: term,
        payment_amount: monthlyPayment,
        due_date: loanData?.nextPaymentDate || null,
        currency: 'USD',
        user_id: userId
      };

      if (!window.electronAPI?.createAccount) {
        throw new Error('createAccount IPC handler not available');
      }

      const result = await window.electronAPI.createAccount(accountData);
      if (!result || !result.success) {
        const errorMsg = result?.error || 'Unknown error from server';
        console.error('❌ Failed to add loan:', errorMsg);
        alert('Failed to add loan: ' + errorMsg);
        return { success: false, error: errorMsg };
      }

      console.log('✅ Loan added successfully:', result.data);
      alert('✅ Loan added successfully!');

      if (typeof loadLoans === 'function') {
        try {
          await loadLoans();
        } catch (loadError) {
          console.error('❌ Error refreshing loans:', loadError);
        }
      } else {
        console.warn('loadLoans function not available, cannot refresh list');
      }

      try {
        window.dispatchEvent(new CustomEvent('accounts-updated'));
      } catch (dispatchError) {
        console.error('❌ Error dispatching accounts-updated event:', dispatchError);
      }

      if (typeof onNavigate === 'function' && result.data?.id) {
        try {
          onNavigate(`account-${result.data.id}`);
        } catch (navError) {
          console.error('❌ Error navigating to new loan:', navError);
        }
      } else {
        console.warn('onNavigate not available or missing account ID, skipping navigation');
      }

      return { success: true, data: result.data };
    } catch (error) {
      console.error('❌ Unexpected error in handleAddLoan:', error);
      const errorMessage = error?.message || 'Unknown error';
      alert('Error adding loan: ' + errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Add credit card (used by AddCreditCardForm)
  const handleAddCard = async (cardData) => {
    console.log('🚀 Credit card creation flow started');
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in to add a credit card');
        return { success: false, error: 'Not logged in' };
      }

      const userId = userResult.data.id;

      const accountData = {
        name: String(cardData.name || ''),
        type: 'credit',
        account_type_category: 'credit',
        balance: cardData.balance ? parseFloat(cardData.balance) : 0,
        institution: String(cardData.institution || ''),
        credit_limit: cardData.limit ? parseFloat(cardData.limit) : null,
        interest_rate: cardData.apr ? parseFloat(cardData.apr) : null,
        due_date: cardData.dueDate || null,
        cardHolderName: cardData.cardHolderName || '',
        accountNumber: cardData.accountNumber || '',
        notes: cardData.notes || '',
        currency: 'USD',
        user_id: userId
      };

      const result = await window.electronAPI.createAccount(accountData);

      if (result && result.success) {
        alert('✅ Credit card added successfully!');

        await loadCreditCards();
        window.dispatchEvent(new CustomEvent('accounts-updated'));

        if (onNavigate && result.data?.id) {
          onNavigate(`account-${result.data.id}`);
        }

        return { success: true, data: result.data };
      } else {
        alert('❌ Failed to add credit card: ' + (result?.error || 'Unknown error'));
        return { success: false, error: result?.error };
      }
    } catch (error) {
      console.error('❌ Error adding credit card:', error);
      alert('❌ Failed to add credit card: ' + error.message);
      return { success: false, error: error.message };
    }
  };

  // Edit credit card
  const handleEditCard = async (cardId, updatedData) => {
    console.log('📝 Editing credit card:', cardId);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return { success: false };
      }
      const userId = userResult.data.id;

      const updatePayload = {
        name: updatedData.name,
        institution: updatedData.institution,
        credit_limit: updatedData.credit_limit || updatedData.limit,
        interest_rate: updatedData.interest_rate || updatedData.apr,
        due_date: updatedData.due_date || updatedData.dueDate,
        balance: updatedData.balance ? -Math.abs(parseFloat(updatedData.balance)) : undefined,
        cardHolderName: updatedData.cardHolderName,
        accountNumber: updatedData.accountNumber,
        notes: updatedData.notes
      };

      Object.keys(updatePayload).forEach(key =>
        updatePayload[key] === undefined && delete updatePayload[key]
      );

      let result;
      if (window.electronAPI.updateAccount) {
        result = await window.electronAPI.updateAccount(cardId, userId, updatePayload);
      } else if (window.electronAPI['accounts:update']) {
        result = await window.electronAPI['accounts:update'](cardId, userId, updatePayload);
      } else {
        throw new Error('No account update handler found');
      }

      if (result && result.success) {
        alert('✅ Credit card updated successfully!');
        await loadCreditCards();
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        return { success: true, data: result.data };
      } else {
        alert('❌ Failed to update credit card: ' + (result?.error || 'Unknown error'));
        return { success: false, error: result?.error };
      }
    } catch (error) {
      console.error('❌ Error updating credit card:', error);
      alert('❌ Failed to update credit card: ' + error.message);
      return { success: false, error: error.message };
    }
  };

  // Delete credit card
  const handleDeleteCard = async (cardId) => {
    console.log('🗑️ Deleting credit card:', cardId);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return { success: false };
      }
      const userId = userResult.data.id;

      const result = await window.electronAPI.deleteAccount(cardId, userId);

      if (result.success) {
        await loadCreditCards();
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        alert('✅ Credit card deleted successfully');
        return { success: true };
      } else {
        alert('Failed to delete credit card: ' + result.error);
        return { success: false };
      }
    } catch (error) {
      console.error('Error deleting credit card:', error);
      alert('Error: ' + error.message);
      return { success: false };
    }
  };

  // Navigation helpers for credit cards
  const handleViewTransactions = (cardId) => {
    if (onNavigate) onNavigate(`account-${cardId}`);
  };

  const handleOpenPlanner = () => {
    if (onNavigate) onNavigate('credit-planner');
  };

  const handleOpenDashboard = () => {
    if (onNavigate) onNavigate('credit-dashboard');
  };

  // Payment planning from CreditCardPlanner
  const handlePaymentPlanned = (plan) => {
    console.log('Payment planned:', plan);
    alert(`Payment planned for $${plan.recommendedPayment?.toFixed(2) || plan.amount?.toFixed(2)}`);
    if (plan.cardId && onNavigate) {
      onNavigate(`account-${plan.cardId}`);
    }
  };

  // Move money request from planner
  const handleMoveMoney = (cardId, amount) => {
    console.log('Move money request:', { cardId, amount });
    window.dispatchEvent(new CustomEvent('open-move-money', {
      detail: { toCategory: 'credit-card-payment', amount, cardId }
    }));
    if (onNavigate) onNavigate('propertyMap');
  };

  // Delete loan
  const handleDeleteLoan = async (loanId) => {
    console.log('✅ The real handleDeleteLoan was called!');
    console.log('🗑️ Deleting loan:', loanId);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return { success: false };
      }
      const userId = userResult.data.id;

      const result = await window.electronAPI.deleteAccount(loanId, userId);

      if (result.success) {
        await loadLoans();
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        alert('✅ Loan deleted successfully');
        return { success: true };
      } else {
        alert('Failed to delete loan: ' + result.error);
        return { success: false };
      }
    } catch (error) {
      console.error('Error deleting loan:', error);
      alert('Error: ' + error.message);
      return { success: false };
    }
  };

  // Render the appropriate view based on currentView
  const renderView = () => {
    if (currentView.startsWith('account-')) {
      const accountId = currentView.replace('account-', '');

      const creditCard = creditCards.find(c => c.id === accountId);
      if (creditCard) {
        return (
          <AccountDetailView
            account={creditCard}
            onBack={handleOpenDashboard}
            onMakePayment={(amount) => handleMakePayment({ amount })}
          />
        );
      }

      return (
        <AccountDetailView
          accountId={accountId}
          onBack={() => onNavigate('loan-dashboard')}
          onMakePayment={handleMakePayment}
        />
      );
    }

    switch (currentView) {
      case 'credit-dashboard':
        if (isLoadingCards) {
          return (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p>Loading your credit cards...</p>
            </div>
          );
        }
        return (
          <CreditCardManager
            cards={creditCards}
            transactions={transactions}
            onMakePayment={handleMakePayment}
            onUpdateCard={handleEditCard}
            onDeleteCard={handleDeleteCard}
            onAddCard={() => onNavigate('credit-add')}
            onViewTransactions={handleViewTransactions}
            onOpenPlanner={handleOpenPlanner}
          />
        );

      case 'credit-planner':
        if (isLoadingCards) {
          return (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p>Analyzing your credit cards...</p>
            </div>
          );
        }
        return (
          <CreditCardPlanner
            categories={budgetData?.categories || []}
            creditCards={creditCards}
            onPaymentPlanned={handlePaymentPlanned}
            onMoveMoney={handleMoveMoney}
            onViewCard={(cardId) => onNavigate && onNavigate(`account-${cardId}`)}
            onViewDashboard={handleOpenDashboard}
          />
        );

      case 'credit-add':
        return (
          <AddCreditCardForm
            onComplete={handleAddCard}
            onCancel={() => onNavigate && onNavigate('credit-dashboard')}
          />
        );

      case 'accounts':
        console.log('🔵 Rendering CashAccountsView with accounts:', accounts);
        return <CashAccountsView accounts={accounts} />;

      case 'allAccounts':
      case 'all-accounts':
        console.log('🔵 Rendering AllAccountsView with accounts:', accounts);
        const handleAccountUpdate = (accountId, updates) => {
          console.log('📝 Account updated:', accountId, updates);
        };
        const handleAccountDelete = (accountId) => {
          console.log('🗑️ Account deleted:', accountId);
        };
        return (
          <AllAccountsView
            accounts={accounts}
            onAccountUpdate={handleAccountUpdate}
            onAccountDelete={handleAccountDelete}
          />
        );

      case 'propertyMap':
        return <PropertyMapView />;

      case 'moneyMap':
        return <MoneyMapView />;

      case 'prosperityOptimizer':
        return <ProsperityOptimizerView />;

      case 'reflects':
        return <ReflectsView />;

      case 'forecast':
        return <ForecastPage />;

      case 'creditCards':
        if (onNavigate) {
          setTimeout(() => onNavigate('credit-dashboard'), 0);
        }
        return (
          <div style={styles.loadingContainer}>
            <p>Redirecting to Credit Card Dashboard...</p>
          </div>
        );

      case 'linked-banks':
        return <LinkedBanksView />;

      case 'loan-dashboard':
        if (isLoadingLoans) {
          return (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p>Loading your loans...</p>
            </div>
          );
        }
        return (
          <LoanManager
            loans={loans}
            onMakePayment={handleLoanPayment}
            onEditLoan={handleEditLoanClick}
            onAddLoan={handleAddLoanClick}
            onViewDetails={(loanId) => onNavigate(`account-${loanId}`)}
            onOpenStrategist={() => onNavigate('loan-planner')}
            onDeleteLoan={handleDeleteLoan}
          />
        );

      case 'loan-planner':
        return (
          <LoanStrategist
            loans={loans}
            onPaymentPlanned={handlePaymentPlanned}
            onMoveMoney={handleMoveMoney}
            onViewDebtDetails={(debtId) => onNavigate(`account-${debtId}`)}
            onViewDashboard={() => onNavigate('loan-dashboard')}
            monthlyBudget={budgetData?.categories?.find(c => c.name === 'Debt Payments')?.available || 1000}
          />
        );

      case 'loan-strategist':
        return (
          <LoanStrategist
            loans={loans}
            onPaymentPlanned={handlePaymentPlanned}
            onMoveMoney={handleMoveMoney}
            onViewDebtDetails={(debtId) => onNavigate(`account-${debtId}`)}
            onViewDashboard={() => onNavigate('loan-dashboard')}
            monthlyBudget={budgetData?.categories?.find(c => c.name === 'Debt Payments')?.available || 1000}
          />
        );

      case 'loan-add':
        return (
          <AddLoanForm
            onComplete={handleAddLoan}
            onCancel={() => onNavigate('loan-dashboard')}
          />
        );

      case 'cashflow':
        return (
          <CashFlowView
            budgetData={budgetData}
            transactions={transactions}
            accounts={accounts}
            creditCards={creditCards}
            loans={loans}
          />
        );

      case 'cashflow-forecast':
        return (
          <CashFlowForecast
            budgetData={budgetData}
            transactions={transactions}
            accounts={accounts}
            creditCards={creditCards}
            loans={loans}
          />
        );

      case 'investments':
        return (
          <StrategicInvestmentPortfolio
            investments={[]}
            accounts={accounts}
            transactions={transactions}
          />
        );

      default:
        return (
          <div style={styles.welcomeContainer}>
            <h1 style={styles.welcomeTitle}>Welcome to IntentFlow</h1>
            <p style={styles.welcomeText}>Select an option from the sidebar to get started.</p>
          </div>
        );
    }
  };

  return (
    <>
      <div style={styles.container}>
        {renderView()}
      </div>
      <AccountModal
        isOpen={showAccountModal}
        onClose={() => {
          setShowAccountModal(false);
          setEditingAccount(null);
          setModalMode('add');
          setModalDefaultType('checking');
        }}
        onSave={handleSaveAccount}
        onDelete={handleDeleteAccount}   // <-- add this line
        account={editingAccount}
        mode={modalMode}
        defaultType={modalDefaultType}
      />
      <AccountModal
        isOpen={showAccountModal}
        onClose={() => {
          setShowAccountModal(false);
          setEditingAccount(null);
          setModalMode('add');
          setModalDefaultType('checking');
        }}
        onSave={handleSaveAccount}
        onDelete={handleDeleteAccount}   // <-- add this line
        account={editingAccount}
        mode={modalMode}
        defaultType={modalDefaultType}
      />
    </>
  );
};

const styles = {
  container: {
    width: '100%',
    minHeight: '100%'
  },
  welcomeContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    textAlign: 'center',
    color: '#F3F4F6'
  },
  welcomeTitle: {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    marginBottom: '1rem',
    background: 'linear-gradient(135deg, #60A5FA 0%, #A78BFA 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  welcomeText: {
    fontSize: '1.1rem',
    color: '#9CA3AF',
    maxWidth: '600px'
  },
  errorContainer: {
    padding: '2rem',
    textAlign: 'center',
    color: '#F87171'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    color: '#9CA3AF'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #374151',
    borderTopColor: '#3B82F6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '1rem'
  }
};

export default ViewContainer;