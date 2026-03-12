// src/services/prosperity/prosperityOptimizer.cjs
const MoneyMap = require('../forecast/moneyMap.cjs');

class ProsperityOptimizer {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.moneyMap = new MoneyMap(dbPath);
    }

    // Priority levels for categories
    PRIORITY = {
        ESSENTIAL: 1,      // Rent, mortgage, utilities
        DEBT: 2,           // Credit card payments, loans
        SAVINGS: 3,        // Emergency fund, investments
        VARIABLE: 4,       // Groceries, gas
        DISCRETIONARY: 5   // Entertainment, dining out
    };

    // Calculate optimal ProsperityMap allocation based on priorities
    async optimizeProsperityMap(userId, totalIncome) {
        const map = await this.moneyMap.buildMoneyMap(userId);
        
        // Get current unassigned funds
        const unassigned = await this.getUnassignedFunds(userId);
        
        // Initialize ProsperityMap allocation
        const allocation = {
            categories: [],
            totalAssigned: 0,
            remainingFunds: unassigned,
            recommendations: []
        };

        // 1. Fix overspent categories first
        await this.fixOverspent(map, allocation);

        // 2. Allocate to essential categories
        await this.allocateByPriority(map, allocation, this.PRIORITY.ESSENTIAL);

        // 3. Allocate to debt payments
        await this.allocateByPriority(map, allocation, this.PRIORITY.DEBT);

        // 4. Allocate to savings goals
        await this.allocateByPriority(map, allocation, this.PRIORITY.SAVINGS);

        // 5. Allocate to variable expenses
        await this.allocateByPriority(map, allocation, this.PRIORITY.VARIABLE);

        // 6. Allocate to discretionary spending
        await this.allocateByPriority(map, allocation, this.PRIORITY.DISCRETIONARY);

        // Generate recommendations based on allocation
        allocation.recommendations = this.generateRecommendations(map, allocation);

        return allocation;
    }

    // Fix categories that are overspent
    async fixOverspent(map, allocation) {
        const overspentCategories = map.categories.filter(c => 
            (c.available || 0) < 0 && allocation.remainingFunds > 0
        );

        for (const cat of overspentCategories) {
            const needed = Math.abs(cat.available || 0);
            const amount = Math.min(needed, allocation.remainingFunds);
            
            if (amount > 0) {
                allocation.categories.push({
                    categoryId: cat.id,
                    categoryName: cat.name,
                    amount: amount,
                    reason: 'Fix overspending',
                    priority: 0
                });
                allocation.totalAssigned += amount;
                allocation.remainingFunds -= amount;
            }
        }
    }

    // Allocate funds to categories by priority
    async allocateByPriority(map, allocation, priority) {
        const categories = this.getCategoriesByPriority(map, priority);
        
        for (const cat of categories) {
            if (allocation.remainingFunds <= 0) break;

            const needed = this.calculateNeeded(cat);
            if (needed <= 0) continue;

            const amount = Math.min(needed, allocation.remainingFunds);
            
            allocation.categories.push({
                categoryId: cat.id,
                categoryName: cat.name,
                amount: amount,
                reason: this.getPriorityReason(priority),
                priority: priority
            });
            
            allocation.totalAssigned += amount;
            allocation.remainingFunds -= amount;
        }
    }

    // Get categories by priority level
    getCategoriesByPriority(map, priority) {
        return map.categories.filter(c => {
            switch(priority) {
                case this.PRIORITY.ESSENTIAL:
                    return c.group_name?.toLowerCase().includes('fixed') ||
                           c.name?.toLowerCase().includes('rent') ||
                           c.name?.toLowerCase().includes('mortgage') ||
                           c.name?.toLowerCase().includes('utilities');
                
                case this.PRIORITY.DEBT:
                    return c.name?.toLowerCase().includes('debt') ||
                           c.name?.toLowerCase().includes('credit') ||
                           c.name?.toLowerCase().includes('loan');
                
                case this.PRIORITY.SAVINGS:
                    return c.name?.toLowerCase().includes('savings') ||
                           c.name?.toLowerCase().includes('emergency') ||
                           c.name?.toLowerCase().includes('investment');
                
                case this.PRIORITY.VARIABLE:
                    return c.group_name?.toLowerCase().includes('variable') ||
                           c.name?.toLowerCase().includes('groceries') ||
                           c.name?.toLowerCase().includes('gas');
                
                case this.PRIORITY.DISCRETIONARY:
                    return c.group_name?.toLowerCase().includes('discretionary') ||
                           c.name?.toLowerCase().includes('entertainment') ||
                           c.name?.toLowerCase().includes('dining');
                
                default:
                    return false;
            }
        });
    }

    // Calculate how much a category needs
    calculateNeeded(category) {
        const pattern = category.patterns;
        const target = category.target_amount || 0;
        const assigned = category.assigned || 0;
        const average = pattern?.averageSpending || 0;

        // Use target if available, otherwise use historical average
        const desired = target > 0 ? target : average;
        
        return Math.max(0, desired - assigned);
    }

    // Get reason text based on priority
    getPriorityReason(priority) {
        switch(priority) {
            case this.PRIORITY.ESSENTIAL: return 'Essential expense';
            case this.PRIORITY.DEBT: return 'Debt payment';
            case this.PRIORITY.SAVINGS: return 'Savings goal';
            case this.PRIORITY.VARIABLE: return 'Variable expense';
            case this.PRIORITY.DISCRETIONARY: return 'Discretionary spending';
            default: return 'ProsperityMap allocation';
        }
    }

    // Get unassigned funds (you'll need to implement this based on your data)
    async getUnassignedFunds(userId) {
        // This should calculate Ready to Assign amount
        // For now, return a sample value
        return 1250.57;
    }

    // Generate recommendations based on allocation
    generateRecommendations(map, allocation) {
        const recommendations = [];

        // Check if essential categories are underfunded
        const essentialNeeds = allocation.categories.filter(c => c.priority === this.PRIORITY.ESSENTIAL);
        if (essentialNeeds.length > 0) {
            recommendations.push({
                type: 'warning',
                message: `${essentialNeeds.length} essential ${essentialNeeds.length === 1 ? 'category needs' : 'categories need'} funding`,
                action: 'Review essential expenses first in your ProsperityMap'
            });
        }

        // Check savings rate
        const savingsAllocations = allocation.categories.filter(c => c.priority === this.PRIORITY.SAVINGS);
        const totalSavings = savingsAllocations.reduce((sum, c) => sum + c.amount, 0);
        const savingsRate = (totalSavings / allocation.totalAssigned) * 100;

        if (savingsRate < 10) {
            recommendations.push({
                type: 'opportunity',
                message: `Low savings rate (${savingsRate.toFixed(1)}%)`,
                action: 'Consider increasing savings allocations in your ProsperityMap'
            });
        } else if (savingsRate > 20) {
            recommendations.push({
                type: 'success',
                message: `Great savings rate! (${savingsRate.toFixed(1)}%)`,
                action: 'Your ProsperityMap is on track with savings goals'
            });
        }

        // Check if there's remaining unassigned
        if (allocation.remainingFunds > 100) {
            recommendations.push({
                type: 'info',
                message: `You have ${formatCurrency(allocation.remainingFunds)} unassigned`,
                action: 'Consider adding to savings or discretionary categories in your ProsperityMap'
            });
        }

        return recommendations;
    }
}

// Helper function for currency formatting
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

module.exports = ProsperityOptimizer;