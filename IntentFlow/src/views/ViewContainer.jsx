// src/views/ViewContainer.jsx
import React, { useState, useEffect } from 'react';

// Import all view components
import PropertyMapView from './PropertyMapView';
import ReflectsView from './ReflectsView';
import AllAccountsView from './AllAccountsView';
import CashView from './CashView';
import CreditCardsView from './CreditCardsView';
import LoansView from './LoansView';
import AccountDetailView from './AccountDetailView';
import ForecastPage from '../pages/forecast';
import MoneyMapView from './MoneyMapView';
import ProsperityOptimizerView from './ProsperityOptimizerView';

// Import credit card components
import CreditCardManager from './CreditCardManager';
import CreditCardPlanner from './CreditCardPlanner';
import AddCreditCardForm from './AddCreditCardForm';

// Import loan components (we'll create these next)
import LoanManager from './LoanManager';
import DebtStrategist from './DebtStrategist';
import AddLoanForm from './AddLoanForm';

import CashFlowView from './CashFlowView';
import CashFlowForecast from './CashFlowForecast';

// Add this import with your other imports
import StrategicInvestmentPortfolio from './StrategicInvestmentPortfolio'; // or InvestmentPortfolio if you kept the original name

const ViewContainer = ({ currentView, accounts, budgetData, transactions, onNavigate }) => {
  console.log('🔍 ViewContainer rendering with currentView:', currentView);

  // State for credit cards data
  const [creditCards, setCreditCards] = useState([]);
  const [isLoadingCards, setIsLoadingCards] = useState(false);

  // State for loans data
  const [loans, setLoans] = useState([]);
  const [isLoadingLoans, setIsLoadingLoans] = useState(false);

  // Load credit cards data when needed
  const loadCreditCards = async () => {
    setIsLoadingCards(true);
    try {
      // Try to get from database first
      if (window.electronAPI?.getCreditCards) {
        const cards = await window.electronAPI.getCreditCards();
        setCreditCards(cards);
      } else {
        // Mock data for development
        const mockCards = [
          {
            id: 'test6',
            name: 'Chase Sapphire',
            institution: 'Chase',
            balance: -1250.50,
            limit: 5000,
            apr: 18.99,
            dueDate: '2024-04-15',
            lastStatementBalance: 1250.50,
            minimumPayment: 35,
            type: 'credit',
            userId: 2
          },
          {
            id: 'test7',
            name: 'Apple Card',
            institution: 'Goldman Sachs',
            balance: -450.75,
            limit: 3000,
            apr: 15.99,
            dueDate: '2024-04-20',
            lastStatementBalance: 450.75,
            minimumPayment: 25,
            type: 'credit',
            userId: 2
          },
          {
            id: 'test8',
            name: 'Capital One',
            institution: 'Capital One',
            balance: -875.25,
            limit: 4000,
            apr: 16.99,
            dueDate: '2024-04-10',
            lastStatementBalance: 875.25,
            minimumPayment: 30,
            type: 'credit',
            userId: 2
          }
        ];
        setCreditCards(mockCards);
      }
    } catch (error) {
      console.error('Error loading credit cards:', error);
    } finally {
      setIsLoadingCards(false);
    }
  };

  // Load loans data when needed
  const loadLoans = async () => {
    setIsLoadingLoans(true);
    try {
      // Try to get from database first
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
      // This would call your payment processing API
      if (window.electronAPI?.processPayment) {
        const result = await window.electronAPI.processPayment(paymentData);
        if (result.success) {
          // Refresh credit cards data
          await loadCreditCards();
          alert('Payment processed successfully!');
          return result;
        }
      } else {
        // Mock successful payment
        alert(`✅ Payment of $${paymentData.amount} scheduled for ${paymentData.date}`);

        // Update mock data (in real app, this would come from DB)
        setCreditCards(prev => prev.map(card => {
          if (card.id === paymentData.cardId) {
            return {
              ...card,
              balance: card.balance + paymentData.amount, // Adding because balance is negative
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
    // This would open a payment modal or navigate
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
      // Mock adding loan
      const newLoan = {
        id: `loan-${Date.now()}`,
        ...loanData,
        balance: -Math.abs(loanData.balance || loanData.currentBalance),
        userId: 2
      };
      setLoans(prev => [...prev, newLoan]);
      alert('✅ Loan added successfully!');

      // Navigate to the new loan's account view
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
  const handleEditCard = (card) => {
    console.log('Editing card:', card);
    // Navigate to card edit form or open modal
    // For now, just log and maybe open a modal
    alert(`Edit card: ${card.name} - This would open an edit form`);
  };

  // Handle adding a new credit card
  const handleAddCard = async (cardData) => {
    console.log('Adding new card:', cardData);
    try {
      if (window.electronAPI?.createCreditCard) {
        const result = await window.electronAPI.createCreditCard(cardData);
        if (result.success) {
          await loadCreditCards();
          alert('Credit card added successfully!');
          // Navigate to the new card's account view
          if (onNavigate) {
            onNavigate(`account-${result.data.id}`);
          }
          return result;
        }
      } else {
        // Mock adding card
        const newCard = {
          id: `card-${Date.now()}`,
          name: cardData.name,
          institution: cardData.institution || 'New Card',
          balance: 0,
          limit: cardData.limit || 1000,
          apr: cardData.apr || 18.99,
          dueDate: cardData.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          lastStatementBalance: 0,
          minimumPayment: 0,
          type: 'credit',
          userId: 2
        };
        setCreditCards(prev => [...prev, newCard]);
        alert('✅ Credit card added successfully!');

        // Navigate to the new card's account view
        if (onNavigate) {
          onNavigate(`account-${newCard.id}`);
        }
        return { success: true, data: { id: newCard.id } };
      }
    } catch (error) {
      console.error('Error adding credit card:', error);
      alert('Failed to add credit card');
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
    // Show payment modal or navigate to payment
    alert(`Payment planned for $${plan.recommendedPayment?.toFixed(2) || plan.amount?.toFixed(2)}`);

    // Option 1: Navigate to account to execute payment
    if (plan.cardId && onNavigate) {
      onNavigate(`account-${plan.cardId}`);
    }
  };

  // Handle move money request from planner
  const handleMoveMoney = (cardId, amount) => {
    console.log('Move money request:', { cardId, amount });
    // This would trigger the move money modal in PropertyMapView
    // You could use an event bus or context to communicate
    window.dispatchEvent(new CustomEvent('open-move-money', {
      detail: { toCategory: 'credit-card-payment', amount, cardId }
    }));

    // Navigate to property map to show the move money modal
    if (onNavigate) {
      onNavigate('propertyMap');
    }
  };

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
      case 'propertyMap':
        return <PropertyMapView />;

      case 'moneyMap':
        return <MoneyMapView />;

      case 'prosperityOptimizer':
        return <ProsperityOptimizerView />;

      case 'reflects':
        return <ReflectsView />;

      case 'allAccounts':
        return <AllAccountsView accounts={accounts} />;

      case 'cash':
        return <CashView accounts={accounts} />;

      case 'forecast':
        return <ForecastPage />;

      case 'creditCards':
        // Legacy support - redirect to dashboard
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
      investments={[]} // Pass your investments data here
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

// Add keyframes for spinner animation (this would need to be in a global CSS file)
// @keyframes spin {
//   to { transform: rotate(360deg); }
// }

export default ViewContainer;