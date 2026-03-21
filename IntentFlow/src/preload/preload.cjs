// src/preload/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

console.log('🔌 Preload script loaded');

try {
  contextBridge.exposeInMainWorld('electronAPI', {

    // ==================== PLAID ====================
    createLinkToken: () => ipcRenderer.invoke('plaid-create-link-token'),
    exchangePublicToken: (publicToken) => ipcRenderer.invoke('plaid-exchange-public-token', publicToken),
    getLinkedItems: () => ipcRenderer.invoke('plaid-get-linked-items'),
    syncItem: (itemId) => ipcRenderer.invoke('plaid-sync-item', itemId),
    syncTransactions: (itemId, startDate = null, endDate = null) =>
      ipcRenderer.invoke('plaid-sync-transactions', itemId, startDate, endDate),
    removeItem: (itemId) => ipcRenderer.invoke('plaid-remove-item', itemId),
    saveCategoryMapping: (plaidCategory, categoryId) =>
      ipcRenderer.invoke('plaid-save-category-mapping', plaidCategory, categoryId),

    // ==================== AUTH ====================
    createUser: (userData) => ipcRenderer.invoke('create-user', userData),
    loginUser: (credentials) => ipcRenderer.invoke('login-user', credentials),
    logoutUser: () => ipcRenderer.invoke('logout-user'),
    getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
    createUpdateLinkToken: (itemId) => ipcRenderer.invoke('plaid-create-update-link-token', itemId),

    listUsers: () => ipcRenderer.invoke('list-users'),

    // ==================== TRANSACTIONS ====================
    getTransactions: (accountId, filters) =>
      ipcRenderer.invoke('getTransactions', accountId, filters), // ⚠️ No handler in main process – remove if not used

    addTransaction: (transaction) =>
      ipcRenderer.invoke('addTransaction', transaction),
    getAutoSyncSetting: () => ipcRenderer.invoke('get-auto-sync-setting'),
setAutoSyncSetting: (enabled) => ipcRenderer.invoke('set-auto-sync-setting', enabled),

    createTransaction: (data) =>
      ipcRenderer.invoke('createTransaction', data), // ⚠️ No handler in main process – remove if not used

    updateTransaction: (id, updates) =>
      ipcRenderer.invoke('updateTransaction', id, updates),

    deleteTransaction: (id) =>
      ipcRenderer.invoke('deleteTransaction', id),

    getAccountTransactions: (accountId) =>
      ipcRenderer.invoke('getAccountTransactions', accountId),

    toggleTransactionCleared: (id, clearedStatus) =>
      ipcRenderer.invoke('toggleTransactionCleared', id, clearedStatus),

    reconcileAccount: (accountId, statementBalance, transactionsToClear) =>
      ipcRenderer.invoke('reconcileAccount', accountId, statementBalance, transactionsToClear),
    createUpdateLinkToken: (itemId) => ipcRenderer.invoke('plaid-create-update-link-token', itemId),

    // ==================== ACCOUNTS ====================
    getAccounts: () => ipcRenderer.invoke('getAccounts'),
    getAllAccounts: (userId) => ipcRenderer.invoke('accounts:getAll', userId),
    getAccountById: (id, userId) => ipcRenderer.invoke('accounts:getById', id, userId),
    createAccount: (accountData) => ipcRenderer.invoke('accounts:create', accountData),
    updateAccount: (id, userId, updates) =>
      ipcRenderer.invoke('accounts:update', id, userId, updates),
    deleteAccount: (id, userId) =>
      ipcRenderer.invoke('accounts:delete', id, userId),

    getAccountBalances: (accountId, userId) =>
      ipcRenderer.invoke('accounts:getBalances', accountId, userId),

    getAccountsSummary: (userId) =>
      ipcRenderer.invoke('accounts:getSummary', userId),

    getTotalsByType: (userId) =>
      ipcRenderer.invoke('accounts:getTotals', userId),

    startReconciliation: (accountId, userId, statementBalance, statementDate) =>
      ipcRenderer.invoke(
        'accounts:startReconciliation',
        accountId,
        userId,
        statementBalance,
        statementDate
      ),

    getCreditCardDetails: (accountId, userId) =>
      ipcRenderer.invoke('accounts:getCreditCardDetails', accountId, userId),

    // ==================== CATEGORIES ====================
    getCategories: (userId) =>
      ipcRenderer.invoke('getCategories', userId),

    createCategory: (categoryData) =>
      ipcRenderer.invoke('createCategory', categoryData),

    updateCategory: (categoryId, updates) =>
      ipcRenderer.invoke('updateCategory', categoryId, updates),

    deleteCategory: (categoryId) =>
      ipcRenderer.invoke('deleteCategory', categoryId),

    // ==================== CATEGORY GROUPS ====================
    getCategoryGroups: (userId) =>
      ipcRenderer.invoke('categoryGroups:getAll', userId),

    getGroupsWithCategories: (userId) =>
      ipcRenderer.invoke('categoryGroups:getWithCategories', userId),

    createCategoryGroup: (userId, name, sortOrder) =>
      ipcRenderer.invoke('categoryGroups:create', userId, name, sortOrder),

    updateCategoryGroup: (id, userId, updates) =>
      ipcRenderer.invoke('categoryGroups:update', id, userId, updates),

    deleteCategoryGroup: (id, userId) =>
      ipcRenderer.invoke('categoryGroups:delete', id, userId),

    // ==================== FORECAST ====================
    generateForecast: (userId, options) =>
      ipcRenderer.invoke('forecast:generate', userId, options),

    getDailyForecast: (userId) =>
      ipcRenderer.invoke('forecast:daily', userId),

    getWeeklyForecast: (userId, weeks) =>
      ipcRenderer.invoke('forecast:weekly', userId, weeks),

    getYearlyForecast: (userId, years) =>
      ipcRenderer.invoke('forecast:yearly', userId, years),

    getRecommendations: (userId) =>
      ipcRenderer.invoke('forecast:recommendations', userId),

    // ==================== MONEY MAP ====================
    buildMoneyMap: (userId) =>
      ipcRenderer.invoke('buildMoneyMap', userId),

    optimizeProsperityMap: (userId, totalIncome) =>
      ipcRenderer.invoke('optimizeProsperityMap', userId, totalIncome),

    refreshMoneyMap: (moneyMap, budgetData) =>
      ipcRenderer.invoke('refreshMoneyMap', moneyMap, budgetData),

    // ==================== SETTINGS ====================
    saveSettings: (settings) =>
      ipcRenderer.invoke('save-settings', settings),

    // ==================== NAVIGATION ====================
    send: (channel, data) => {
      const validChannels = ['navigation-changed', 'navigate-to'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },

    // ==================== EVENTS ====================
    subscribeToEvent: (eventType, callback) => {
      const listener = (_, data) => callback(data);
      ipcRenderer.on(`update:${eventType}`, listener);
      return () => ipcRenderer.removeListener(`update:${eventType}`, listener);
    },

    publishEvent: (eventType, data) =>
      ipcRenderer.invoke('publish-event', eventType, data), // ⚠️ No handler in main process – remove if not used

    // ==================== NETWORK ====================
    getNetworkStatus: () =>
      ipcRenderer.invoke('get-network-status'),

    onNetworkChange: (callback) => {
      const listener = (_, status) => callback(status);
      ipcRenderer.on('network-changed', listener);
      return () => ipcRenderer.removeListener('network-changed', listener);
    }, // ⚠️ No event is emitted from main process – remove if not used

    // ==================== UTIL ====================
    ping: () => ipcRenderer.invoke('ping'),
  });

  console.log('✅ electronAPI successfully exposed');
} catch (error) {
  console.error('❌ Failed to expose electronAPI:', error);
}