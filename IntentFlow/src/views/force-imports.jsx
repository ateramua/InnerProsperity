// src/views/force-imports.js
// This file forces all view components to be included in the build

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

// Export all views to prevent tree-shaking
export const views = {
  CashAccountsView,
  AllAccountsView,
  PropertyMapView,
  ReflectsView,
  CashView,
  CreditCardsView,
  LoansView,
  AccountDetailView,
  MoneyMapView,
  ProsperityOptimizerView
};

// Force usage
export const __FORCE_IMPORT = true;