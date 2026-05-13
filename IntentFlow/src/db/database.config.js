
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function getDatabasePath() {
    const isPackaged = app.isPackaged;
    let dbPath;

    if (isPackaged) {
        const userDataPath = app.getPath('userData');
        dbPath = path.join(userDataPath, 'money-manager.db');
        console.log('📦 Production mode - using DB path:', dbPath);
    } else {
        const projectRoot = path.resolve(__dirname, '../..');
        dbPath = path.join(projectRoot, 'src/db/data/app.db');
        console.log('🔧 Development mode - using DB path:', dbPath);
    }

    return dbPath;
}

function ensureDatabaseDirectory() {
    const dbPath = getDatabasePath();
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`📁 Created database directory: ${dbDir}`);
        fs.chmodSync(dbDir, 0o755);
    } else {
        try {
            fs.accessSync(dbDir, fs.constants.W_OK);
        } catch (err) {
            console.log('📁 Directory not writable, fixing permissions...');
            fs.chmodSync(dbDir, 0o755);
        }
    }

    // Do not create an empty database file here. Let SQLite create the file when opening
    // it and let initializeDatabase detect whether schema creation is required.
    return dbPath;
}

module.exports = { getDatabasePath, ensureDatabaseDirectory };