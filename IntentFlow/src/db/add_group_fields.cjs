const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

const appName = 'money-manager';
let userDataPath;

if (process.platform === 'darwin') {
  userDataPath = path.join(os.homedir(), 'Library', 'Application Support', appName);
}

const dbPath = path.join(userDataPath, 'money-manager.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Add description and is_expanded fields to category_groups
  db.run(`ALTER TABLE category_groups ADD COLUMN description TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding description:', err);
    } else {
      console.log('✅ Added description to category_groups');
    }
  });

  db.run(`ALTER TABLE category_groups ADD COLUMN is_expanded INTEGER DEFAULT 1`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding is_expanded:', err);
    } else {
      console.log('✅ Added is_expanded to category_groups');
    }
  });

  // Add hidden field to categories if not exists
  db.run(`ALTER TABLE categories ADD COLUMN hidden INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding hidden:', err);
    } else {
      console.log('✅ Added hidden to categories');
    }
  });
});

setTimeout(() => db.close(), 500);
