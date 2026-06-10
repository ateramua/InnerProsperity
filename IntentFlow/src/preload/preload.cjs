// src/preload/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

console.log('🔌 Preload script loaded');

/** Mutable BDD hooks — contextBridge exports cannot be patched from page.evaluate. */
const bddImportHooks = {
  pickResult: null,
  importContent: null,
};

ipcRenderer.on('accounts-updated', (_event, detail) => {
  window.dispatchEvent(new CustomEvent('accounts-updated', { detail }));
});

try {
  contextBridge.exposeInMainWorld('__intentflowBdd', {
    setTransactionImportPick: (result) => {
      bddImportHooks.pickResult = result;
    },
    clearTransactionImportPick: () => {
      bddImportHooks.pickResult = null;
    },
    setTransactionImportContent: (content) => {
      bddImportHooks.importContent = content == null ? null : String(content);
    },
    clearTransactionImportContent: () => {
      bddImportHooks.importContent = null;
    },
    clearTransactionImportHooks: () => {
      bddImportHooks.pickResult = null;
      bddImportHooks.importContent = null;
    },
  });

  contextBridge.exposeInMainWorld('intentflow', {
    isHygieneRunning: async () => {
      const state = await ipcRenderer.invoke('db:getWriteState');
      return Boolean(state?.success && state?.data?.exclusiveWindow);
    },
  });

  contextBridge.exposeInMainWorld('electronAPI', {

    // ==================== PLAID ====================
    getPlaidConfigStatus: () => ipcRenderer.invoke('plaid-get-config-status'),
    createLinkToken: () => ipcRenderer.invoke('plaid-create-link-token'),
    exchangePublicToken: (publicToken) => ipcRenderer.invoke('plaid-exchange-public-token', publicToken),
    getLinkedItems: () => ipcRenderer.invoke('plaid-get-linked-items'),
    getPlaidItemAccounts: (itemId) => ipcRenderer.invoke('plaid-get-item-accounts', itemId),
    syncItem: (itemId) => ipcRenderer.invoke('plaid-sync-item', itemId),
    syncTransactions: (itemId, startDate = null, endDate = null) =>
      ipcRenderer.invoke('plaid-sync-transactions', itemId, startDate, endDate),
    removeItem: (itemId, options) => ipcRenderer.invoke('plaid-remove-item', itemId, options),
    getPlaidSyncHistory: (limit) => ipcRenderer.invoke('plaid-get-sync-history', limit),
    getAccountPlaidLinkStatus: (accountId) =>
      ipcRenderer.invoke('plaid-get-account-link-status', accountId),
    syncPlaidAccount: (accountId) => ipcRenderer.invoke('plaid-sync-account', accountId),
    unlinkPlaidAccount: (accountId) => ipcRenderer.invoke('plaid-unlink-account', accountId),
    saveCategoryMapping: (plaidCategory, categoryId) =>
      ipcRenderer.invoke('plaid-save-category-mapping', plaidCategory, categoryId),
    reapplyAllPlaidCategoryMappings: () =>
      ipcRenderer.invoke('plaid-reapply-all-category-mappings'),
    getPlaidCategoryMappings: () => ipcRenderer.invoke('plaid-get-category-mappings'),
    mergePlaidAccount: (plaidAccountId, targetAccountId) =>
      ipcRenderer.invoke('plaid-merge-account', plaidAccountId, targetAccountId),
    getAccountMergePreview: (plaidAccountId, targetAccountId) =>
      ipcRenderer.invoke('plaid-get-merge-preview', plaidAccountId, targetAccountId),
    executeAccountMerge: (plaidAccountId, targetAccountId) =>
      ipcRenderer.invoke('plaid-execute-merge', plaidAccountId, targetAccountId),
    keepPlaidAccountSeparate: (plaidAccountId) =>
      ipcRenderer.invoke('plaid-keep-account-separate', plaidAccountId),
    rollbackAccountMerge: (sessionId) =>
      ipcRenderer.invoke('plaid-rollback-merge', sessionId),
    linkAccountToPlaid: (plaidAccountId, targetAccountId) =>
      ipcRenderer.invoke('plaid-link-account-to-plaid', plaidAccountId, targetAccountId),
    checkDuplicateAccount: (payload) =>
      ipcRenderer.invoke('plaid-check-duplicate-account', payload),
    onAccountsUpdated: (callback) => {
      const listener = (_event, detail) => callback(detail);
      ipcRenderer.on('accounts-updated', listener);
      return () => ipcRenderer.removeListener('accounts-updated', listener);
    },
    onPlaidOAuthRedirect: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('plaid-oauth-redirect', listener);
      return () => ipcRenderer.removeListener('plaid-oauth-redirect', listener);
    },

    // ==================== AUTH ====================
    createUser: (userData) => ipcRenderer.invoke('create-user', userData),
    loginUser: (credentials) => ipcRenderer.invoke('login-user', credentials),
    logoutUser: () => ipcRenderer.invoke('logout-user'),
    getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
    createUpdateLinkToken: (itemId) => ipcRenderer.invoke('plaid-create-update-link-token', itemId),

    listUsers: () => ipcRenderer.invoke('list-users'),

    // ==================== PAYEES ====================
    getPayees: (userId) => ipcRenderer.invoke('get-payees', userId),
    createOrUpdatePayee: (data) => ipcRenderer.invoke('create-or-update-payee', data),
    getPayeesForForm: (data) => ipcRenderer.invoke('get-payees-for-form', data),
    createLinkedTransfer: (transferData) => ipcRenderer.invoke('create-linked-transfer', transferData),
    updateLinkedTransfer: (transactionId, updates) => ipcRenderer.invoke('update-linked-transfer', transactionId, updates),
    deleteLinkedTransfer: (transactionId) => ipcRenderer.invoke('delete-linked-transfer', transactionId),

    // ==================== TRANSACTIONS ====================
    getTransactions: (filters) =>
      ipcRenderer.invoke('getTransactions', filters),

    addTransaction: (transaction) =>
      ipcRenderer.invoke('addTransaction', transaction),
    getAutoSyncSetting: () => ipcRenderer.invoke('get-auto-sync-setting'),
    setAutoSyncSetting: (enabled) => ipcRenderer.invoke('set-auto-sync-setting', enabled),

    createTransaction: (data) =>
      ipcRenderer.invoke('createTransaction', data),

    // Add these to your electronAPI object
    debugTestDatabaseWrite: () => ipcRenderer.invoke('debug:test-database-write'),
    debugGetDatabaseInfo: () => ipcRenderer.invoke('debug:get-database-info'),
    debugTestGroupDelete: (groupId, userId) => ipcRenderer.invoke('debug:test-group-delete', groupId, userId),
    updateTransaction: (id, updates) =>
      ipcRenderer.invoke('updateTransaction', id, updates),

    deleteTransaction: (id) =>
      ipcRenderer.invoke('deleteTransaction', id),

    bulkDeleteTransactions: (ids) =>
      ipcRenderer.invoke('transactions:bulkDelete', ids),

    bulkUpdateTransactions: (ids, updates) =>
      ipcRenderer.invoke('transactions:bulkUpdate', { ids, updates }),

    getUncategorizedSummary: () =>
      ipcRenderer.invoke('transactions:getUncategorizedSummary'),

    pairTransferTransactions: () => ipcRenderer.invoke('transactions:pairTransfers'),

    getCategoryMlModelStatus: () => ipcRenderer.invoke('transactions:getMlModelStatus'),

    retrainCategoryMl: () => ipcRenderer.invoke('transactions:retrainCategoryMl'),

    getTransactionMlSuggestion: (transactionId) =>
      ipcRenderer.invoke('transactions:getMlSuggestion', transactionId),

    getTransactionSplits: (transactionId) =>
      ipcRenderer.invoke('transactions:getSplits', transactionId),

    setTransactionSplits: (transactionId, splits) =>
      ipcRenderer.invoke('transactions:setSplits', { transactionId, splits }),

    clearTransactionSplits: (transactionId, categoryId = null) =>
      ipcRenderer.invoke('transactions:clearSplits', { transactionId, categoryId }),

    getAccountTransactions: (accountId) =>
      ipcRenderer.invoke('getAccountTransactions', accountId),

    pickTransactionImportFile: () => {
      if (bddImportHooks.pickResult) {
        return Promise.resolve(bddImportHooks.pickResult);
      }
      return ipcRenderer.invoke('transactions:pickImportFile');
    },
    previewTransactionImport: (payload) => {
      const merged =
        bddImportHooks.importContent != null
          ? { ...payload, content: bddImportHooks.importContent }
          : payload;
      return ipcRenderer.invoke('transactions:previewImport', merged);
    },
    executeTransactionImport: (payload) => {
      const merged =
        bddImportHooks.importContent != null
          ? { ...payload, content: bddImportHooks.importContent }
          : payload;
      return ipcRenderer.invoke('transactions:executeImport', merged);
    },
    getImportCategoryMappings: (institutionKey) =>
      ipcRenderer.invoke('import-get-category-mappings', { institutionKey: institutionKey || '' }),
    listImportCategoryMappings: () => ipcRenderer.invoke('import-list-category-mappings'),
    deleteImportCategoryMapping: (institutionKey, bankCategory) =>
      ipcRenderer.invoke('import-delete-category-mapping', { institutionKey, bankCategory }),
    saveImportCategoryMappings: (mappings, institutionKey) =>
      ipcRenderer.invoke('import-save-category-mappings', {
        mappings,
        institutionKey: institutionKey || '',
      }),

    toggleTransactionCleared: (id, clearedStatus) =>
      ipcRenderer.invoke('toggleTransactionCleared', id, clearedStatus),

    reconcileAccount: (accountId, statementBalance, transactionsToClear) =>
      ipcRenderer.invoke('reconcileAccount', accountId, statementBalance, transactionsToClear),

    // ==================== ACCOUNTS ====================
    getAccounts: () => ipcRenderer.invoke('getAccounts'),
    getAllAccounts: (userId) => ipcRenderer.invoke('accounts:getAll', userId),
    getAccountById: (id, userId) => ipcRenderer.invoke('accounts:getById', id, userId),
    createAccount: (accountData) => ipcRenderer.invoke('accounts:create', accountData),
    updateAccount: (id, userId, updates) =>
      ipcRenderer.invoke('accounts:update', id, userId, updates),
    deleteAccount: (id, userId, opts) =>
      ipcRenderer.invoke('accounts:delete', id, userId, opts),
    applyManualBalanceAdjustment: (payload) =>
      ipcRenderer.invoke('accounts:applyManualAdjustment', payload),
    ensureCreditCardPaymentCategories: (userId) =>
      ipcRenderer.invoke('accounts:ensureCreditCardPaymentCategories', userId),
    permanentlyDeleteCreditAccount: (id, userId) =>
      ipcRenderer.invoke('accounts:permanentDeleteCredit', id, userId),
    permanentlyDeleteLoanAccount: (id, userId) =>
      ipcRenderer.invoke('accounts:permanentDeleteLoan', id, userId),

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
    getCategories: (userId, monthKey) =>
      ipcRenderer.invoke('getCategories', userId, monthKey),

    getBudgetMonthSnapshot: (userId, monthKey) =>
      ipcRenderer.invoke('budget:getMonthSnapshot', userId, monthKey),

    getCategoryActivityTransactionIds: (userId, categoryId, monthKey) =>
      ipcRenderer.invoke('budget:getCategoryActivityTransactionIds', userId, categoryId, monthKey),

    getBudgetTimelineMonths: (userId) =>
      ipcRenderer.invoke('budget:listTimelineMonths', userId),

    getBudgetGlobalSummary: (userId) =>
      ipcRenderer.invoke('budget:getGlobalSummary', userId),

    getBudgetAssignmentAudit: (userId, opts) =>
      ipcRenderer.invoke('budget:getAssignmentAudit', userId, opts),

    getBudgetUnderfundedSummary: (userId, monthKey) =>
      ipcRenderer.invoke('budget:getUnderfundedSummary', userId, monthKey),

    bulkAssignMonthBudget: (userId, monthKey, assignments, opts) =>
      ipcRenderer.invoke('budget:bulkAssignMonth', userId, monthKey, assignments, opts),

    fundUnderfundedMonthBudget: (userId, monthKey, opts) =>
      ipcRenderer.invoke('budget:fundUnderfundedMonth', userId, monthKey, opts),

    repairBudgetAssignments: (userId, monthKey, opts) =>
      ipcRenderer.invoke('budget:repairAssignments', userId, monthKey, opts),

    consolidateBudgetAssignments: (userId, monthKey, opts) =>
      ipcRenderer.invoke('budget:consolidateAssignments', userId, monthKey, opts),

    resetBudgetEnvelopes: (userId, monthKey) =>
      ipcRenderer.invoke('budget:resetEnvelopes', userId, monthKey),

    setReadyToAssignPool: (userId, targetBalance) =>
      ipcRenderer.invoke('budget:setReadyToAssignPool', userId, targetBalance),

    reconcileBudgetPoolEnvelope: (userId) =>
      ipcRenderer.invoke('budget:reconcilePoolEnvelope', userId),

    getBudgetIntegrityState: (userId, monthKey) =>
      ipcRenderer.invoke('budget:getIntegrityState', userId, monthKey),

    scopeActiveAccountsExcept: (userId, keepAccountNames) =>
      ipcRenderer.invoke('budget:scopeActiveAccounts', userId, keepAccountNames),

    getDbWriteState: () => ipcRenderer.invoke('db:getWriteState'),
    waitForDbIdle: (opts) => ipcRenderer.invoke('db:waitForIdle', opts || {}),
    beginExclusiveDbWriteWindow: (owner) =>
      ipcRenderer.invoke('db:beginExclusiveWindow', owner || 'exclusive'),
    endExclusiveDbWriteWindow: (owner) =>
      ipcRenderer.invoke('db:endExclusiveWindow', owner || 'exclusive'),

    softDeleteMonthTransactions: (payload) =>
      ipcRenderer.invoke('harness:softDeleteMonthTransactions', payload || {}),

    unassignMonthBudget: (userId, monthKey) =>
      ipcRenderer.invoke('budget:unassignMonth', userId, monthKey),

    unassignCategoryBudget: (userId, categoryId, monthKey) =>
      ipcRenderer.invoke('budget:unassignCategory', userId, categoryId, monthKey),

    exportProsperityTable: (payload) =>
      ipcRenderer.invoke('budget:exportProsperityTable', payload),

    pickProsperityImportFile: () =>
      ipcRenderer.invoke('budget:pickProsperityImportFile'),

    previewProsperityImport: (payload) =>
      ipcRenderer.invoke('budget:previewProsperityImport', payload),

    applyProsperityImport: (payload) =>
      ipcRenderer.invoke('budget:applyProsperityImport', payload),

    createCategory: (categoryData) =>
      ipcRenderer.invoke('createCategory', categoryData),

    updateCategory: (categoryId, updates) =>
      ipcRenderer.invoke('updateCategory', categoryId, updates),

    deleteCategory: (categoryId) =>
      ipcRenderer.invoke('deleteCategory', categoryId),

    // ==================== CATEGORY HISTORY ====================
    getCategoryHistory: (categoryId, period) =>
      ipcRenderer.invoke('getCategoryHistory', categoryId, period),

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

    // ==================== CATEGORY HIDE/ARCHIVE ====================
    toggleHideCategory: (categoryId, userId) =>
      ipcRenderer.invoke('category:toggleHide', categoryId, userId),

    archiveCategory: (categoryId, userId, archiveHints) =>
      ipcRenderer.invoke('category:archive', categoryId, userId, archiveHints),

    restoreCategory: (categoryId, userId, restoreHints) =>
      ipcRenderer.invoke('category:restore', categoryId, userId, restoreHints),

    getArchivedCategories: (userId) =>
      ipcRenderer.invoke('category:getArchived', userId),

    // ==================== FORECAST ====================
    generateForecast: (userId, options) =>
      ipcRenderer.invoke('forecast:generate', userId, options),

    getDailyForecast: (userId) =>
      ipcRenderer.invoke('forecast:daily', userId),

    getWeeklyForecast: (userId, weeks) =>
      ipcRenderer.invoke('forecast:weekly', userId, weeks),

    // Scheduled transactions
    getScheduledTransactions: (accountId) => ipcRenderer.invoke('scheduled-transactions:get', accountId),
    addScheduledTransaction: (data) => ipcRenderer.invoke('scheduled-transactions:add', data),
    postScheduledTransaction: (id) => ipcRenderer.invoke('scheduled-transactions:post', id),
    deleteScheduledTransaction: (id) => ipcRenderer.invoke('scheduled-transactions:delete', id),

    getYearlyForecast: (userId, years) =>
      ipcRenderer.invoke('forecast:yearly', userId, years),

    getRecommendations: (userId) =>
      ipcRenderer.invoke('forecast:recommendations', userId),

    createForecastShare: (payload) =>
      ipcRenderer.invoke('cash-forecast:share:create', payload),

    getForecastShare: (shareId) =>
      ipcRenderer.invoke('cash-forecast:share:get', shareId),

    getForecastRecurringPrefs: () =>
      ipcRenderer.invoke('cash-forecast:recurring-prefs:get'),

    setForecastRecurringPref: (recurringId, status, override) =>
      ipcRenderer.invoke('cash-forecast:recurring-prefs:set', recurringId, status, override),

    listCashForecastScheduled: () =>
      ipcRenderer.invoke('cash-forecast:scheduled:list'),

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

    saveUserSetting: (key, value) =>
      ipcRenderer.invoke('save-user-setting', key, value),

    getUserSetting: (key, defaultValue) =>
      ipcRenderer.invoke('get-user-setting', key, defaultValue),

    backupDatabase: (password, options) =>
      ipcRenderer.invoke('backup-database', password, options),

    restoreDatabase: (password, mode = 'in-place') =>
      ipcRenderer.invoke('restore-database', password, mode),

    getBackupHistory: () =>
      ipcRenderer.invoke('backup-get-history'),

    compareBackupVersions: (firstVersionId, secondVersionId) =>
      ipcRenderer.invoke('backup-compare-versions', firstVersionId, secondVersionId),

    simulateRestore: (password, backupVersionId) =>
      ipcRenderer.invoke('backup-simulate-restore', password, backupVersionId),

    queueBackupOperation: (type, payload) =>
      ipcRenderer.invoke('backup-queue-operation', type, payload),

    getBackupQueue: () =>
      ipcRenderer.invoke('backup-get-queue'),

    processBackupQueue: (password) =>
      ipcRenderer.invoke('backup-process-queue', password),

    rewindBackupVersion: (password, versionId) =>
      ipcRenderer.invoke('backup-rewind-version', password, versionId),

    generateRecoveryKit: () =>
      ipcRenderer.invoke('backup-generate-recovery-kit'),

    getRecoveryKitStatus: () =>
      ipcRenderer.invoke('backup-get-recovery-kit-status'),

    openExternal: (url) =>
      ipcRenderer.invoke('open-external', url),

    // ==================== DEBUG ====================
    debugDbPath: () =>
      ipcRenderer.invoke('debug-db-path'),

    debugCategorySchema: () =>
      ipcRenderer.invoke('debug-category-schema'),

    debugAccountCreation: (accountData) =>
      ipcRenderer.invoke('debug-account-creation', accountData),

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
      ipcRenderer.invoke('subscribe-to-event', eventType).catch((error) => {
        console.warn(`⚠️ subscribe-to-event IPC failed for ${eventType}:`, error);
      });
      ipcRenderer.on(`update:${eventType}`, listener);
      return () => {
        ipcRenderer.removeListener(`update:${eventType}`, listener);
      };
    },

    publishEvent: (eventType, data) =>
      ipcRenderer.invoke('publish-event', eventType, data),

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

    // ==================== WINDOW (automation / E2E) ====================
    maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
    isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    quitApp: () => ipcRenderer.invoke('app:quit'),
  });

  console.log('✅ electronAPI successfully exposed');
  
  // Signal that real electronAPI is ready
  window.dispatchEvent(new Event('electronAPI-ready'));
} catch (error) {
  console.error('❌ Failed to expose electronAPI:', error);
}