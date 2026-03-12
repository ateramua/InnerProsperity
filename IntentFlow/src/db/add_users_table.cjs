const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

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

// Helper function to hash passwords
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

// Add users table
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      full_name TEXT,
      email TEXT,
      avatar_color TEXT DEFAULT '#3B82F6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating users table:', err);
    } else {
      console.log('✅ Users table created');
      
      // Add default users
      const { salt: salt1, hash: hash1 } = hashPassword('alice123');
      const { salt: salt2, hash: hash2 } = hashPassword('bob123');
      
      db.run(`
        INSERT OR IGNORE INTO users (username, password_hash, password_salt, full_name, email, avatar_color)
        VALUES 
          ('alice', ?, ?, 'Alice Smith', 'alice@example.com', '#3B82F6'),
          ('bob', ?, ?, 'Bob Johnson', 'bob@example.com', '#10B981')
      `, [hash1, salt1, hash2, salt2], function(err) {
        if (err) {
          console.error('❌ Error adding default users:', err);
        } else {
          console.log('✅ Default users created:');
          console.log('   - alice / alice123');
          console.log('   - bob / bob123');
        }
      });
    }
  });

  // Add user_id to existing tables
  const tables = ['budgets', 'categories', 'accounts', 'transactions', 'goals', 'bills', 'investments'];
  
  tables.forEach(table => {
    db.run(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER DEFAULT 1`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error(`❌ Error adding user_id to ${table}:`, err);
      } else if (!err) {
        console.log(`✅ Added user_id to ${table}`);
      }
    });
  });
});

setTimeout(() => {
  db.close();
  console.log('📁 Database update complete');
}, 1000);