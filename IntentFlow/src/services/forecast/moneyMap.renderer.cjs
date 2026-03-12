// src/services/forecast/moneyMap.renderer.cjs
class MoneyMapRenderer {
  async buildMoneyMap(userId) {
    console.log('🗺️ MoneyMap: buildMoneyMap called');
    return await window.electronAPI.buildMoneyMap(userId);
  }

  async refreshWithBudget(moneyMap, budgetData) {
    console.log('🗺️ MoneyMap: refreshWithBudget called');
    return await window.electronAPI.refreshMoneyMap(moneyMap, budgetData);
  }

  getQuickMap(moneyMap) {
    // This is just a utility function, no IPC needed
    if (!moneyMap) return null;
    
    return {
      totalAssets: moneyMap.summary?.totalAssets || 0,
      accountsByType: moneyMap.summary?.accountsByType || {},
      essentialCategories: (moneyMap.categories || [])
        .filter(c => c.group_name?.toLowerCase().includes('fixed'))
        .slice(0, 5),
      topSpendingCategories: Object.values(moneyMap.patterns || {})
        .sort((a, b) => (b.averageSpending || 0) - (a.averageSpending || 0))
        .slice(0, 5),
      confidence: Math.round(
        Object.values(moneyMap.patterns || {}).reduce((sum, p) => sum + (p.confidence || 0), 0) / 
        Math.max(1, Object.keys(moneyMap.patterns || {}).length)
      )
    };
  }
}

module.exports = MoneyMapRenderer;