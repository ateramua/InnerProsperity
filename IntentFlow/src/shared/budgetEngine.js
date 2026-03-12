// src/shared/budgetEngine.js

/**
 * Zero-Based Budgeting Engine
 * Implements SoulFunds's 4 core rules
 */

class BudgetEngine {
  /**
   * Rule #1: Give Every Dollar a Job
   * Calculate how much is left to assign
   */
  calculateReadyToAssign(income, assignedTotal) {
    return income - assignedTotal;
  }

  /**
   * Assign money to a category
   */
  assignToCategory(categories, categoryId, amount) {
    const categoryIndex = categories.findIndex(c => c.id === categoryId);
    
    if (categoryIndex === -1) {
      throw new Error('Category not found');
    }

    // Create a copy of categories array
    const updatedCategories = [...categories];
    
    // Update the category
    updatedCategories[categoryIndex] = {
      ...updatedCategories[categoryIndex],
      assigned: (updatedCategories[categoryIndex].assigned || 0) + amount
    };

    // Calculate new totals
    const totalAssigned = updatedCategories.reduce(
      (sum, cat) => sum + (cat.assigned || 0), 
      0
    );

    // In a real app, totalIncome would come from the budget object
    // For now, we'll calculate it from categories + readyToAssign
    const totalIncome = totalAssigned + (global.initialReadyToAssign || 0);
    const readyToAssign = this.calculateReadyToAssign(totalIncome, totalAssigned);

    return {
      updatedCategories,
      newReadyToAssign: readyToAssign,
      isZeroBased: Math.abs(readyToAssign) < 0.01 // Account for floating point
    };
  }

  /**
   * Rule #2: Embrace Your True Expenses
   * Calculate monthly amount needed for a goal
   * Can be called with either:
   * - (targetAmount, monthsUntilGoal) for simple calculation
   * - (targetAmount, targetDate, currentDate) for date-based calculation
   */
  calculateMonthlyGoal(targetAmount, targetDateOrMonths, currentDate) {
    // Handle the case where we pass targetDate and currentDate
    if (targetDateOrMonths instanceof Date && currentDate instanceof Date) {
      const monthsLeft = this.getMonthsDifference(currentDate, targetDateOrMonths);
      return monthsLeft > 0 ? targetAmount / monthsLeft : targetAmount;
    }
    
    // Handle the case where we pass monthsUntilGoal as a number
    const monthsUntilGoal = targetDateOrMonths;
    if (monthsUntilGoal <= 0) return targetAmount;
    if (monthsUntilGoal === Infinity) return 0;
    return targetAmount / monthsUntilGoal;
  }

  /**
   * Process a transaction and update category balances
   */
  processTransaction(categories, categoryId, amount) {
    const categoryIndex = categories.findIndex(c => c.id === categoryId);
    
    if (categoryIndex === -1) {
      throw new Error('Category not found');
    }

    const updatedCategories = [...categories];
    const category = updatedCategories[categoryIndex];

    // amount is negative for spending, positive for income/refunds
    const newActivity = (category.activity || 0) + amount;
    const newAvailable = (category.assigned || 0) + newActivity;

    updatedCategories[categoryIndex] = {
      ...category,
      activity: newActivity,
      available: newAvailable
    };

    return updatedCategories;
  }

  /**
   * Rule #3: Roll With the Punches
   * Move money from one category to another
   */
  moveMoney(categories, fromCategoryId, toCategoryId, amount) {
    let updatedCategories = [...categories];

    // Subtract from source
    const fromIndex = updatedCategories.findIndex(c => c.id === fromCategoryId);
    if (fromIndex === -1) throw new Error('Source category not found');
    
    if ((updatedCategories[fromIndex].available || 0) < amount) {
      throw new Error('Insufficient funds in source category');
    }

    updatedCategories[fromIndex] = {
      ...updatedCategories[fromIndex],
      assigned: (updatedCategories[fromIndex].assigned || 0) - amount,
      available: (updatedCategories[fromIndex].available || 0) - amount
    };

    // Add to destination
    const toIndex = updatedCategories.findIndex(c => c.id === toCategoryId);
    if (toIndex === -1) throw new Error('Destination category not found');

    updatedCategories[toIndex] = {
      ...updatedCategories[toIndex],
      assigned: (updatedCategories[toIndex].assigned || 0) + amount,
      available: (updatedCategories[toIndex].available || 0) + amount
    };

    return updatedCategories;
  }

  /**
   * Rule #4: Age Your Money
   * Calculate average age of money in days
   * Can be called with either:
   * - (transactions, currentBalance) for detailed calculation
   * - (transactions, days) for simplified calculation
   */
  calculateAgeOfMoney(transactions, secondParam) {
    // Check if secondParam is currentBalance (number) or days (number)
    if (typeof secondParam === 'number' && secondParam < 1000) {
      // Simplified version with days parameter
      const days = secondParam;
      const now = new Date();
      const pastDate = new Date(now.setDate(now.getDate() - days));
      
      const recentIncome = transactions
        .filter(t => new Date(t.date) >= pastDate && t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      
      const averageDailySpending = this.calculateAverageDailySpending(transactions, 30);
      
      return averageDailySpending > 0 
        ? Math.floor(recentIncome / averageDailySpending) 
        : 0;
    } else {
      // Detailed version with currentBalance
      const currentBalance = secondParam;
      
      // Sort transactions by date (oldest first for this calculation)
      const sortedTransactions = [...transactions]
        .filter(t => t.amount < 0) // Only spending
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      if (sortedTransactions.length === 0) return 0;

      let runningBalance = currentBalance;
      let totalDays = 0;
      let transactionCount = 0;
      const now = new Date();

      // Go through transactions from oldest to newest
      for (let i = sortedTransactions.length - 1; i >= 0; i--) {
        if (runningBalance <= 0) break;
        
        const transaction = sortedTransactions[i];
        runningBalance += transaction.amount; // amount is negative, so this reduces balance
        
        const daysAgo = (now - new Date(transaction.date)) / (1000 * 60 * 60 * 24);
        totalDays += daysAgo;
        transactionCount++;
      }

      return transactionCount > 0 ? totalDays / transactionCount : 0;
    }
  }

  /**
   * Calculate average daily spending over a period
   */
  calculateAverageDailySpending(transactions, days) {
    const now = new Date();
    const pastDate = new Date(now.setDate(now.getDate() - days));
    
    const spending = transactions
      .filter(t => new Date(t.date) >= pastDate && t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    return spending / days;
  }

  /**
   * Calculate months between two dates
   */
  getMonthsDifference(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (d2.getFullYear() - d1.getFullYear()) * 12 + 
           (d2.getMonth() - d1.getMonth());
  }

  /**
   * Calculate credit card payment needed to avoid interest
   */
  calculateRequiredCcPayment(statementBalance, daysUntilDue, availableCash) {
    if (availableCash >= statementBalance) {
      return {
        canPayInFull: true,
        amount: statementBalance,
        recommendedDate: new Date(Date.now() + (daysUntilDue * 24 * 60 * 60 * 1000))
      };
    } else {
      return {
        canPayInFull: false,
        shortfall: statementBalance - availableCash,
        amount: availableCash,
        warning: 'Insufficient funds to pay in full'
      };
    }
  }

  /**
   * Validate that budget balances to zero
   */
  validateZeroBasedBudget(income, categories) {
    const totalAssigned = categories.reduce((sum, cat) => sum + (cat.assigned || 0), 0);
    const readyToAssign = income - totalAssigned;
    
    return {
      isValid: Math.abs(readyToAssign) < 0.01,
      readyToAssign,
      totalAssigned,
      totalIncome: income
    };
  }
}

export default BudgetEngine;