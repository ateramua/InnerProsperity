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

// Add goals table
db.run(`
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL DEFAULT 0,
    target_date DATE,
    category_id INTEGER,
    account_id INTEGER,
    notes TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  )
`, (err) => {
  if (err) {
    console.error('❌ Error creating goals table:', err);
  } else {
    console.log('✅ Goals table created successfully');
    
    // Add sample goals
    const sampleGoals = [
      ['Emergency Fund', 10000, 2340.50, '2025-12-31', 8, 2, '6 months of expenses'],
      ['Vacation', 3000, 450.00, '2024-08-01', 9, 2, 'Trip to Japan'],
      ['New Car', 25000, 0, '2026-01-01', null, 2, 'Down payment']
    ];

    const stmt = db.prepare(`
      INSERT INTO goals (name, target_amount, current_amount, target_date, category_id, account_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    sampleGoals.forEach(goal => {
      stmt.run(goal, function(err) {
        if (err) console.error('❌ Error adding sample goal:', err);
      });
    });

    stmt.finalize();
    console.log('✅ Sample goals added');
  }
  db.close();
});
