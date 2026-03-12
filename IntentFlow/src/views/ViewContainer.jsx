// src/views/ViewContainer.jsx
import React from 'react';

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

const ViewContainer = ({ currentView, accounts }) => {
  console.log('🔍 ViewContainer rendering with currentView:', currentView);

  // Parse the current view to handle account-specific views
  const renderView = () => {
    // Handle account-specific views (format: "account-{id}")
    if (currentView.startsWith('account-')) {
      const accountId = currentView.replace('account-', '');
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

    // Handle regular views
    switch (currentView) {
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
        return <ForecastPage />

      case 'creditCards':
        return <CreditCardsView accounts={accounts} />;

      case 'loans':
        return <LoansView accounts={accounts} />;

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
  }
};

export default ViewContainer;