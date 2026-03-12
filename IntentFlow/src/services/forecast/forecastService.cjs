// src/services/forecast/forecastService.cjs
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

class ForecastService {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, '..', '..', 'db', 'data', 'app.db');
    }

    async getDb() {
        return open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });
    }

    // Get all accounts with balances
    async getAccounts(userId) {
        const db = await this.getDb();
        try {
            const accounts = await db.all(`
                SELECT * FROM accounts 
                WHERE user_id = ? AND is_active = 1
                ORDER BY type, name
            `, userId);
            return accounts || [];
        } finally {
            await db.close();
        }
    }

    // Get all categories with assigned amounts and targets
    async getCategories(userId) {
        const db = await this.getDb();
        try {
            const categories = await db.all(`
                SELECT c.*, cg.name as group_name
                FROM categories c
                LEFT JOIN category_groups cg ON c.group_id = cg.id
                WHERE c.user_id = ?
                ORDER BY cg.sort_order, c.name
            `, userId);
            return categories || [];
        } finally {
            await db.close();
        }
    }

    // Get recurring transactions/scheduled items
    async getScheduledItems(userId) {
        const db = await this.getDb();
        try {
            // This would come from a scheduled_transactions table
            // For now, return empty array
            return [];
        } finally {
            await db.close();
        }
    }

    // Get transaction history for pattern analysis
    async getTransactionHistory(userId, months = 6) {
        const db = await this.getDb();
        try {
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - months);
            const startDateStr = startDate.toISOString().split('T')[0];

            const transactions = await db.all(`
                SELECT 
                    t.*,
                    a.name as account_name,
                    a.type as account_type,
                    c.name as category_name,
                    c.target_amount,
                    strftime('%Y-%m', t.date) as month
                FROM transactions t
                JOIN accounts a ON t.account_id = a.id
                LEFT JOIN categories c ON t.category_id = c.id
                WHERE t.user_id = ? AND t.date >= ?
                ORDER BY t.date DESC
            `, [userId, startDateStr]);
            return transactions || [];
        } finally {
            await db.close();
        }
    }

    // Analyze spending patterns by category
    async analyzeSpendingPatterns(userId) {
        const transactions = await this.getTransactionHistory(userId, 6);
        
        const patterns = {};
        const categories = {};

        // Group by category
        transactions.forEach(t => {
            if (!t.category_id) return;
            
            if (!categories[t.category_id]) {
                categories[t.category_id] = {
                    id: t.category_id,
                    name: t.category_name || 'Unknown',
                    transactions: [],
                    monthlyTotals: {},
                    average: 0,
                    volatility: 0
                };
            }
            
            categories[t.category_id].transactions.push(t);
            
            // Track monthly totals
            const month = t.month;
            if (!categories[t.category_id].monthlyTotals[month]) {
                categories[t.category_id].monthlyTotals[month] = 0;
            }
            categories[t.category_id].monthlyTotals[month] += Math.abs(t.amount);
        });

        // Calculate averages and volatility
        Object.keys(categories).forEach(catId => {
            const cat = categories[catId];
            const months = Object.values(cat.monthlyTotals);
            if (months.length > 0) {
                cat.average = months.reduce((a, b) => a + b, 0) / months.length;
                
                // Calculate standard deviation for volatility
                const variance = months.reduce((acc, val) => acc + Math.pow(val - cat.average, 2), 0) / months.length;
                cat.volatility = Math.sqrt(variance);
                cat.volatilityPercentage = (cat.volatility / cat.average) * 100 || 0;
            }
            
            patterns[catId] = cat;
        });

        return patterns;
    }

    // Generate forecast for future dates
    async generateForecast(userId, options = {}) {
        const {
            months = 12,
            includeIncome = true,
            includeExpenses = true,
            includeSavings = true,
            usePatterns = true
        } = options;

        // Get current data
        const accounts = await this.getAccounts(userId);
        const categories = await this.getCategories(userId);
        const patterns = await this.analyzeSpendingPatterns(userId);
        
        const startDate = new Date();
        const forecast = [];

        // Calculate total current assets
        const currentAssets = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
        let projectedAssets = currentAssets;

        // Forecast month by month
        for (let i = 0; i < months; i++) {
            const forecastDate = new Date(startDate);
            forecastDate.setMonth(forecastDate.getMonth() + i + 1);
            
            const monthKey = forecastDate.toISOString().split('T')[0].substring(0, 7);
            
            let projectedIncome = 0;
            let projectedExpenses = 0;
            let projectedSavings = 0;
            let categoryBreakdown = [];

            // Project based on patterns
            if (usePatterns) {
                Object.values(patterns).forEach(pattern => {
                    const projected = pattern.average || 0;
                    const category = categories.find(c => c.id === pattern.id);
                    
                    if (category) {
                        // Categorize as income, expense, or savings
                        if (category.target_amount && category.target_amount > 0) {
                            if (category.name.toLowerCase().includes('savings')) {
                                projectedSavings += projected;
                            } else if (category.name.toLowerCase().includes('income')) {
                                projectedIncome += projected;
                            } else {
                                projectedExpenses += projected;
                            }
                        } else {
                            projectedExpenses += projected;
                        }

                        categoryBreakdown.push({
                            categoryId: category.id,
                            categoryName: category.name,
                            projectedAmount: projected,
                            confidence: Math.max(0, 100 - (pattern.volatilityPercentage || 50))
                        });
                    }
                });
            }

            // Apply growth trends
            projectedAssets = projectedAssets + projectedIncome - projectedExpenses + projectedSavings;

            forecast.push({
                month: monthKey,
                date: forecastDate.toISOString().split('T')[0],
                projectedIncome,
                projectedExpenses,
                projectedSavings,
                netChange: projectedIncome - projectedExpenses + projectedSavings,
                projectedAssets,
                categoryBreakdown,
                confidence: this.calculateConfidence(i, patterns)
            });
        }

        return {
            currentAssets,
            forecast,
            patterns,
            metadata: {
                generatedAt: new Date().toISOString(),
                monthsProjected: months,
                options
            }
        };
    }

    // Calculate confidence level based on data quality and forecast distance
    calculateConfidence(monthsAhead, patterns) {
        const baseConfidence = 95;
        const decayPerMonth = 5;
        const volatilityPenalty = Object.values(patterns).reduce((sum, p) => sum + (p.volatilityPercentage || 0), 0) / 
            Math.max(1, Object.keys(patterns).length);
        
        const confidence = Math.max(0, baseConfidence - (monthsAhead * decayPerMonth) - (volatilityPenalty / 10));
        return Math.min(100, confidence);
    }

    // Get daily forecast for the next 30 days
    async getDailyForecast(userId) {
        const monthlyForecast = await this.generateForecast(userId, { months: 1 });
        const dailyBreakdown = [];
        
        const daysInMonth = new Date(monthlyForecast.forecast[0].date).getDate();
        const dailyIncome = monthlyForecast.forecast[0].projectedIncome / daysInMonth;
        const dailyExpenses = monthlyForecast.forecast[0].projectedExpenses / daysInMonth;
        
        let runningBalance = monthlyForecast.currentAssets;

        for (let day = 1; day <= 30; day++) {
            const date = new Date();
            date.setDate(date.getDate() + day);
            
            // Add some randomness based on volatility
            const randomFactor = 0.8 + (Math.random() * 0.4);
            const dayIncome = dailyIncome * randomFactor;
            const dayExpenses = dailyExpenses * randomFactor;
            
            runningBalance += dayIncome - dayExpenses;

            dailyBreakdown.push({
                date: date.toISOString().split('T')[0],
                projectedBalance: runningBalance,
                projectedIncome: dayIncome,
                projectedExpenses: dayExpenses,
                dayOfWeek: date.getDay()
            });
        }

        return dailyBreakdown;
    }

    // Get weekly forecast
    async getWeeklyForecast(userId, weeks = 12) {
        const monthlyForecast = await this.generateForecast(userId, { months: Math.ceil(weeks / 4) });
        const weeklyBreakdown = [];
        
        let runningBalance = monthlyForecast.currentAssets;
        let weekCounter = 0;

        monthlyForecast.forecast.forEach((month, monthIndex) => {
            const weeksInMonth = 4; // Simplified
            const weeklyIncome = month.projectedIncome / weeksInMonth;
            const weeklyExpenses = month.projectedExpenses / weeksInMonth;

            for (let week = 0; week < weeksInMonth; week++) {
                if (weekCounter >= weeks) break;
                
                runningBalance += weeklyIncome - weeklyExpenses;
                
                weeklyBreakdown.push({
                    week: weekCounter + 1,
                    date: new Date(new Date(month.date).setDate(new Date(month.date).getDate() + (week * 7))).toISOString().split('T')[0],
                    projectedBalance: runningBalance,
                    projectedIncome: weeklyIncome,
                    projectedExpenses: weeklyExpenses,
                    confidence: monthlyForecast.forecast[monthIndex].confidence
                });
                
                weekCounter++;
            }
        });

        return weeklyBreakdown;
    }

    // Get yearly forecast with trends
    async getYearlyForecast(userId, years = 5) {
        const baseForecast = await this.generateForecast(userId, { months: years * 12 });
        const yearlyBreakdown = [];
        
        // Group by year
        const yearlyData = {};
        
        baseForecast.forecast.forEach(month => {
            const year = month.date.substring(0, 4);
            if (!yearlyData[year]) {
                yearlyData[year] = {
                    year: parseInt(year),
                    totalIncome: 0,
                    totalExpenses: 0,
                    totalSavings: 0,
                    endBalance: 0,
                    months: []
                };
            }
            
            yearlyData[year].totalIncome += month.projectedIncome;
            yearlyData[year].totalExpenses += month.projectedExpenses;
            yearlyData[year].totalSavings += month.projectedSavings;
            yearlyData[year].months.push(month);
        });

        // Calculate growth trends
        let previousYearEnd = baseForecast.currentAssets;
        Object.keys(yearlyData).sort().forEach(year => {
            yearlyData[year].startBalance = previousYearEnd;
            yearlyData[year].endBalance = previousYearEnd + 
                yearlyData[year].totalIncome - 
                yearlyData[year].totalExpenses + 
                yearlyData[year].totalSavings;
            
            yearlyData[year].growth = yearlyData[year].endBalance - previousYearEnd;
            yearlyData[year].growthPercentage = (yearlyData[year].growth / previousYearEnd) * 100;
            
            previousYearEnd = yearlyData[year].endBalance;
            yearlyBreakdown.push(yearlyData[year]);
        });

        return yearlyBreakdown;
    }

    // Get smart recommendations
    async getRecommendations(userId) {
        const accounts = await this.getAccounts(userId);
        const categories = await this.getCategories(userId);
        const patterns = await this.analyzeSpendingPatterns(userId);
        const forecast = await this.generateForecast(userId, { months: 3 });
        
        const recommendations = [];

        // Check for cash flow issues
        const nextMonth = forecast.forecast[0];
        if (nextMonth.projectedAssets < 0) {
            recommendations.push({
                type: 'warning',
                priority: 'high',
                title: 'Potential Cash Flow Issue',
                description: 'Your projected balance may become negative next month.',
                action: 'Review upcoming expenses and consider reducing discretionary spending.',
                icon: '⚠️'
            });
        }

        // Check for high volatility categories
        Object.values(patterns).forEach(pattern => {
            if (pattern.volatilityPercentage > 50) {
                recommendations.push({
                    type: 'insight',
                    priority: 'medium',
                    title: `High Volatility in ${pattern.name}`,
                    description: `Your spending in ${pattern.name} varies significantly month to month.`,
                    action: 'Consider setting a monthly target to stabilize spending.',
                    icon: '📊'
                });
            }
        });

        // Check for savings opportunities
        const avgExpenses = forecast.forecast.reduce((sum, m) => sum + m.projectedExpenses, 0) / forecast.forecast.length;
        const avgIncome = forecast.forecast.reduce((sum, m) => sum + m.projectedIncome, 0) / forecast.forecast.length;
        const savingsRate = (avgIncome - avgExpenses) / avgIncome * 100;

        if (savingsRate < 10) {
            recommendations.push({
                type: 'opportunity',
                priority: 'medium',
                title: 'Low Savings Rate',
                description: `Your current savings rate is ${savingsRate.toFixed(1)}%. Aim for at least 15-20%.`,
                action: 'Review your expenses and identify areas to cut back.',
                icon: '💰'
            });
        } else if (savingsRate > 20) {
            recommendations.push({
                type: 'success',
                priority: 'low',
                title: 'Great Savings Rate!',
                description: `You're saving ${savingsRate.toFixed(1)}% of your income.`,
                action: 'Consider investing or allocating more to specific savings goals.',
                icon: '🎯'
            });
        }

        return recommendations;
    }

    // ==================== MONEY MAP INTEGRATION ====================

    // Build a unified money map
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

            // 3. Get scheduled/recurring items
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
                    isFunded: false,
                    currentAvailable: 0
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

    // Generate forecast using the money map
    async generateForecastWithMoneyMap(userId, options = {}) {
        const moneyMap = await this.buildMoneyMap(userId);
        
        const forecast = [];
        let projectedAssets = moneyMap.summary.totalAssets;
        
        for (let i = 0; i < (options.months || 12); i++) {
            let monthlyIncome = 0;
            let monthlyExpenses = 0;
            let monthlySavings = 0;
            
            // Use patterns from money map
            Object.values(moneyMap.patterns).forEach(pattern => {
                const category = moneyMap.categories.find(c => c.id === pattern.categoryId);
                
                if (category) {
                    if (category.target_amount && category.target_amount > 0) {
                        // Use target if available
                        if (category.name.toLowerCase().includes('savings')) {
                            monthlySavings += category.target_amount;
                        } else if (category.name.toLowerCase().includes('income')) {
                            monthlyIncome += category.target_amount;
                        } else {
                            monthlyExpenses += category.target_amount;
                        }
                    } else {
                        // Use pattern average
                        monthlyExpenses += pattern.averageSpending || 0;
                        monthlyIncome += pattern.averageIncome || 0;
                    }
                }
            });
            
            projectedAssets += monthlyIncome - monthlyExpenses + monthlySavings;
            
            forecast.push({
                month: i + 1,
                projectedAssets,
                income: monthlyIncome,
                expenses: monthlyExpenses,
                savings: monthlySavings,
                confidence: Math.max(0, 95 - (i * 5))
            });
        }
        
        return {
            moneyMap: this.getQuickMap(moneyMap),
            forecast,
            metadata: {
                generatedAt: new Date().toISOString(),
                dataQuality: moneyMap.metadata.hasTargets ? 'high' : 'medium',
                hasTargets: moneyMap.metadata.hasTargets
            }
        };
    }
}

module.exports = ForecastService;