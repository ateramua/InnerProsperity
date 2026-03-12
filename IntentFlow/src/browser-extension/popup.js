// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup loaded');
  
  // Load mock data
  loadMockData();
  
  // Setup event listeners
  setupEventListeners();
});

// Load mock data for testing
function loadMockData() {
  // Update stats
  document.getElementById('readyToAssign').textContent = '$1,234.56';
  document.getElementById('inBudget').textContent = '$4,567.89';
  document.getElementById('spentToday').textContent = '$78.45';
  document.getElementById('upcomingBills').textContent = '$1,245.67';
  
  // Mock categories
  const categories = [
    { name: 'Groceries', group: 'Daily Living', assigned: 600, available: 554.33 },
    { name: 'Dining Out', group: 'Daily Living', assigned: 300, available: 276.50 },
    { name: 'Rent', group: 'Monthly Bills', assigned: 1500, available: 1500 },
    { name: 'Electricity', group: 'Monthly Bills', assigned: 150, available: 150 },
    { name: 'Netflix', group: 'Subscriptions', assigned: 15.99, available: 15.99 }
  ];
  
  // Mock transactions
  const transactions = [
    { payee: 'Walmart', amount: -45.67, date: '2024-03-15', category: 'Groceries' },
    { payee: 'Starbucks', amount: -5.75, date: '2024-03-15', category: 'Dining Out' },
    { payee: 'Salary', amount: 3450.00, date: '2024-03-14', category: 'Income' },
    { payee: 'Amazon', amount: -32.50, date: '2024-03-14', category: 'Shopping' }
  ];
  
  // Mock cards
  const cards = [
    { name: 'Chase Sapphire', balance: 2340.50, limit: 10000, dueDate: '2024-04-15', apr: 21.99 },
    { name: 'Amex Gold', balance: 1250.75, limit: 15000, dueDate: '2024-04-20', apr: 24.99 }
  ];
  
  // Render data
  renderCategories(categories);
  renderTransactions(transactions);
  renderCards(cards);
  populateCategorySelect(categories);
  populateAccountSelect();
  
  // Set desktop status
  document.getElementById('desktopStatus').textContent = 'Connected';
  document.getElementById('desktopStatus').style.color = '#4ADE80';
}

// Render categories
function renderCategories(categories) {
  const container = document.getElementById('categoryList');
  
  if (!categories || categories.length === 0) {
    container.innerHTML = '<div class="loading">No categories found</div>';
    return;
  }
  
  let html = '';
  categories.forEach(cat => {
    html += `
      <div class="category-item">
        <div class="category-info">
          <span class="category-name">${cat.name}</span>
          <span class="category-group">${cat.group}</span>
        </div>
        <div class="category-amounts">
          <div class="category-assigned">$${cat.assigned.toFixed(2)}</div>
          <div class="category-available ${cat.available >= 0 ? 'positive' : 'negative'}">
            $${cat.available.toFixed(2)}
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Render transactions
function renderTransactions(transactions) {
  const container = document.getElementById('transactionList');
  
  if (!transactions || transactions.length === 0) {
    container.innerHTML = '<div class="loading">No recent transactions</div>';
    return;
  }
  
  let html = '';
  transactions.forEach(t => {
    const date = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const amountClass = t.amount >= 0 ? 'positive' : 'negative';
    const amountSign = t.amount >= 0 ? '+' : '-';
    
    html += `
      <div class="transaction-item">
        <div class="transaction-info">
          <span class="transaction-payee">${t.payee}</span>
          <span class="transaction-meta">${date} • ${t.category}</span>
        </div>
        <div class="transaction-amount ${amountClass}">
          ${amountSign}$${Math.abs(t.amount).toFixed(2)}
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Render cards
function renderCards(cards) {
  const container = document.getElementById('cardList');
  
  if (!cards || cards.length === 0) {
    container.innerHTML = '<div class="loading">No credit cards found</div>';
    return;
  }
  
  let html = '';
  cards.forEach(card => {
    const utilization = (card.balance / card.limit) * 100;
    const dueDate = new Date(card.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    html += `
      <div class="card-item">
        <div class="card-header">
          <span class="card-name">${card.name}</span>
          <span class="card-balance">$${card.balance.toFixed(2)}</span>
        </div>
        <div class="card-details">
          <span>Due: ${dueDate}</span>
          <span>APR: ${card.apr}%</span>
          <span>Limit: $${card.limit.toLocaleString()}</span>
        </div>
        <div class="card-progress">
          <div class="card-progress-bar" style="width: ${utilization}%"></div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Populate category select
function populateCategorySelect(categories) {
  const select = document.getElementById('category');
  let html = '<option value="">Select Category</option>';
  
  categories.forEach(c => {
    html += `<option value="${c.name}">${c.name}</option>`;
  });
  
  select.innerHTML = html;
}

// Populate account select
function populateAccountSelect() {
  const select = document.getElementById('account');
  const accounts = [
    { id: 1, name: 'Chase Checking' },
    { id: 2, name: 'Capital One Savings' },
    { id: 3, name: 'Chase Sapphire' }
  ];
  
  let html = '<option value="">Select Account</option>';
  accounts.forEach(a => {
    html += `<option value="${a.id}">${a.name}</option>`;
  });
  
  select.innerHTML = html;
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      this.classList.add('active');
      document.getElementById(this.dataset.tab + '-tab').classList.add('active');
    });
  });
  
  // Open desktop app
  document.getElementById('openDesktop').addEventListener('click', function(e) {
    e.preventDefault();
    chrome.tabs.create({ url: 'http://localhost:3000' });
  });
  
  // Quick add form
  document.getElementById('quickAddForm').addEventListener('submit', function(e) {
    e.preventDefault();
    alert('Transaction added! (Demo)');
    this.reset();
  });
  
  // View all buttons
  document.getElementById('viewAllBudget').addEventListener('click', function() {
    chrome.tabs.create({ url: 'http://localhost:3000' });
  });
  
  document.getElementById('viewAllTransactions').addEventListener('click', function() {
    chrome.tabs.create({ url: 'http://localhost:3000/transactions' });
  });
  
  document.getElementById('viewAllCards').addEventListener('click', function() {
    chrome.tabs.create({ url: 'http://localhost:3000/credit-cards' });
  });
  
  // Retry connection
  document.getElementById('retryConnection').addEventListener('click', function() {
    document.getElementById('desktopStatus').textContent = 'Connected';
    document.getElementById('desktopStatus').style.color = '#4ADE80';
    this.style.display = 'none';
  });
  
  // Capture item button
  const captureBtn = document.getElementById('captureItem');
  if (captureBtn) {
    captureBtn.addEventListener('click', function() {
      const price = document.getElementById('detectedPrice').textContent;
      if (price) {
        document.getElementById('amount').value = parseFloat(price.replace('$', ''));
        document.querySelector('[data-tab="add"]').click();
      }
    });
  }
}