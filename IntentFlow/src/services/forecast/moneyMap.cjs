// src/services/forecast/moneyMap.cjs
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

class MoneyMap {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, '..', '..', 'db', 'data', 'app.db');
    }

    async getDb() {
        return open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });
    }

    async buildMoneyMap(userId) {
        const db = await this.getDb();
        
        try {
            // 1. Get all accounts with their current state
            const accounts = await db.all(`
                SELECT 
                    id,
                    name,
                    type,
                    balance as current_balance,
                    account_type_category,
                    credit_limit,
                    interest_rate,
                    minimum_payment,
                    currency
                FROM accounts 
                WHERE user_id = ? AND is_active = 1
                ORDER BY type, name
            `, userId);

            // 2. Get all categories with their targets and groups
            const categories = await db.all(`
                SELECT 
                    c.id,
                    c.name,
                    c.group_id,
                    c.target_type,
                    c.target_amount,
                    c.target_date,
                    cg.name as group_name,
                    cg.sort_order as group_priority
                FROM categories c
                LEFT JOIN category_groups cg ON c.group_id = cg.id
                WHERE c.user_id = ?
                ORDER BY cg.sort_order, c.name
            `, userId);

            // 3. Get scheduled/recurring items (if you have them)
            // This would come from a scheduled_transactions table
            const scheduledItems = []; // Placeholder for now

            // 4. Get recent transaction patterns (6 months)
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            
            const patterns = await db.all(`
                SELECT 
                    t.category_id,
                    c.name as category_name,
                    cg.name as group_name,
                    strftime('%Y-%m', t.date) as month,
                    SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as spending,
                    SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as income
                FROM transactions t
                LEFT JOIN categories c ON t.category_id = c.id
                LEFT JOIN category_groups cg ON c.group_id = cg.id
                WHERE t.user_id = ? AND t.date >= ?
                GROUP BY t.category_id, strftime('%Y-%m', t.date)
            `, [userId, sixMonthsAgo.toISOString().split('T')[0]]);

            // Process patterns to calculate averages and volatility
            const categoryPatterns = {};
            patterns.forEach(p => {
                if (!p.category_id) return;
                
                if (!categoryPatterns[p.category_id]) {
                    categoryPatterns[p.category_id] = {
                        categoryId: p.category_id,
                        categoryName: p.category_name,
                        groupName: p.group_name,
                        months: [],
                        averageSpending: 0,
                        averageIncome: 0,
                        volatility: 0,
                        confidence: 0
                    };
                }
                
                categoryPatterns[p.category_id].months.push({
                    month: p.month,
                    spending: p.spending || 0,
                    income: p.income || 0
                });
            });

            // Calculate averages and volatility
            Object.values(categoryPatterns).forEach(pattern => {
                const spendingValues = pattern.months.map(m => m.spending);
                const incomeValues = pattern.months.map(m => m.income);
                
                if (spendingValues.length > 0) {
                    pattern.averageSpending = spendingValues.reduce((a, b) => a + b, 0) / spendingValues.length;
                    
                    // Calculate volatility (standard deviation)
                    const variance = spendingValues.reduce((acc, val) => 
                        acc + Math.pow(val - pattern.averageSpending, 2), 0) / spendingValues.length;
                    pattern.volatility = Math.sqrt(variance);
                    
                    // Confidence based on data points and volatility
                    const dataPointsScore = Math.min(100, (spendingValues.length / 6) * 100);
                    const volatilityScore = Math.max(0, 100 - (pattern.volatility / pattern.averageSpending * 100));
                    pattern.confidence = Math.round((dataPointsScore + volatilityScore) / 2);
                }
                
                if (incomeValues.length > 0) {
                    pattern.averageIncome = incomeValues.reduce((a, b) => a + b, 0) / incomeValues.length;
                }
            });

            // 5. Calculate total current assets
            const totalAssets = accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);

            // 6. Organize categories by priority
            const prioritizedCategories = {
                essential: categories.filter(c => 
                    c.group_name?.toLowerCase().includes('fixed') || 
                    c.name?.toLowerCase().includes('rent') ||
                    c.name?.toLowerCase().includes('mortgage') ||
                    c.name?.toLowerCase().includes('utilities')
                ),
                variable: categories.filter(c => 
                    c.group_name?.toLowerCase().includes('variable') ||
                    c.name?.toLowerCase().includes('groceries') ||
                    c.name?.toLowerCase().includes('dining')
                ),
                discretionary: categories.filter(c => 
                    c.group_name?.toLowerCase().includes('discretionary') ||
                    c.name?.toLowerCase().includes('entertainment') ||
                    c.name?.toLowerCase().includes('shopping')
                ),
                savings: categories.filter(c => 
                    c.group_name?.toLowerCase().includes('savings') ||
                    c.name?.toLowerCase().includes('savings') ||
                    c.name?.toLowerCase().includes('emergency') ||
                    c.name?.toLowerCase().includes('investment')
                )
            };

            // 7. Build the complete money map
            const moneyMap = {
                userId,
                generatedAt: new Date().toISOString(),
                summary: {
                    totalAssets,
                    totalAccounts: accounts.length,
                    totalCategories: categories.length,
                    accountsByType: this.groupBy(accounts, 'type'),
                    categoriesByPriority: {
                        essential: prioritizedCategories.essential.length,
                        variable: prioritizedCategories.variable.length,
                        discretionary: prioritizedCategories.discretionary.length,
                        savings: prioritizedCategories.savings.length
                    }
                },
                accounts: accounts.map(a => ({
                    ...a,
                    // Add account-specific metrics
                    isLiquid: ['checking', 'savings', 'cash'].includes(a.type),
                    isDebt: ['credit', 'loan', 'mortgage'].includes(a.type),
                    monthlyMinimum: a.minimum_payment || 0
                })),
                categories: categories.map(c => ({
                    ...c,
                    patterns: categoryPatterns[c.id] || {
                        averageSpending: 0,
                        averageIncome: 0,
                        volatility: 0,
                        confidence: 0
                    },
                    isFunded: false, // Will be updated during forecast
                    currentAvailable: 0 // Will be calculated
                })),
                patterns: categoryPatterns,
                scheduledItems,
                metadata: {
                    dataFreshness: 'current',
                    historicalMonths: 6,
                    hasTargets: categories.some(c => c.target_amount > 0)
                }
            };

            return moneyMap;

        } finally {
            await db.close();
        }
    }

    // Helper to group arrays by key
    groupBy(array, key) {
        return array.reduce((result, item) => {
            const groupKey = item[key];
            if (!result[groupKey]) {
                result[groupKey] = [];
            }
            result[groupKey].push(item);
            return result;
        }, {});
    }

    // Update the money map with current assigned amounts
    async refreshWithBudget(moneyMap, budgetData) {
        if (!moneyMap || !budgetData) return moneyMap;

        // Update categories with current budget assignments
        moneyMap.categories = moneyMap.categories.map(cat => {
            const budgetCat = budgetData.categories?.find(c => c.id === cat.id);
            if (budgetCat) {
                return {
                    ...cat,
                    assigned: budgetCat.assigned || 0,
                    activity: budgetCat.activity || 0,
                    available: budgetCat.available || 0,
                    isFunded: (budgetCat.assigned || 0) > 0
                };
            }
            return cat;
        });

        // Recalculate totals
        moneyMap.summary.totalAssigned = moneyMap.categories.reduce((sum, c) => sum + (c.assigned || 0), 0);
        moneyMap.summary.totalAvailable = moneyMap.categories.reduce((sum, c) => sum + (c.available || 0), 0);
        
        moneyMap.metadata.lastRefreshed = new Date().toISOString();
        
        return moneyMap;
    }

    // Get a simplified version for quick access
    getQuickMap(moneyMap) {
        return {
            totalAssets: moneyMap.summary.totalAssets,
            accountsByType: moneyMap.summary.accountsByType,
            essentialCategories: moneyMap.categories.filter(c => 
                moneyMap.summary.categoriesByPriority.essential > 0
            ).slice(0, 5),
            topSpendingCategories: Object.values(moneyMap.patterns)
                .sort((a, b) => b.averageSpending - a.averageSpending)
                .slice(0, 5),
            confidence: Math.round(
                Object.values(moneyMap.patterns).reduce((sum, p) => sum + (p.confidence || 0), 0) / 
                Math.max(1, Object.keys(moneyMap.patterns).length)
            )
        };
    }
}

module.exports = MoneyMap;