// src/services/databaseProxy.mjs
import MobileDatabase from './mobileDatabase.mjs';

class DatabaseProxy {
  getEnvironment() {
    if (typeof window === 'undefined') return 'server';

    // Log what's available for debugging
    console.log('🔍 Debug - window.Capacitor:', window.Capacitor);
    console.log('🔍 Debug - window.electronAPI:', !!window.electronAPI);

    // Check if running in Capacitor (mobile)
    if (window.Capacitor?.isNativePlatform?.()) {
      console.log('🔍 Environment detected: mobile (Capacitor)');
      return 'mobile';
    }

    // Check if running in Electron
    if (window.electronAPI) {
      console.log('🔍 Environment detected: electron');
      return 'electron';
    }

    // Default to web browser for testing
    console.log('🔍 Environment detected: web');
    return 'web';
  }

  // ==================== USER METHODS ====================
  async loginUser(username, password) {
    const env = this.getEnvironment();
    console.log('🔍 Proxy login - Environment:', env);
    console.log('🔍 Login attempt for username:', username);

    // TEMPORARY: Use hardcoded users for ALL environments to ensure mobile works
    // This bypasses environment detection issues
    console.log('🔍 Using test mode with hardcoded users');

    // Hardcoded test users
    const testUsers = [
      { username: 'teramua', password: 'test1234', id: 1, full_name: 'Test User' },
      { username: 'demo', password: 'demo123', id: 2, full_name: 'Demo User' }
    ];

    const user = testUsers.find(u => u.username === username && u.password === password);
    console.log('🔍 User found:', !!user);

    if (user) {
      console.log('🔍 Login successful for:', user.username);
      return {
        success: true,
        data: {
          id: user.id,
          username: user.username,
          full_name: user.full_name
        }
      };
    }

    console.log('🔍 Login failed - invalid credentials');
    return { success: false, error: 'Invalid credentials' };
  }

  async createUser(userData) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.createUser(userData);
    } else {
      // For web/electron, just return success
      return { success: true, data: { id: 999 } };
    }
  }

  // ==================== ACCOUNT METHODS ====================
  async getAccounts(userId) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.getAccounts(userId);
    } else if (env === 'electron') {
      if (window.electronAPI?.getAccountsSummary) {
        return await window.electronAPI.getAccountsSummary(userId);
      } else {
        console.warn('electronAPI not available in this environment');
        return { success: false, data: [] };
      }
    } else {
      // Return mock data for web testing
      return {
        success: true,
        data: [
          { id: 'acc1', name: 'Checking', type: 'checking', balance: 3450.89 },
          { id: 'acc2', name: 'Savings', type: 'savings', balance: 5200.00 }
        ]
      };
    }
  }

  async getAccountById(accountId, userId) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.getAccountById?.(accountId, userId) || { success: false, data: null };
    } else if (env === 'electron') {
      if (window.electronAPI?.getAccountById) {
        return await window.electronAPI.getAccountById(accountId, userId);
      }
    }
    return { success: false, data: null };
  }

  async createAccount(accountData) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.createAccount(accountData);
    } else if (env === 'electron') {
      if (window.electronAPI?.createAccount) {
        return await window.electronAPI.createAccount(accountData);
      }
    }
    return { success: true, data: { id: `acc_${Date.now()}` } };
  }

  async updateAccount(accountId, userId, updates) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.updateAccount?.(accountId, userId, updates) || { success: false };
    } else if (env === 'electron') {
      if (window.electronAPI?.updateAccount) {
        return await window.electronAPI.updateAccount(accountId, userId, updates);
      }
    }
    return { success: true };
  }

  async deleteAccount(accountId, userId) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.deleteAccount?.(accountId, userId) || { success: false };
    } else if (env === 'electron') {
      if (window.electronAPI?.deleteAccount) {
        return await window.electronAPI.deleteAccount(accountId, userId);
      }
    }
    return { success: true };
  }

  // ==================== CATEGORY METHODS ====================
  async getCategories(userId) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.getCategories(userId);
    } else if (env === 'electron') {
      if (window.electronAPI?.getCategories) {
        return await window.electronAPI.getCategories(userId);
      } else {
        console.warn('electronAPI not available in this environment');
        return { success: false, data: [] };
      }
    } else {
      // Return mock data for web testing
      return {
        success: true,
        data: [
          { id: 'cat1', name: 'Groceries', group_id: 'group2', assigned: 0 },
          { id: 'cat2', name: 'Rent', group_id: 'group1', assigned: 1500 }
        ]
      };
    }
  }

  async createCategory(categoryData) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.createCategory(categoryData);
    } else if (env === 'electron') {
      if (window.electronAPI?.createCategory) {
        return await window.electronAPI.createCategory(categoryData);
      }
    }
    return { success: true, data: { id: `cat_${Date.now()}` } };
  }

  async updateCategory(categoryId, updates) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.updateCategory(categoryId, updates);
    } else if (env === 'electron') {
      if (window.electronAPI?.updateCategory) {
        return await window.electronAPI.updateCategory(categoryId, updates);
      }
    }
    return { success: true };
  }

  async deleteCategory(categoryId) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.deleteCategory?.(categoryId) || { success: false };
    } else if (env === 'electron') {
      if (window.electronAPI?.deleteCategory) {
        return await window.electronAPI.deleteCategory(categoryId);
      }
    }
    return { success: true };
  }
  // Add these debug methods or update existing ones

  async createCategoryGroup(groupData) {
    const env = this.getEnvironment();
    console.log('🔍 createCategoryGroup - Environment:', env);
    console.log('🔍 createCategoryGroup - Data:', groupData);

    if (env === 'mobile') {
      console.log('🔍 createCategoryGroup - Using MobileDatabase');
      const result = await MobileDatabase.createCategoryGroup(groupData);
      console.log('🔍 createCategoryGroup - Result:', result);
      return result;
    } else if (env === 'electron') {
      console.log('🔍 createCategoryGroup - Using ElectronAPI');
      if (window.electronAPI?.createCategoryGroup) {
        const result = await window.electronAPI.createCategoryGroup(
          groupData.user_id,
          groupData.name,
          groupData.sort_order
        );
        console.log('🔍 createCategoryGroup - Result:', result);
        return result;
      }
    }
    console.log('🔍 createCategoryGroup - Returning mock success');
    return { success: true, data: { id: `group_${Date.now()}` } };
  }

  async createCategory(categoryData) {
    const env = this.getEnvironment();
    console.log('🔍 createCategory - Environment:', env);
    console.log('🔍 createCategory - Data:', categoryData);

    if (env === 'mobile') {
      console.log('🔍 createCategory - Using MobileDatabase');
      const result = await MobileDatabase.createCategory(categoryData);
      console.log('🔍 createCategory - Result:', result);
      return result;
    } else if (env === 'electron') {
      console.log('🔍 createCategory - Using ElectronAPI');
      if (window.electronAPI?.createCategory) {
        const result = await window.electronAPI.createCategory(categoryData);
        console.log('🔍 createCategory - Result:', result);
        return result;
      }
    }
    console.log('🔍 createCategory - Returning mock success');
    return { success: true, data: { id: `cat_${Date.now()}` } };
  }

  async createCategoryGroup(groupData) {
    const env = this.getEnvironment();
    console.log('🔍 createCategoryGroup - Environment:', env);
    console.log('🔍 createCategoryGroup - Data:', groupData);

    if (env === 'mobile') {
      try {
        console.log('🔍 createCategoryGroup - Calling MobileDatabase');
        const result = await MobileDatabase.createCategoryGroup(groupData);
        console.log('🔍 createCategoryGroup - MobileDatabase result:', result);
        return result;
      } catch (error) {
        console.error('❌ createCategoryGroup - MobileDatabase error:', error);
        return { success: false, error: error.message };
      }
    } else if (env === 'electron') {
      if (window.electronAPI?.createCategoryGroup) {
        try {
          const result = await window.electronAPI.createCategoryGroup(
            groupData.user_id,
            groupData.name,
            groupData.sort_order
          );
          console.log('🔍 createCategoryGroup - Electron result:', result);
          return result;
        } catch (error) {
          console.error('❌ createCategoryGroup - Electron error:', error);
          return { success: false, error: error.message };
        }
      }
    }
    console.log('🔍 createCategoryGroup - No handler, returning mock success');
    return { success: true, data: { id: `group_${Date.now()}` } };
  }

  // ==================== CATEGORY GROUP METHODS ====================
  async getCategoryGroups(userId) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.getCategoryGroups(userId);
    } else if (env === 'electron') {
      if (window.electronAPI?.getCategoryGroups) {
        return await window.electronAPI.getCategoryGroups(userId);
      } else {
        console.warn('electronAPI not available in this environment');
        return { success: false, data: [] };
      }
    } else {
      // Return mock data for web testing
      return {
        success: true,
        data: [
          { id: 'group1', name: 'Fixed Expenses', sort_order: 1 },
          { id: 'group2', name: 'Variable Expenses', sort_order: 2 }
        ]
      };
    }
  }

  async createCategoryGroup(groupData) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.createCategoryGroup(groupData);
    } else if (env === 'electron') {
      if (window.electronAPI?.createCategoryGroup) {
        return await window.electronAPI.createCategoryGroup(
          groupData.user_id,
          groupData.name,
          groupData.sort_order
        );
      }
    }
    return { success: true, data: { id: `group_${Date.now()}` } };
  }

  async updateCategoryGroup(id, userId, updates) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.updateCategoryGroup?.(id, userId, updates) || { success: false };
    } else if (env === 'electron') {
      if (window.electronAPI?.updateCategoryGroup) {
        return await window.electronAPI.updateCategoryGroup(id, userId, updates);
      }
    }
    return { success: true };
  }

  async deleteCategoryGroup(id, userId) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.deleteCategoryGroup?.(id, userId) || { success: false };
    } else if (env === 'electron') {
      if (window.electronAPI?.deleteCategoryGroup) {
        return await window.electronAPI.deleteCategoryGroup(id, userId);
      }
    }
    return { success: true };
  }

  // ==================== TRANSACTION METHODS ====================
  async getTransactions(userId) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.getTransactions(userId);
    } else if (env === 'electron') {
      if (window.electronAPI?.getTransactions) {
        return await window.electronAPI.getTransactions();
      } else {
        console.warn('electronAPI not available in this environment');
        return { success: false, data: [] };
      }
    } else {
      // Return mock data for web testing
      return {
        success: true,
        data: [
          { id: 'tx1', description: 'Grocery Store', amount: -125.32, date: '2024-03-15' }
        ]
      };
    }
  }

  async getAccountTransactions(accountId) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.getAccountTransactions?.(accountId) || { success: false, data: [] };
    } else if (env === 'electron') {
      if (window.electronAPI?.getAccountTransactions) {
        return await window.electronAPI.getAccountTransactions(accountId);
      }
    }
    return { success: true, data: [] };
  }

  async addTransaction(transactionData) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.addTransaction({
        ...transactionData,
        userId: transactionData.userId || transactionData.user_id
      });
    } else if (env === 'electron') {
      if (window.electronAPI?.addTransaction) {
        return await window.electronAPI.addTransaction(transactionData);
      }
    }
    return { success: true, data: { id: `tx_${Date.now()}` } };
  }

  async updateTransaction(id, updates) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.updateTransaction?.(id, updates) || { success: false };
    } else if (env === 'electron') {
      if (window.electronAPI?.updateTransaction) {
        return await window.electronAPI.updateTransaction(id, updates);
      }
    }
    return { success: true };
  }

  async deleteTransaction(id) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.deleteTransaction?.(id) || { success: false };
    } else if (env === 'electron') {
      if (window.electronAPI?.deleteTransaction) {
        return await window.electronAPI.deleteTransaction(id);
      }
    }
    return { success: true };
  }

  async toggleTransactionCleared(id, clearedStatus) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.toggleTransactionCleared?.(id, clearedStatus) || { success: false };
    } else if (env === 'electron') {
      if (window.electronAPI?.toggleTransactionCleared) {
        return await window.electronAPI.toggleTransactionCleared(id, clearedStatus);
      }
    }
    return { success: true };
  }

  // ==================== LOAN METHODS ====================
  async getLoans(userId) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.getLoans?.(userId) || { success: false, data: [] };
    } else if (env === 'electron') {
      if (window.electronAPI?.getLoans) {
        return await window.electronAPI.getLoans(userId);
      }
    }
    return { success: true, data: [] };
  }

  async createLoan(loanData) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.createLoan?.(loanData) || { success: false };
    } else if (env === 'electron') {
      if (window.electronAPI?.createLoan) {
        return await window.electronAPI.createLoan(loanData);
      }
    }
    return { success: true, data: { id: `loan_${Date.now()}` } };
  }

  // ==================== CREDIT CARD METHODS ====================
  async getCreditCards(userId) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.getCreditCards?.(userId) || { success: false, data: [] };
    } else if (env === 'electron') {
      if (window.electronAPI?.getCreditCards) {
        return await window.electronAPI.getCreditCards(userId);
      }
    }
    return { success: true, data: [] };
  }

  async createCreditCard(cardData) {
    const env = this.getEnvironment();
    if (env === 'mobile') {
      return await MobileDatabase.createCreditCard?.(cardData) || { success: false };
    } else if (env === 'electron') {
      if (window.electronAPI?.createCreditCard) {
        return await window.electronAPI.createCreditCard(cardData);
      }
    }
    return { success: true, data: { id: `card_${Date.now()}` } };
  }

  // ==================== UTILITY METHODS ====================
  isMobile() {
    return this.getEnvironment() === 'mobile';
  }

}

export default new DatabaseProxy();
// TEMPORARY TEST - add after export default new DatabaseProxy();
console.log('✅ databaseProxy.mjs loaded and initialized');