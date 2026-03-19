// test-db.js
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Copy your database functions from index.cjs
async function testDatabase() {
    console.log('📦 Testing database initialization...');
    
    // Simple database path function
    function getDatabasePath() {
        const projectRoot = path.resolve(__dirname);
        return path.join(projectRoot, 'src/db/data/app.db');
    }

    try {
        const sqlite3 = require('sqlite3');
        const { open } = require('sqlite');
        
        const dbPath = getDatabasePath();
        console.log('📂 Database path:', dbPath);
        
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        
        await db.get('SELECT 1');
        console.log('✅ Database connection successful');
        
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
        console.log('📊 Tables found:', tables.map(t => t.name));
        
        return true;
    } catch (error) {
        console.error('❌ Database error:', error);
        return false;
    }
}

app.whenReady().then(async () => {
    console.log('🚀 Testing database...');
    const result = await testDatabase();
    console.log('✅ Test complete, result:', result);
    app.quit();
});