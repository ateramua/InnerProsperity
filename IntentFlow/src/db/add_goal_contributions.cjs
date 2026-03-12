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

// Add goal_contributions table
db.run(`
  CREATE TABLE IF NOT EXISTS goal_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    transaction_id INTEGER,
    amount REAL NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    FOREIGN KEY (goal_id) REFERENCES goals(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  )
`, (err) => {
  if (err) {
    console.error('❌ Error creating goal_contributions table:', err);
  } else {
    console.log('✅ Goal contributions table created successfully');
  }
  db.close();
});
