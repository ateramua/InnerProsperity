// src/services/seedData.mjs
export const defaultCategoryGroups = [
  { id: 'group1', name: 'Fixed Expenses', sort_order: 1 },
  { id: 'group2', name: 'Variable Expenses', sort_order: 2 },
  { id: 'group3', name: 'Savings Goals', sort_order: 3 },
  { id: 'group4', name: 'Debt', sort_order: 4 }
];

export const defaultCategories = [
  { id: 'cat1', name: 'Rent/Mortgage', group_id: 'group1' },
  { id: 'cat2', name: 'Utilities', group_id: 'group1' },
  { id: 'cat3', name: 'Groceries', group_id: 'group2' },
  { id: 'cat4', name: 'Dining Out', group_id: 'group2' },
  { id: 'cat5', name: 'Emergency Fund', group_id: 'group3', target_type: 'balance' },
  { id: 'cat6', name: 'Credit Card Payment', group_id: 'group4' }
];