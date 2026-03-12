const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

// Determine database path
const appName = 'money-manager';
let userDataPath;

if (process.platform === 'darwin') {
  userDataPath = path.join(os.homedir(), 'Library', 'Application Support', appName);
} else if (process.platform === 'win32') {
  userDataPath = path.join(process.env.APPDATA, appName);
} else {
  userDataPath = path.join(os.homedir(), '.local', 'share', appName);
}

const dbPath = path.join(userDataPath, 'money-manager.db');
console.log(`📁 Updating database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath);

// Add investment tables
db.serialize(() => {
  // Investments table
  db.run(`
    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- stock, etf, bond, crypto, mutual_fund
      shares REAL NOT NULL,
      purchase_price REAL NOT NULL,
      current_price REAL,
      purchase_date DATE NOT NULL,
      account_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `, (err) => {
    if (err) console.error('❌ Error creating investments table:', err);
    else console.log('✅ Investments table created');
  });

  // Investment transactions table
  db.run(`
    CREATE TABLE IF NOT EXISTS investment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_id INTEGER NOT NULL,
      type TEXT NOT NULL, -- buy, sell, dividend, split
      shares REAL,
      price_per_share REAL,
      total_amount REAL NOT NULL,
      date DATE NOT NULL,
      notes TEXT,
      FOREIGN KEY (investment_id) REFERENCES investments(id)
    )
  `, (err) => {
    if (err) console.error('❌ Error creating investment_transactions table:', err);
    else console.log('✅ Investment transactions table created');
  });

  // Price history table (for charts)
  db.run(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_id INTEGER NOT NULL,
      price REAL NOT NULL,
      date DATE NOT NULL,
      FOREIGN KEY (investment_id) REFERENCES investments(id)
    )
  `, (err) => {
    if (err) console.error('❌ Error creating price_history table:', err);
    else console.log('✅ Price history table created');
  });

  // Add sample investments
  setTimeout(() => {
    const sampleInvestments = [
      ['AAPL', 'Apple Inc.', 'stock', 10, 150.50, 175.25, '2024-01-15', 2, 'Tech stock'],
      ['VTI', 'Vanguard Total Stock Market', 'etf', 50, 220.30, 235.80, '2024-02-01', 2, 'Index fund'],
      ['BTC', 'Bitcoin', 'crypto', 0.5, 42000, 48500, '2024-01-20', 2, 'Cryptocurrency']
    ];

    const stmt = db.prepare(`
      INSERT INTO investments (symbol, name, type, shares, purchase_price, current_price, purchase_date, account_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sampleInvestments.forEach(inv => {
      stmt.run(inv, function(err) {
        if (err) console.error('❌ Error adding sample investment:', err);
      });
    });

    stmt.finalize();
    console.log('✅ Sample investments added');
  }, 500);
});

setTimeout(() => {
  db.close();
  console.log('📁 Database update complete');
}, 1000);
