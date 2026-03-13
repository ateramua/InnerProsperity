// src/preload/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

console.log('🔌 Preload script loaded');

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    // ==================== USER AUTHENTICATION ====================
    createUser: (userData) => {
      console.log('📞 Preload: createUser called');
      return ipcRenderer.invoke('create-user', userData);
    },
    loginUser: (credentials) => {
      console.log('📞 Preload: loginUser called');
      return ipcRenderer.invoke('login-user', credentials);
    },
    logoutUser: () => {
      console.log('📞 Preload: logoutUser called');
      return ipcRenderer.invoke('logout-user');
    },
    getCurrentUser: () => {
      console.log('📞 Preload: getCurrentUser called');
      return ipcRenderer.invoke('get-current-user');
    },
    // ==================== REAL-TIME UPDATE METHODS ====================
    subscribeToEvent: (eventType, callback) => {
      console.log(`📞 Preload: subscribeToEvent called for ${eventType}`);
      
      // Set up listener
      const listener = (_, data) => callback(data);
      ipcRenderer.on(`update:${eventType}`, listener);
      
      // Return unsubscribe function
      return () => {
        ipcRenderer.removeListener(`update:${eventType}`, listener);
      };
    },

    publishEvent: (eventType, data) => {
      console.log(`📞 Preload: publishEvent called for ${eventType}`);
      return ipcRenderer.invoke('publish-event', eventType, data);
    },
    listUsers: () => {
      console.log('📞 Preload: listUsers called');
      return ipcRenderer.invoke('list-users');
    },
    // Check if these are already in your preload script
    // If not, add them:

    getTransactions: () => {
      console.log('📞 Preload: getTransactions called');
      return ipcRenderer.invoke('getTransactions');
    },

    addTransaction: (transaction) => {
      console.log('📞 Preload: addTransaction called', transaction);
      return ipcRenderer.invoke('addTransaction', transaction);
    },

    getCategories: (userId) => {
      console.log('📞 Preload: getCategories called');
      return ipcRenderer.invoke('getCategories', userId);
    },

    getAccounts: () => {
      console.log('📞 Preload: getAccounts called');
      return ipcRenderer.invoke('getAccounts');
    },

    // ==================== ACCOUNT SERVICE METHODS ====================
    getAllAccounts: (userId) => {
      console.log('📞 Preload: getAllAccounts called');
      return ipcRenderer.invoke('accounts:getAll', userId);
    },
    getAccountById: (id, userId) => {
      console.log('📞 Preload: getAccountById called');
      return ipcRenderer.invoke('accounts:getById', id, userId);
    },
    createAccount: (accountData) => {
      console.log('📞 Preload: createAccount called');
      return ipcRenderer.invoke('accounts:create', accountData);
    },
    updateAccount: (id, userId, updates) => {
      console.log('📞 Preload: updateAccount called');
      return ipcRenderer.invoke('accounts:update', id, userId, updates);
    },
    deleteAccount: (id, userId) => {
      console.log('📞 Preload: deleteAccount called');
      return ipcRenderer.invoke('accounts:delete', id, userId);
    },
    // Add these with your other transaction methods

    updateTransaction: (id, updates) => {
      console.log('📞 Preload: updateTransaction called', id, updates);
      return ipcRenderer.invoke('updateTransaction', id, updates);
    },

    deleteTransaction: (id) => {
      console.log('📞 Preload: deleteTransaction called', id);
      return ipcRenderer.invoke('deleteTransaction', id);
    },

    getAccountTransactions: (accountId) => {
      console.log('📞 Preload: getAccountTransactions called', accountId);
      return ipcRenderer.invoke('getAccountTransactions', accountId);
    },

    toggleTransactionCleared: (id, clearedStatus) => {
      console.log('📞 Preload: toggleTransactionCleared called', id, clearedStatus);
      return ipcRenderer.invoke('toggleTransactionCleared', id, clearedStatus);
    },
    getAccountBalances: (accountId, userId) => {
      console.log('📞 Preload: getAccountBalances called');
      return ipcRenderer.invoke('accounts:getBalances', accountId, userId);
    },
    getAccountsSummary: (userId) => {
      console.log('📞 Preload: getAccountsSummary called');
      return ipcRenderer.invoke('accounts:getSummary', userId);
    },
    getTotalsByType: (userId) => {
      console.log('📞 Preload: getTotalsByType called');
      return ipcRenderer.invoke('accounts:getTotals', userId);
    },
    startReconciliation: (accountId, userId, statementBalance, statementDate) => {
      console.log('📞 Preload: startReconciliation called');
      return ipcRenderer.invoke('accounts:startReconciliation', accountId, userId, statementBalance, statementDate);
    },
    getCreditCardDetails: (accountId, userId) => {
      console.log('📞 Preload: getCreditCardDetails called');
      return ipcRenderer.invoke('accounts:getCreditCardDetails', accountId, userId);
    },

    // ==================== CATEGORY GROUP METHODS ====================
    getCategoryGroups: (userId) => {
      console.log('📞 Preload: getCategoryGroups called');
      return ipcRenderer.invoke('categoryGroups:getAll', userId);
    },
    getGroupsWithCategories: (userId) => {
      console.log('📞 Preload: getGroupsWithCategories called');
      return ipcRenderer.invoke('categoryGroups:getWithCategories', userId);
    },
    createCategoryGroup: (userId, name, sortOrder) => {
      console.log('📞 Preload: createCategoryGroup called', { userId, name, sortOrder });
      return ipcRenderer.invoke('categoryGroups:create', userId, name, sortOrder);
    },
    updateCategoryGroup: (id, userId, updates) => {
      console.log('📞 Preload: updateCategoryGroup called', { id, userId, updates });
      return ipcRenderer.invoke('categoryGroups:update', id, userId, updates);
    },
    deleteCategoryGroup: (id, userId) => {
      console.log('📞 Preload: deleteCategoryGroup called', { id, userId });
      return ipcRenderer.invoke('categoryGroups:delete', id, userId);
    },

    // ==================== CATEGORY METHODS ====================
    createCategory: (categoryData) => {
      console.log('📞 Preload: createCategory called', categoryData);
      return ipcRenderer.invoke('createCategory', categoryData);
    },
    
    // 🔥 NEW: Update category (for assigned amounts, targets, etc.)
    updateCategory: (categoryId, updates) => {
      console.log('📞 Preload: updateCategory called', { categoryId, updates });
      return ipcRenderer.invoke('updateCategory', categoryId, updates);
    },

    deleteCategory: (categoryId) => {
      console.log('📞 Preload: deleteCategory called', categoryId);
      return ipcRenderer.invoke('deleteCategory', categoryId);
    },

    // ==================== FORECAST METHODS ====================
    generateForecast: (userId, options) => {
      console.log('📞 Preload: generateForecast called');
      return ipcRenderer.invoke('forecast:generate', userId, options);
    },
    getDailyForecast: (userId) => {
      console.log('📞 Preload: getDailyForecast called');
      return ipcRenderer.invoke('forecast:daily', userId);
    },
    getWeeklyForecast: (userId, weeks) => {
      console.log('📞 Preload: getWeeklyForecast called');
      return ipcRenderer.invoke('forecast:weekly', userId, weeks);
    },
    getYearlyForecast: (userId, years) => {
      console.log('📞 Preload: getYearlyForecast called');
      return ipcRenderer.invoke('forecast:yearly', userId, years);
    },
    getRecommendations: (userId) => {
      console.log('📞 Preload: getRecommendations called');
      return ipcRenderer.invoke('forecast:recommendations', userId);
    },
    
    // ==================== FORECAST METHODS (Legacy) ====================
    getWeeklyForecast: (userId, weeks) => {
      console.log('📞 Preload: getWeeklyForecast called');
      return ipcRenderer.invoke('getWeeklyForecast', userId, weeks);
    },
    getYearlyForecast: (userId, years) => {
      console.log('📞 Preload: getYearlyForecast called');
      return ipcRenderer.invoke('getYearlyForecast', userId, years);
    },
    getRecommendations: (userId) => {
      console.log('📞 Preload: getRecommendations called');
      return ipcRenderer.invoke('getRecommendations', userId);
    },
    
    // ==================== MONEY MAP METHODS ====================
    buildMoneyMap: (userId) => {
      console.log('📞 Preload: buildMoneyMap called');
      return ipcRenderer.invoke('buildMoneyMap', userId);
    },
    
    // ==================== PROSPERITY OPTIMIZER METHODS ====================
    optimizeProsperityMap: (userId, totalIncome) => {
      console.log('📞 Preload: optimizeProsperityMap called');
      return ipcRenderer.invoke('optimizeProsperityMap', userId, totalIncome);
    },
    refreshMoneyMap: (moneyMap, budgetData) => {
      console.log('📞 Preload: refreshMoneyMap called');
      return ipcRenderer.invoke('refreshMoneyMap', moneyMap, budgetData);
    },
    
    // ==================== SETTINGS / GROUPS / CATEGORIES ====================
    saveSettings: (settings) => {
      console.log('📞 Preload: saveSettings called');
      return ipcRenderer.invoke('save-settings', settings);
    },
    getGroupsWithCategories: (budgetId) => {
      console.log('📞 Renderer calling getGroupsWithCategories');
      return ipcRenderer.invoke('get-groups-with-categories', budgetId);
    },
    createGroup: (groupData) => {
      console.log('📞 Renderer calling createGroup');
      return ipcRenderer.invoke('create-group', groupData);
    },
    updateGroup: (groupId, name) => {
      console.log('📞 Renderer calling updateGroup');
      return ipcRenderer.invoke('update-group', { groupId, name });
    },
    deleteGroup: (groupId) => {
      console.log('📞 Renderer calling deleteGroup');
      return ipcRenderer.invoke('delete-group', groupId);
    },
    createCategory: (categoryData) => {
      console.log('📞 Renderer calling createCategory');
      return ipcRenderer.invoke('create-category', categoryData);
    },
    deleteCategory: (categoryId) => {
      console.log('📞 Renderer calling deleteCategory');
      return ipcRenderer.invoke('delete-category', categoryId);
    },

    // ==================== SoulFunds ACCOUNTS & TRANSACTIONS ====================
    getAccounts: () => ipcRenderer.invoke('getAccounts'),
    // Note: 'createAccount' is already defined above in Account Service Methods
    getTransactions: (accountId, filters) => ipcRenderer.invoke('getTransactions', accountId, filters),
    createTransaction: (data) => ipcRenderer.invoke('createTransaction', data),
    updateTransaction: (id, updates) => ipcRenderer.invoke('updateTransaction', id, updates),
    deleteTransaction: (id) => ipcRenderer.invoke('deleteTransaction', id),
    getCategories: () => ipcRenderer.invoke('getCategories'),
    reconcileAccount: (accountId, statementBalance, transactionsToClear) => {
      console.log('📞 Preload: reconcileAccount called', { accountId, statementBalance, transactionsToClear });
      return ipcRenderer.invoke('reconcileAccount', accountId, statementBalance, transactionsToClear);
    },

    // ==================== NETWORK STATUS ====================
    getNetworkStatus: () => {
      console.log('📞 Preload: getNetworkStatus called');
      return ipcRenderer.invoke('get-network-status');
    },

    // Optional: Add listener for network changes
    onNetworkChange: (callback) => {
      console.log('📞 Preload: onNetworkChange listener registered');
      const listener = (_, status) => callback(status);
      ipcRenderer.on('network-changed', listener);
      // Return a cleanup function
      return () => {
        ipcRenderer.removeListener('network-changed', listener);
      };
    },

    // ==================== UTILITY / TEST ====================
    ping: () => {
      console.log('📞 Preload: ping called');
      return ipcRenderer.invoke('ping');
    },
  });

  console.log('✅ electronAPI successfully exposed');
} catch (error) {
  console.error('❌ Failed to expose electronAPI:', error);
}