// src/utils/accountUtils.js
/**
 * Shared utility functions for account operations
 * Use this across all account-related components to ensure consistency
 */

export const accountUtils = {
  /**
   * Load accounts for the current user
   */
  loadAccounts: async () => {
    console.log('📊 [accountUtils] Loading accounts...');
    
    try {
      // Check if electronAPI is available
      if (!window.electronAPI) {
        console.error('❌ electronAPI not available');
        return { success: false, error: 'Application API not available', data: [] };
      }

      // Get current user
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        console.error('❌ No user logged in');
        return { success: false, error: 'Please log in to view accounts', data: [] };
      }

      const userId = userResult.data.id;
      console.log('👤 User ID:', userId);

      // Get accounts
      const accountsResult = await window.electronAPI.getAccountsSummary(userId);
      
      if (accountsResult?.success) {
        console.log('✅ Accounts loaded:', accountsResult.data?.length || 0);
        return { success: true, data: accountsResult.data || [] };
      } else {
        console.error('❌ Failed to load accounts:', accountsResult?.error);
        return { success: false, error: accountsResult?.error || 'Failed to load accounts', data: [] };
      }
    } catch (error) {
      console.error('❌ Error in loadAccounts:', error);
      return { success: false, error: error.message, data: [] };
    }
  },

  /**
   * Create a new account
   */
  createAccount: async (accountData) => {
    console.log('📝 [accountUtils] Creating account:', accountData);
    
    try {
      if (!window.electronAPI) {
        return { success: false, error: 'Application API not available' };
      }

      const result = await window.electronAPI.createAccount(accountData);
      return result;
    } catch (error) {
      console.error('❌ Error creating account:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get current user
   */
  getCurrentUser: async () => {
    try {
      if (!window.electronAPI) {
        return { success: false, error: 'Application API not available' };
      }
      
      return await window.electronAPI.getCurrentUser();
    } catch (error) {
      console.error('❌ Error getting current user:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Filter accounts by type
   */
  filterByType: (accounts, types) => {
    if (!Array.isArray(accounts)) return [];
    return accounts.filter(a => types.includes(a.type));
  },

  /**
   * Format currency
   */
  formatCurrency: (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  }
};