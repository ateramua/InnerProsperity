// src/shared/budgetEngine.mjs

import {
  computeCategoryUnderfunded,
  computeBudgetUnderfunded,
} from './underfundedEngine.mjs';

/**
 * Zero-Based Budgeting Engine
 * Implements SoulFunds's 4 core rules
 */

export default class BudgetEngine {

  /**
   * Rule #1: Give Every Dollar a Job (income vs assigned totals).
   * Note: The Property Map UI uses cash-on-budget-accounts minus sum(category.available)
   * for Ready to Assign so envelope balances stay tied to real account cash.
   */
  calculateReadyToAssign(income, assignedTotal) {
    return income - assignedTotal;
  }

  // ==================== TARGET CALCULATIONS ====================

  calculateTargetProgress(category) {
    return computeCategoryUnderfunded(category);
  }

  calculateUnderfundedCategories(categories) {
    return categories.filter((cat) => {
      const targetInfo = this.calculateTargetProgress(cat);
      return (
        targetInfo.underfunded > 0 ||
        targetInfo.status === 'partial' ||
        targetInfo.status === 'unfunded' ||
        targetInfo.status === 'in-progress'
      );
    });
  }

  getTotalUnderfunded(categories) {
    return computeBudgetUnderfunded(categories).underfundedTotal;
  }

  getBudgetUnderfunded(categories, opts) {
    return computeBudgetUnderfunded(categories, opts);
  }

  /**
   * Assign money to a category
   */
  assignToCategory(categories, categoryId, amount, initialReadyToAssign = 0) {

    const categoryIndex =
      categories.findIndex((c) => c.id === categoryId);

    if (categoryIndex === -1) {
      throw new Error("Category not found");
    }

    const updatedCategories = [...categories];

    updatedCategories[categoryIndex] = {
      ...updatedCategories[categoryIndex],
      assigned:
        (updatedCategories[categoryIndex].assigned || 0) + amount
    };

    const totalAssigned = updatedCategories.reduce(
      (sum, cat) => sum + (cat.assigned || 0),
      0
    );

    const totalIncome = totalAssigned + initialReadyToAssign;

    const readyToAssign =
      this.calculateReadyToAssign(totalIncome, totalAssigned);

    return {
      updatedCategories,
      newReadyToAssign: readyToAssign,
      isZeroBased: Math.abs(readyToAssign) < 0.01
    };
  }

  /**
   * Rule #2: Embrace True Expenses
   */
  calculateMonthlyGoal(targetAmount, targetDateOrMonths, currentDate) {

    if (targetDateOrMonths instanceof Date && currentDate instanceof Date) {

      const monthsLeft =
        this.getMonthsDifference(currentDate, targetDateOrMonths);

      return monthsLeft > 0
        ? targetAmount / monthsLeft
        : targetAmount;

    }

    const monthsUntilGoal = targetDateOrMonths;

    if (monthsUntilGoal <= 0) return targetAmount;
    if (monthsUntilGoal === Infinity) return 0;

    return targetAmount / monthsUntilGoal;
  }

  /**
   * Process transaction
   */
  processTransaction(categories, categoryId, amount) {

    const categoryIndex =
      categories.findIndex((c) => c.id === categoryId);

    if (categoryIndex === -1) {
      throw new Error("Category not found");
    }

    const updatedCategories = [...categories];
    const category = updatedCategories[categoryIndex];
    const spendDelta = amount < 0 ? -amount : 0;
    const inflowDelta = amount > 0 ? amount : 0;
    const spending = (category.spending || 0) + spendDelta;
    const inflows = (category.inflows || 0) + inflowDelta;
    const activity = spending - inflows;
    const previousAvailable = category.previous_available || 0;
    const available =
      previousAvailable +
      (category.assigned || 0) -
      spending +
      inflows +
      (category.adjustments || 0);

    updatedCategories[categoryIndex] = {
      ...category,
      spending,
      inflows,
      activity,
      available
    };

    return updatedCategories;
  }

  /**
   * Rule #3: Roll With The Punches
   */
  moveMoney(categories, fromCategoryId, toCategoryId, amount) {

    let updatedCategories = [...categories];

    const fromIndex =
      updatedCategories.findIndex((c) => c.id === fromCategoryId);

    if (fromIndex === -1)
      throw new Error("Source category not found");

    if ((updatedCategories[fromIndex].available || 0) < amount) {
      throw new Error("Insufficient funds in source category");
    }

    updatedCategories[fromIndex] = {
      ...updatedCategories[fromIndex],
      assigned:
        (updatedCategories[fromIndex].assigned || 0) - amount,
      available:
        (updatedCategories[fromIndex].available || 0) - amount
    };

    const toIndex =
      updatedCategories.findIndex((c) => c.id === toCategoryId);

    if (toIndex === -1)
      throw new Error("Destination category not found");

    updatedCategories[toIndex] = {
      ...updatedCategories[toIndex],
      assigned:
        (updatedCategories[toIndex].assigned || 0) + amount,
      available:
        (updatedCategories[toIndex].available || 0) + amount
    };

    return updatedCategories;
  }

  /**
   * Rule #4: Age Your Money
   */
  calculateAgeOfMoney(transactions, secondParam) {

    if (typeof secondParam === "number" && secondParam < 1000) {

      const days = secondParam;

      const now = new Date();
      const pastDate =
        new Date(now.setDate(now.getDate() - days));

      const recentIncome = transactions
        .filter(
          (t) =>
            new Date(t.date) >= pastDate &&
            t.amount > 0
        )
        .reduce((sum, t) => sum + t.amount, 0);

      const avgDaily =
        this.calculateAverageDailySpending(transactions, 30);

      return avgDaily > 0
        ? Math.floor(recentIncome / avgDaily)
        : 0;

    } else {

      const currentBalance = secondParam;

      const sorted = [...transactions]
        .filter((t) => t.amount < 0)
        .sort(
          (a, b) =>
            new Date(a.date) - new Date(b.date)
        );

      if (sorted.length === 0) return 0;

      let runningBalance = currentBalance;
      let totalDays = 0;
      let count = 0;

      const now = new Date();

      for (let i = sorted.length - 1; i >= 0; i--) {

        if (runningBalance <= 0) break;

        const tx = sorted[i];

        runningBalance += tx.amount;

        const daysAgo =
          (now - new Date(tx.date)) /
          (1000 * 60 * 60 * 24);

        totalDays += daysAgo;
        count++;

      }

      return count > 0 ? totalDays / count : 0;
    }
  }

  calculateAverageDailySpending(transactions, days) {

    const now = new Date();

    const pastDate =
      new Date(now.setDate(now.getDate() - days));

    const spending = transactions
      .filter(
        (t) =>
          new Date(t.date) >= pastDate &&
          t.amount < 0
      )
      .reduce(
        (sum, t) => sum + Math.abs(t.amount),
        0
      );

    return spending / days;
  }

  getMonthsDifference(date1, date2) {

    const d1 = new Date(date1);
    const d2 = new Date(date2);

    return (
      (d2.getFullYear() - d1.getFullYear()) * 12 +
      (d2.getMonth() - d1.getMonth())
    );
  }

  calculateRequiredCcPayment(statementBalance, daysUntilDue, availableCash) {

    if (availableCash >= statementBalance) {

      return {
        canPayInFull: true,
        amount: statementBalance,
        recommendedDate: new Date(
          Date.now() +
            daysUntilDue * 24 * 60 * 60 * 1000
        )
      };

    } else {

      return {
        canPayInFull: false,
        shortfall: statementBalance - availableCash,
        amount: availableCash,
        warning:
          "Insufficient funds to pay in full"
      };

    }
  }

  validateZeroBasedBudget(income, categories) {

    const totalAssigned = categories.reduce(
      (sum, cat) => sum + (cat.assigned || 0),
      0
    );

    const readyToAssign = income - totalAssigned;

    return {
      isValid: Math.abs(readyToAssign) < 0.01,
      readyToAssign,
      totalAssigned,
      totalIncome: income
    };
  }

}