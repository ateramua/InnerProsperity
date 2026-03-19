// test-app.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
    console.log('🚀 Test app starting...');
    
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Try loading your Next.js dev server
    win.loadURL('http://localhost:3000');
    
    win.webContents.openDevTools();
    
    console.log('✅ Window created, loading Next.js...');
});

app.on('window-all-closed', () => {
    app.quit();
});