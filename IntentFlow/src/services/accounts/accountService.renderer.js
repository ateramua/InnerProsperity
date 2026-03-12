// src/services/accounts/accountService.renderer.js
class AccountServiceRenderer {
  async getAllAccounts(userId) {
    return await window.electronAPI.getAllAccounts(userId);
  }

  async getAccountById(id, userId) {
    return await window.electronAPI.getAccountById(id, userId);
  }

  async createAccount(accountData) {
    return await window.electronAPI.createAccount(accountData);
  }

  async updateAccount(id, userId, updates) {
    return await window.electronAPI.updateAccount(id, userId, updates);
  }

  async deleteAccount(id, userId) {
    return await window.electronAPI.deleteAccount(id, userId);
  }

  async getAccountBalances(accountId, userId) {
    return await window.electronAPI.getAccountBalances(accountId, userId);
  }

  async getAccountsSummary(userId) {
    return await window.electronAPI.getAccountsSummary(userId);
  }

  async getTotalsByType(userId) {
    return await window.electronAPI.getTotalsByType(userId);
  }

  async startReconciliation(accountId, userId, statementBalance, statementDate) {
    return await window.electronAPI.startReconciliation(accountId, userId, statementBalance, statementDate);
  }

  async getCreditCardDetails(accountId, userId) {
    return await window.electronAPI.getCreditCardDetails(accountId, userId);
  }
}

// Change from 'export default' to 'module.exports'
module.exports = AccountServiceRenderer;