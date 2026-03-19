// test-electron.js
const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
    console.log('🚀 Test app starting...');
    
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    win.loadURL('https://example.com');
    
    win.webContents.openDevTools();
    
    console.log('✅ Test app window created');
});

app.on('window-all-closed', () => {
    app.quit();
});