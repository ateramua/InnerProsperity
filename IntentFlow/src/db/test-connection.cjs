const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('🔍 Testing database connection...\n');

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
console.log(`📁 Database path: ${dbPath}`);
console.log(`📁 Database exists: ${fs.existsSync(dbPath)}\n`);

// Connect to database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Failed to connect:', err.message);
    process.exit(1);
  }
  
  console.log('✅ Connected to database successfully!\n');
  
  // Query all tables
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error('❌ Error querying tables:', err.message);
    } else {
      console.log('📊 Tables in database:');
      tables.forEach(table => console.log(`   - ${table.name}`));
      console.log();
    }
    
    // Query categories
    db.all("SELECT * FROM categories LIMIT 5", [], (err, rows) => {
      if (err) {
        console.error('❌ Error querying categories:', err.message);
      } else {
        console.log(`📊 Categories found: ${rows.length}`);
        if (rows.length > 0) {
          console.log('   Sample category:', rows[0]);
        }
        console.log();
      }
      
      // Query transactions
      db.all("SELECT * FROM transactions LIMIT 5", [], (err, rows) => {
        if (err) {
          console.error('❌ Error querying transactions:', err.message);
        } else {
          console.log(`📊 Transactions found: ${rows.length}`);
          if (rows.length > 0) {
            console.log('   Sample transaction:', rows[0]);
          }
          console.log();
        }
        
        // Query accounts
        db.all("SELECT * FROM accounts LIMIT 5", [], (err, rows) => {
          if (err) {
            console.error('❌ Error querying accounts:', err.message);
          } else {
            console.log(`📊 Accounts found: ${rows.length}`);
            if (rows.length > 0) {
              console.log('   Sample account:', rows[0]);
            }
            console.log();
          }
          
          console.log('✅ Test complete!');
          db.close();
        });
      });
    });
  });
});
