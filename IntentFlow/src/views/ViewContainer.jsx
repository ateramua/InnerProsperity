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
import DebtStrategist from './DebtStrategist';
import AddLoanForm from './AddLoanForm';
import ForecastPage from '../pages/forecast';



const ViewContainer = ({ currentView, accounts, budgetData, transactions, onNavigate }) => {
  // DEBUG LOGS - MOVED INSIDE THE COMPONENT WHERE currentView IS DEFINED
  console.log('🔍 ViewContainer received currentView:', currentView);
  console.log('🔍 Available views: "accounts", "allAccounts", "creditCards", etc.');
  console.log('🔍 accounts length:', accounts?.length);

  // State for credit cards data
  const [creditCards, setCreditCards] = useState([]);
  const [isLoadingCards, setIsLoadingCards] = useState(false);

  // State for loans data
  const [loans, setLoans] = useState([]);
  const [isLoadingLoans, setIsLoadingLoans] = useState(false);

  // Load credit cards data when needed
  // Load credit cards data from database
  const loadCreditCards = async () => {
    console.log('🔍 Loading credit cards from database...');
    setIsLoadingCards(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        setCreditCards([]);
        setIsLoadingCards(false);
        return;
      }

      const userId = userResult.data.id;

      if (window.electronAPI?.getAccountsSummary) {
        const accountsResult = await window.electronAPI.getAccountsSummary(userId);

        if (accountsResult?.success) {
          const allAccounts = accountsResult.data || [];
          // Filter for credit card accounts
          const creditCardsOnly = allAccounts.filter(acc => acc.type === 'credit');
          console.log(`💰 Found ${creditCardsOnly.length} credit cards`);
          setCreditCards(creditCardsOnly);
        } else {
          setCreditCards([]);
        }
      }
    } catch (error) {
      console.error('Error loading credit cards:', error);
      setCreditCards([]);
    } finally {
      setIsLoadingCards(false);
    }
  };
  // Load loans data when needed
  const loadLoans = async () => {
    setIsLoadingLoans(true);
    try {
      if (window.electronAPI?.getLoans) {
        const loansData = await window.electronAPI.getLoans();
        setLoans(loansData);
      } else {
        // Mock data for development
        const mockLoans = [
          {
            id: 'loan1',
            name: 'Auto Loan',
            type: 'auto',
            lender: 'Chase',
            originalBalance: 25000,
            balance: -15250.75,
            interestRate: 4.5,
            term: 60,
            remainingPayments: 42,
            monthlyPayment: 345.67,
            nextPaymentDate: '2024-04-15',
            userId: 2
          },
          {
            id: 'loan2',
            name: 'Student Loan',
            type: 'student',
            lender: 'Navient',
            originalBalance: 35000,
            balance: -28750.50,
            interestRate: 3.8,
            term: 120,
            remainingPayments: 98,
            monthlyPayment: 287.34,
            nextPaymentDate: '2024-04-20',
            userId: 2
          },
          {
            id: 'loan3',
            name: 'Personal Loan',
            type: 'personal',
            lender: 'SoFi',
            originalBalance: 5000,
            balance: -5000.00,
            interestRate: 8.9,
            term: 36,
            remainingPayments: 36,
            monthlyPayment: 189.45,
            nextPaymentDate: '2024-04-10',
            userId: 2
          }
        ];
        setLoans(mockLoans);
      }
    } catch (error) {
      console.error('Error loading loans:', error);
    } finally {
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

  // Unified account creation for all account types
  const handleAddAccount = async (accountData) => {
    console.log('📝 Adding account:', accountData.type, accountData.name);

    try {
      // Get current user
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in to add an account');
        return { success: false, error: 'Not logged in' };
      }

      // Add user_id to the data
      const dataWithUser = {
        ...accountData,
        user_id: userResult.data.id
      };

      // Save to database using unified handler
      const result = await window.electronAPI.createAccount(dataWithUser);

      if (result.success) {
        console.log('✅ Account added successfully:', result.data);

        // Refresh accounts based on type
        if (accountData.type === 'credit') {
          await loadCreditCards();
        } else if (accountData.type === 'loan') {
          await loadLoans();
        }

        // Refresh all accounts
        window.dispatchEvent(new Event('accounts-changed'));

        // Navigate to the new account if needed
        if (onNavigate && result.data?.id) {
          onNavigate(`account-${result.data.id}`);
        }

        return { success: true, data: result.data };
      } else {
        alert('Failed to add account: ' + (result.error || 'Unknown error'));
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('❌ Error adding account:', error);
      alert('Failed to add account: ' + error.message);
      return { success: false, error: error.message };
    }
  };

  // Load loans when entering loan-related views
  useEffect(() => {
    if (currentView === 'loan-dashboard' ||
      currentView === 'loan-planner' ||
      currentView === 'loan-add' ||
      currentView.startsWith('account-')) {
      loadLoans();
    }
  }, [currentView]);

  // Handle making a payment
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

  // Handle loan payment
  const handleLoanPayment = async (loanId) => {
    console.log('Processing loan payment for:', loanId);
    alert(`Payment for loan ${loanId} - This would open a payment modal`);
  };

  // Handle edit loan
  const handleEditLoan = (loan) => {
    console.log('Editing loan:', loan);
    alert(`Edit loan: ${loan.name} - This would open an edit form`);
  };

  // Handle add loan
  const handleAddLoan = async (loanData) => {
    console.log('Adding new loan:', loanData);
    try {
      const newLoan = {
        id: `loan-${Date.now()}`,
        ...loanData,
        balance: -Math.abs(loanData.balance || loanData.currentBalance),
        userId: 2
      };
      setLoans(prev => [...prev, newLoan]);
      alert('✅ Loan added successfully!');
      if (onNavigate) {
        onNavigate(`account-${newLoan.id}`);
      }
      return { success: true, data: { id: newLoan.id } };
    } catch (error) {
      console.error('Error adding loan:', error);
      alert('Failed to add loan');
      return { success: false, error: error.message };
    }
  };

  // Handle editing a credit card


  // Handle adding a new credit card
  // Handle adding a new credit card
  // Handle adding a new credit card
  // Handle adding a new credit card
  // Handle adding a new credit card
  const handleAddCard = async (cardData) => {
    console.log('\n\x1b[45m\x1b[37m%s\x1b[0m', '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀');
    console.log('\x1b[45m\x1b[37m%s\x1b[0m', '🚀         CREDIT CARD CREATION FLOW            🚀');
    console.log('\x1b[45m\x1b[37m%s\x1b[0m', '🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀\n');

    console.log('\x1b[33m%s\x1b[0m', '📥 STEP 1: RECEIVED CARD DATA:');
    console.log('\x1b[32m%s\x1b[0m', JSON.stringify(cardData, null, 2));

    try {
      // STEP 2: Get current user
      console.log('\n\x1b[34m%s\x1b[0m', '🔑 STEP 2: GETTING CURRENT USER...');
      const userResult = await window.electronAPI.getCurrentUser();

      if (!userResult?.success || !userResult?.data) {
        console.log('\x1b[31m%s\x1b[0m', '   ❌ No user logged in');
        alert('You must be logged in to add a credit card');
        return { success: false, error: 'Not logged in' };
      }

      const userId = userResult.data.id;
      console.log('\x1b[32m%s\x1b[0m', `   ✅ User ID: ${userId}`);

      // STEP 3: Format the account data - MAP ALL FIELDS CORRECTLY
      console.log('\n\x1b[35m%s\x1b[0m', '📝 STEP 3: FORMATTING ACCOUNT DATA');

      // Create a clean object with ALL fields mapped correctly
      const accountData = {
        name: String(cardData.name || ''),
        type: 'credit',
        account_type_category: 'credit',
        balance: cardData.balance ? parseFloat(cardData.balance) : 0,
        institution: String(cardData.institution || ''),
        credit_limit: cardData.limit ? parseFloat(cardData.limit) : null,
        interest_rate: cardData.apr ? parseFloat(cardData.apr) : null,
        due_date: cardData.dueDate || null,
        // Include additional fields for account details page
        cardHolderName: cardData.cardHolderName || '',
        accountNumber: cardData.accountNumber || '',
        notes: cardData.notes || '',
        currency: 'USD',
        user_id: userId
      };

      console.log('   Formatted data:', JSON.stringify(accountData, null, 2));

      // STEP 4: Save to database
      console.log('\n\x1b[34m%s\x1b[0m', '💾 STEP 4: SAVING TO DATABASE...');
      const result = await window.electronAPI.createAccount(accountData);
      console.log('   Result:', result);

      if (result && result.success) {
        console.log('\n\x1b[42m\x1b[37m%s\x1b[0m', '🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉');
        console.log('\x1b[42m\x1b[37m%s\x1b[0m', '🎉   CREDIT CARD ADDED SUCCESSFULLY!        🎉');
        console.log('\x1b[42m\x1b[37m%s\x1b[0m', '🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉\n');

        alert('✅ Credit card added successfully!');

        // STEP 5: Refresh the credit cards list
        console.log('\n\x1b[33m%s\x1b[0m', '🔄 STEP 5: REFRESHING CREDIT CARDS LIST');
        await loadCreditCards();

        // STEP 6: Dispatch event
        window.dispatchEvent(new Event('accounts-changed'));

        // STEP 7: Navigate to the new card
        if (onNavigate && result.data?.id) {
          console.log('\x1b[33m%s\x1b[0m', `🧭 STEP 7: NAVIGATING TO ACCOUNT ${result.data.id}`);
          onNavigate(`account-${result.data.id}`);
        }

        return { success: true, data: result.data };
      } else {
        console.log('\n\x1b[41m\x1b[37m%s\x1b[0m', '❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
        console.log('\x1b[41m\x1b[37m%s\x1b[0m', '❌   FAILED TO ADD CREDIT CARD           ❌');
        console.log('\x1b[41m\x1b[37m%s\x1b[0m', `❌   Error: ${result?.error || 'Unknown error'}`);
        console.log('\x1b[41m\x1b[37m%s\x1b[0m', '❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌\n');

        alert('❌ Failed to add credit card: ' + (result?.error || 'Unknown error'));
        return { success: false, error: result?.error };
      }
    } catch (error) {
      console.log('\n\x1b[41m\x1b[37m%s\x1b[0m', '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
      console.log('\x1b[41m\x1b[37m%s\x1b[0m', '🔥         EXCEPTION CAUGHT                🔥');
      console.log('\x1b[41m\x1b[37m%s\x1b[0m', '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥\n');
      console.log('\x1b[31m%s\x1b[0m', '❌ Error:', error.message);
      alert('❌ Failed to add credit card: ' + error.message);
      return { success: false, error: error.message };
    }
  };

  // Handle viewing transactions for a specific card
  const handleViewTransactions = (cardId) => {
    if (onNavigate) {
      onNavigate(`account-${cardId}`);
    }
  };

  // Handle opening the planner
  const handleOpenPlanner = () => {
    if (onNavigate) {
      onNavigate('credit-planner');
    }
  };

  // Handle opening the dashboard
  const handleOpenDashboard = () => {
    if (onNavigate) {
      onNavigate('credit-dashboard');
    }
  };

  // Handle payment planned from planner
  const handlePaymentPlanned = (plan) => {
    console.log('Payment planned:', plan);
    alert(`Payment planned for $${plan.recommendedPayment?.toFixed(2) || plan.amount?.toFixed(2)}`);
    if (plan.cardId && onNavigate) {
      onNavigate(`account-${plan.cardId}`);
    }
  };

  // Handle move money request from planner
  const handleMoveMoney = (cardId, amount) => {
    console.log('Move money request:', { cardId, amount });
    window.dispatchEvent(new CustomEvent('open-move-money', {
      detail: { toCategory: 'credit-card-payment', amount, cardId }
    }));
    if (onNavigate) {
      onNavigate('propertyMap');
    }
  };
  // Handle editing a credit card
  const handleEditCard = async (cardId, updatedData) => {
    console.log('\n\x1b[46m\x1b[37m%s\x1b[0m', '📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝');
    console.log('\x1b[46m\x1b[37m%s\x1b[0m', '📝         CREDIT CARD EDIT FLOW            📝');
    console.log('\x1b[46m\x1b[37m%s\x1b[0m', '📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝📝\n');

    console.log('\x1b[33m%s\x1b[0m', '📥 STEP 1: EDITING CARD:', cardId);
    console.log('\x1b[33m%s\x1b[0m', '📦 Updated data:', JSON.stringify(updatedData, null, 2));

    try {
      // STEP 2: Get current user
      console.log('\n\x1b[34m%s\x1b[0m', '🔑 STEP 2: GETTING CURRENT USER...');
      const userResult = await window.electronAPI.getCurrentUser();

      if (!userResult?.success || !userResult?.data) {
        console.log('\x1b[31m%s\x1b[0m', '   ❌ No user logged in');
        alert('You must be logged in to edit a card');
        return { success: false, error: 'Not logged in' };
      }

      const userId = userResult.data.id;
      console.log('\x1b[32m%s\x1b[0m', `   ✅ User ID: ${userId}`);

      // STEP 3: Format the updated data
      console.log('\n\x1b[35m%s\x1b[0m', '📝 STEP 3: FORMATTING UPDATE DATA');

      // Create a clean object with all fields mapped correctly
      const updatePayload = {
        name: updatedData.name,
        institution: updatedData.institution,
        credit_limit: updatedData.credit_limit || updatedData.limit,
        limit: updatedData.limit || updatedData.credit_limit, // For compatibility
        interest_rate: updatedData.interest_rate || updatedData.apr,
        apr: updatedData.apr || updatedData.interest_rate, // For compatibility
        due_date: updatedData.due_date || updatedData.dueDate,
        dueDate: updatedData.dueDate || updatedData.due_date, // For compatibility
        balance: updatedData.balance ? -Math.abs(parseFloat(updatedData.balance)) : undefined,
        cardHolderName: updatedData.cardHolderName,
        accountNumber: updatedData.accountNumber,
        notes: updatedData.notes
      };

      // Remove undefined values
      Object.keys(updatePayload).forEach(key =>
        updatePayload[key] === undefined && delete updatePayload[key]
      );

      console.log('   Formatted update:', JSON.stringify(updatePayload, null, 2));

      // STEP 4: Call the update account handler
      console.log('\n\x1b[34m%s\x1b[0m', '💾 STEP 4: UPDATING DATABASE...');

      // Check which update handler is available
      let result;
      if (window.electronAPI.updateAccount) {
        // Try the three-parameter version first (id, userId, updates)
        result = await window.electronAPI.updateAccount(cardId, userId, updatePayload);
      } else if (window.electronAPI['accounts:update']) {
        // Try the namespaced version
        result = await window.electronAPI['accounts:update'](cardId, userId, updatePayload);
      } else {
        throw new Error('No account update handler found');
      }

      console.log('   Result:', result);

      if (result && result.success) {
        console.log('\n\x1b[42m\x1b[37m%s\x1b[0m', '🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉');
        console.log('\x1b[42m\x1b[37m%s\x1b[0m', '🎉   CREDIT CARD UPDATED SUCCESSFULLY!    🎉');
        console.log('\x1b[42m\x1b[37m%s\x1b[0m', '🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉\n');

        alert('✅ Credit card updated successfully!');

        // STEP 5: Refresh the credit cards list
        console.log('\n\x1b[33m%s\x1b[0m', '🔄 STEP 5: REFRESHING CREDIT CARDS LIST');
        await loadCreditCards();

        // STEP 6: Dispatch event
        window.dispatchEvent(new Event('accounts-changed'));

        return { success: true, data: result.data };
      } else {
        console.log('\n\x1b[41m\x1b[37m%s\x1b[0m', '❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
        console.log('\x1b[41m\x1b[37m%s\x1b[0m', '❌   FAILED TO UPDATE CREDIT CARD         ❌');
        console.log('\x1b[41m\x1b[37m%s\x1b[0m', `❌   Error: ${result?.error || 'Unknown error'}`);
        console.log('\x1b[41m\x1b[37m%s\x1b[0m', '❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌\n');

        alert('❌ Failed to update credit card: ' + (result?.error || 'Unknown error'));
        return { success: false, error: result?.error };
      }
    } catch (error) {
      console.log('\n\x1b[41m\x1b[37m%s\x1b[0m', '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
      console.log('\x1b[41m\x1b[37m%s\x1b[0m', '🔥         EXCEPTION CAUGHT                🔥');
      console.log('\x1b[41m\x1b[37m%s\x1b[0m', '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥\n');
      console.log('\x1b[31m%s\x1b[0m', '❌ Error:', error.message);
      alert('❌ Failed to update credit card: ' + error.message);
      return { success: false, error: error.message };
    }
  };
  // In ViewContainer.jsx, after handleEditCard

  const handleDeleteCard = async (cardId) => {
    console.log('🗑️ Deleting credit card:', cardId);

    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return { success: false };
      }
      const userId = userResult.data.id;

      // Use the delete account handler (accounts:delete)
      const result = await window.electronAPI['accounts:delete'](cardId, userId);

      if (result.success) {
        await loadCreditCards();
        window.dispatchEvent(new Event('accounts-changed'));
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

  // Then pass it to CreditCardManager
  <CreditCardManager
    cards={creditCards}
    transactions={transactions}
    onMakePayment={handleMakePayment}
    onEditCard={handleEditCard}
    onDeleteCard={handleDeleteCard}   // <-- new prop
    onAddCard={() => onNavigate('credit-add')}
    onViewTransactions={handleViewTransactions}
    onOpenPlanner={handleOpenPlanner}
  />

  // Parse the current view to handle account-specific views
  const renderView = () => {
    // Handle account-specific views (format: "account-{id}")
    if (currentView.startsWith('account-')) {
      const accountId = currentView.replace('account-', '');

      // First check if it's a credit card account
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

      // Otherwise check regular accounts
      const account = accounts?.find(a => a.id === accountId);

      if (!account) {
        return (
          <div style={styles.errorContainer}>
            <h2>Account Not Found</h2>
            <p>The account you're looking for doesn't exist.</p>
          </div>
        );
      }

      return <AccountDetailView account={account} />;
    }

    // Handle credit card specific views
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
            onEditCard={handleEditCard}
            onAddCard={handleAddCard}
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

      // Handle regular views
      case 'accounts':
        console.log('🔵 Rendering CashAccountsView with accounts:', accounts);
        return <CashAccountsView accounts={accounts} />;
      case 'allAccounts':
      case 'all-accounts':
        console.log('🔵 Rendering AllAccountsView with accounts:', accounts);

        // Define the missing handler functions right here
        const handleAccountUpdate = (accountId, updates) => {
          console.log('📝 Account updated:', accountId, updates);
          // You can refresh the accounts list here if needed
        };

        const handleAccountDelete = (accountId) => {
          console.log('🗑️ Account deleted:', accountId);
          // You can refresh the accounts list here if needed
        };

        return <AllAccountsView
          accounts={accounts}
          onAccountUpdate={handleAccountUpdate}
          onAccountDelete={handleAccountDelete}
        />;

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
            onEditLoan={handleEditLoan}
            onAddLoan={() => onNavigate('loan-add')}
            onViewDetails={(loanId) => onNavigate(`account-${loanId}`)}
            onOpenStrategist={() => onNavigate('loan-planner')}
          />
        );

      case 'loan-planner':
        if (isLoadingLoans || isLoadingCards) {
          return (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p>Analyzing your debt...</p>
            </div>
          );
        }
        return (
          <DebtStrategist
            creditCards={creditCards}
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
    <div style={styles.container}>
      {renderView()}
    </div>
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