// src/main/db.js
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { app } = require('electron');

let db = null;

async function getDatabase() {
  if (db) return db;
  
  const dbPath = app.isPackaged
    ? path.join(app.getPath('userData'), 'money-manager.db')
    : path.join(__dirname, '../../db/data/app.db');
  
  console.log('📂 Opening database at:', dbPath);
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  
  // Enable foreign keys and WAL mode for better concurrency
  await db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  
  return db;
}

async function closeDatabase() {
  if (db) {
    await db.close();
    db = null;
  }
}

module.exports = { getDatabase, closeDatabase };