// src/shared/test-budget.cjs
const BudgetEngine = require('./budgetEngine.js').default;

const budgetEngine = new BudgetEngine();

// Test data
const mockCategories = [
  { id: 1, name: 'Rent', assigned: 1500, activity: 0, available: 1500 },
  { id: 2, name: 'Groceries', assigned: 600, activity: -45.67, available: 554.33 },
  { id: 3, name: 'Dining Out', assigned: 300, activity: -23.50, available: 276.50 },
  { id: 4, name: 'Emergency Fund', assigned: 200, activity: 0, available: 200 }
];

const mockTransactions = [
  { id: 1, date: '2024-03-01', amount: -45.67, category_id: 2 },
  { id: 2, date: '2024-03-02', amount: -23.50, category_id: 3 },
  { id: 3, date: '2024-02-28', amount: -35.00, category_id: 2 },
  { id: 4, date: '2024-02-25', amount: -50.00, category_id: 3 }
];

console.log('\n🧪 Testing BudgetEngine...\n');

// Test Rule #1
console.log('📊 Rule #1: Give Every Dollar a Job');
const totalAssigned = mockCategories.reduce((sum, c) => sum + c.assigned, 0);
const income = 5000;
const readyToAssign = budgetEngine.calculateReadyToAssign(income, totalAssigned);
console.log(`Income: $${income}, Total Assigned: $${totalAssigned}`);
console.log(`Ready to Assign: $${readyToAssign}`);
console.log(readyToAssign === income - totalAssigned ? '✅ PASS' : '❌ FAIL');
console.log();

// Test Rule #2
console.log('📊 Rule #2: Embrace Your True Expenses');
const targetDate = new Date();
targetDate.setMonth(targetDate.getMonth() + 6);
const monthlyGoal = budgetEngine.calculateMonthlyGoal(1200, targetDate, new Date());
console.log(`$1200 goal in 6 months: $${monthlyGoal.toFixed(2)}/month`);
console.log(Math.abs(monthlyGoal - 200) < 0.01 ? '✅ PASS' : '❌ FAIL');
console.log();

// Test Rule #3
console.log('📊 Rule #3: Roll With the Punches');
try {
  const movedCategories = budgetEngine.moveMoney(mockCategories, 2, 3, 50);
  const fromCat = movedCategories.find(c => c.id === 2);
  const toCat = movedCategories.find(c => c.id === 3);
  console.log(`Moved $50 from Groceries to Dining Out`);
  console.log(`Groceries available: $${fromCat.available.toFixed(2)}`);
  console.log(`Dining Out available: $${toCat.available.toFixed(2)}`);
  console.log(Math.abs(fromCat.available - 504.33) < 0.01 && 
              Math.abs(toCat.available - 326.50) < 0.01 ? '✅ PASS' : '❌ FAIL');
} catch (e) {
  console.log('❌ FAIL:', e.message);
}
console.log();

// Test Rule #4
console.log('📊 Rule #4: Age Your Money');
const ageOfMoney = budgetEngine.calculateAgeOfMoney(mockTransactions, 2530.83);
console.log(`Age of Money: ${ageOfMoney.toFixed(1)} days`);
console.log(ageOfMoney > 0 ? '✅ PASS' : '❌ FAIL');
console.log();

// Test Zero-Based Validation
console.log('📊 Zero-Based Budget Validation');
const validation = budgetEngine.validateZeroBasedBudget(income, mockCategories);
console.log(`Budget is ${validation.isValid ? '✅ valid' : '❌ invalid'}`);
console.log(`Ready to Assign: $${validation.readyToAssign.toFixed(2)}`);
console.log();

console.log('✅ All tests completed!');
