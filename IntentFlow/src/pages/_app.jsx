import { useEffect } from 'react';
import '../styles/globals.css';
import { AuthProvider } from '../contexts/AuthContext';

if (typeof window !== 'undefined') {
  window.__intentflowBootLog?.('_app module loaded');
  console.log('[IntentFlow boot] _app module loaded');
}

function isElectronUserAgent() {
  if (typeof navigator === 'undefined') return false;
  return navigator.userAgent.includes('Electron');
}

function isRealElectronAPI() {
  return (
    typeof window !== 'undefined' &&
    typeof window.electronAPI !== 'undefined' &&
    typeof window.electronAPI.createAccount === 'function' &&
    !window.electronAPI.__isBrowserMock
  );
}

// Initialize Electron API or browser-only mock (never mock inside Electron)
function useInitializeElectronAPI() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.global = window;
    window.globalThis = window;

    if (isRealElectronAPI()) {
      console.log('✅ Real Electron API already available');
      return;
    }

    const handleReady = () => {
      if (isRealElectronAPI()) {
        console.log('✅ Real electronAPI ready (preload event)');
      }
    };

    window.addEventListener('electronAPI-ready', handleReady);

    const inElectron = isElectronUserAgent();

    if (inElectron) {
      const deadline = Date.now() + 15000;
      const poll = () => {
        if (isRealElectronAPI()) {
          return;
        }
        if (Date.now() < deadline) {
          setTimeout(poll, 50);
          return;
        }
        console.error(
          '❌ Electron renderer: electronAPI did not become available. Check preload path and contextIsolation.'
        );
      };
      poll();
      return () => {
        window.removeEventListener('electronAPI-ready', handleReady);
      };
    }

    if (!isRealElectronAPI()) {
      console.warn('⚠️ Real electronAPI not available - using browser mock (Chrome only)');
      const browserUser = { id: 3, username: 'user', email: 'user@example.com', role: 'user' };

      window.electronAPI = {
        __isBrowserMock: true,
        getCurrentUser: async () => ({ success: true, data: browserUser }),
        loginUser: async (credentials) => ({ success: true, data: browserUser }),
        logoutUser: async () => ({ success: true }),
        createUser: async (userData) => ({ success: true, data: browserUser }),
        createAccount: async (accountData) => {
          console.log('🔧 MOCK MODE: createAccount not persisting to database', accountData);
          return { success: false, error: 'Real electronAPI not available - use Electron app' };
        },
        getAccountsSummary: async (userId) => ({ success: true, data: [] }),
        getAccountById: async (id) => ({ success: true, data: null }),
        updateAccount: async (id, userId, updates) => ({ success: true }),
        deleteAccount: async (id, userId) => ({ success: true }),
        permanentlyDeleteCreditAccount: async (id, userId) => ({ success: true }),
        permanentlyDeleteLoanAccount: async (id, userId) => ({ success: true }),
        getCategories: async (userId) => ({ success: true, data: [] }),
        getBudgetMonthSnapshot: async (userId, monthKey) => ({
          success: true,
          data: {
            monthKey: monthKey || '1970-01-01',
            prevMonthKey: '1970-01-01',
            isCurrentCalendarMonth: true,
            categories: []
          }
        }),
        exportProsperityTable: async () => ({
          success: false,
          error: 'Real electronAPI not available - use Electron app',
        }),
        pickProsperityImportFile: async () => ({
          success: false,
          error: 'Real electronAPI not available - use Electron app',
        }),
        previewProsperityImport: async () => ({
          success: false,
          error: 'Real electronAPI not available - use Electron app',
        }),
        applyProsperityImport: async () => ({
          success: false,
          error: 'Real electronAPI not available - use Electron app',
        }),
        getCategoryGroups: async (userId) => ({ success: true, data: [] }),
        createCategory: async (data) => ({ success: true, data: { id: Date.now() } }),
        updateCategory: async (id, updates) => ({ success: true }),
        deleteCategory: async (id) => ({ success: true }),
        archiveCategory: async (id, userId) => ({ success: true }),
        restoreCategory: async (id, userId) => ({ success: true }),
        getArchivedCategories: async (userId) => ({ success: true, data: [] }),
        toggleHideCategory: async (categoryId, userId) => ({ success: true }),
        getCategoryHistory: async (categoryId, period) => ({
          success: true,
          data: { available: 0, assigned: 0, activity: 0 }
        }),
        createCategoryGroup: async (userId, name) => ({ success: true, data: { id: Date.now() } }),
        updateCategoryGroup: async (id, userId, updates) => ({ success: true }),
        deleteCategoryGroup: async (id, userId) => ({ success: true }),
        getGroupsWithCategories: async (userId) => ({ success: true, data: [] }),
        addTransaction: async (transaction) => ({ success: true, data: { id: Date.now() } }),
        updateTransaction: async (id, updates) => ({ success: true }),
        deleteTransaction: async (id) => ({ success: true }),
        getAccountTransactions: async (accountId) => ({ success: true, data: [] }),
        getPayees: async (userId) => ({ success: true, data: [] }),
        createOrUpdatePayee: async (data) => ({ success: true, data: { id: Date.now() } }),
        getPayeesForForm: async (data) => ({ success: true, data: { paymentPayees: [], transferPayees: [], regularPayees: [] } }),
        createLinkedTransfer: async (transferData) => ({ success: true, data: {} }),
        updateLinkedTransfer: async (id, updates) => ({ success: true }),
        deleteLinkedTransfer: async (id) => ({ success: true }),
        getUserSetting: async (key, defaultValue) => ({ success: true, data: defaultValue }),
        saveUserSetting: async (key, value) => ({ success: true }),
        subscribeToEvent: (eventType, callback) => {
          console.log(`📡 MOCK: subscribeToEvent ${eventType}`);
          return () => {};
        },
        publishEvent: async (eventType, data) => ({ success: true }),
        getNetworkStatus: async () => ({ success: true, data: { isOnline: true } }),
        backupDatabase: async (password) => ({ success: false, error: 'Not available in browser' }),
        restoreDatabase: async (password) => ({ success: false, error: 'Not available in browser' }),
        ping: async () => ({ success: true, message: 'pong' }),
      };
    }

    return () => {
      window.removeEventListener('electronAPI-ready', handleReady);
    };
  }, []);
}

export default function MyApp({ Component, pageProps }) {
  useInitializeElectronAPI();

  useEffect(() => {
    window.__intentflowBootLog?.('_app mounted');
    const debugEl = document.getElementById('intentflow-boot-debug');
    if (debugEl) debugEl.remove();
  }, []);

  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
