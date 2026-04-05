// src/main/db.js
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { app } = require('electron');

let db = null;
// ==================== DATABASE HELPER (UPDATED) ====================
async function getDatabase() {
    console.log('🔍 getDatabase called, current db state:', db ? 'exists' : 'null');
    
    if (db) {
        try {
            await db.get('SELECT 1');
            return db;
        } catch (e) {
            console.log('⚠️ Database connection stale, reconnecting...');
            db = null;
        }
    }
    
    console.log('📦 Creating new database connection...');
    
    // Use the ensureDatabaseDirectory function to get the path and create directory if needed
    const dbPath = ensureDatabaseDirectory();
    console.log('📂 CURRENT DATABASE PATH:', dbPath);
    console.log('📂 Database file exists:', fs.existsSync(dbPath));
    
    try {
        const sqlite3 = require('sqlite3');
        const { open } = require('sqlite');
        
        db = await open({ 
            filename: dbPath, 
            driver: sqlite3.Database 
        });
        
        // Enable foreign keys and WAL mode for better concurrency
        await db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
        await db.get('SELECT 1');
        
        console.log('✅ Database connection established');
        return db;
    } catch (error) {
        console.error('❌ Failed to create database connection:', error);
        throw error;
    }
}

async function closeDatabase() {
  if (db) {
    await db.close();
    db = null;
  }
}

module.exports = { getDatabase, closeDatabase };