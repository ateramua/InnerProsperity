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

const ViewContainer = ({ currentView, accounts, budgetData, transactions, onNavigate }) => {
  // DEBUG LOGS
  console.log('🔍 ViewContainer received currentView:', currentView);
  console.log('🔍 Available views: "accounts", "allAccounts", "creditCards", etc.');
  console.log('🔍 accounts length:', accounts?.length);

  // Modal state
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
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
    console.log('handleDeleteCard defined:', typeof handleDeleteCard);
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
    setIsLoadingLoans(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        console.log('❌ No user logged in');
        setLoans([]);
        return;
      }

      const userId = userResult.data.id;
      const accountsResult = await window.electronAPI.getAccountsSummary(userId);

      if (accountsResult?.success) {
        const allAccounts = accountsResult.data || [];
        const loanAccounts = allAccounts.filter(acc => acc.type === 'loan');
        console.log(`💰 Found ${loanAccounts.length} loans`);

        // Map database fields to the structure expected by LoanStrategist
        const mappedLoans = loanAccounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          type: acc.loan_type || 'personal',
          lender: acc.institution || 'Unknown',
          originalBalance: acc.original_balance || Math.abs(acc.balance),
          balance: Math.abs(acc.balance || 0),
          interestRate: acc.interest_rate || 5.0,
          term: acc.term_months || 60,
          remainingPayments: acc.remaining_payments || acc.term_months || 60,
          monthlyPayment: acc.payment_amount || Math.max(25, Math.abs(acc.balance) * 0.02),
          nextPaymentDate: acc.next_payment_date || acc.due_date || null,
          userId: acc.user_id
        }));

        setLoans(mappedLoans);
      } else {
        console.error('❌ Failed to load accounts:', accountsResult?.error);
        setLoans([]);
      }
    } catch (error) {
      console.error('❌ Error loading loans:', error);
      setLoans([]);
    } finally {
      console.log('🏁 loadLoans finished');
      setIsLoadingLoans(false);
    }
  };

  // Load cards when entering credit-related views
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
        // EDIT mode
        const result = await window.electronAPI.updateAccount(accountId, userId, data);
        if (result.success) {
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

  const handleLoanPayment = async (loanId) => {
    console.log('Processing loan payment for:', loanId);
    alert(`Payment for loan ${loanId} - This would open a payment modal`);
  };

  // Add loan (used by AddLoanForm)
  const handleAddLoan = async (loanData) => {
    console.log('📝 Adding new loan:', loanData);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in to add a loan');
        return { success: false, error: 'Not logged in' };
      }

      const userId = userResult.data.id;

      const accountData = {
        name: loanData.name,
        type: 'loan',
        account_type_category: 'loan',
        balance: loanData.balance ? -Math.abs(parseFloat(loanData.balance)) : 0,
        institution: loanData.lender || '',
        interest_rate: loanData.interestRate ? parseFloat(loanData.interestRate) : null,
        original_balance: loanData.originalBalance ? parseFloat(loanData.originalBalance) : null,
        term_months: loanData.term ? parseInt(loanData.term) : null,
        payment_amount: loanData.monthlyPayment ? parseFloat(loanData.monthlyPayment) : null,
        due_date: loanData.nextPaymentDate || null,
        currency: 'USD',
        user_id: userId
      };

      const result = await window.electronAPI.createAccount(accountData);

      if (result.success) {
        console.log('✅ Loan added successfully:', result.data);
        alert('✅ Loan added successfully!');

        await loadLoans();
        window.dispatchEvent(new CustomEvent('accounts-updated'));

        if (onNavigate && result.data?.id) {
          onNavigate(`account-${result.data.id}`);
        }

        return { success: true, data: result.data };
      } else {
        console.error('❌ Failed to add loan:', result.error);
        alert('Failed to add loan: ' + (result.error || 'Unknown error'));
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('❌ Error adding loan:', error);
      alert('Error adding loan: ' + error.message);
      return { success: false, error: error.message };
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

      // Remove undefined values
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

  // Add this near your other loan handlers
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

      // Use the same accounts:delete handler as credit cards
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
    // Account-specific views
    if (currentView.startsWith('account-')) {
      const accountId = currentView.replace('account-', '');

      // Check if it's a credit card account (special case with existing handlers)
      const creditCard = creditCards.find(c => c.id === accountId);
      if (creditCard) {
        return (
          <AccountDetailView
            account={creditCard}
            onBack={handleOpenDashboard}
            onMakePayment={(amount) => handleMakePayment({
              cardId: creditCard.id,
              amount,
              date: new Date().toISOString().split('T')[0],
              accountId: creditCard.id
            })}
          />
        );
      }

      // For all other accounts (including loans), use self-fetching version with accountId
      return (
        <AccountDetailView
          accountId={accountId}
          onBack={() => onNavigate('loan-dashboard')} // Default back to loan dashboard
          onMakePayment={handleMakePayment} // Will work for loans if payment handler exists
        />
      );
    }

    // Switch for all other views
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
            cards={creditCards}
            transactions={transactions}
            onMakePayment={handleMakePayment}
            onUpdateCard={handleEditCard}        // ✅ changed from onEditCard
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
          // Refresh logic can be added here
        };
        const handleAccountDelete = (accountId) => {
          console.log('🗑️ Account deleted:', accountId);
          // Refresh logic can be added here
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
            onDeleteLoan={handleDeleteLoan}     // <-- add this line
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