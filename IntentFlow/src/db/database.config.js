
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function getDatabasePath() {
    const isPackaged = app.isPackaged;
    let dbPath;

    if (isPackaged) {
        // PRODUCTION: writable userData directory
        const userDataPath = app.getPath('userData');
        dbPath = path.join(userDataPath, 'money-manager.db');
        console.log('📦 Production mode - using DB path:', dbPath);
    } else {
        // DEVELOPMENT: local project file (outside ASAR)
        // __dirname is src/db
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
        // Make directory writable
        fs.chmodSync(dbDir, 0o755);
    } else {
        // Ensure existing directory is writable
        try {
            fs.accessSync(dbDir, fs.constants.W_OK);
        } catch (err) {
            console.log('📁 Directory not writable, fixing permissions...');
            fs.chmodSync(dbDir, 0o755);
        }
    }

    // If database exists, ensure it's writable
    if (fs.existsSync(dbPath)) {
        try {
            fs.accessSync(dbPath, fs.constants.W_OK);
        } catch (err) {
            console.log('📄 Database file not writable, fixing permissions...');
            fs.chmodSync(dbPath, 0o666);
        }
    }

    return dbPath;
}

// Optional: auto-create directory on import
ensureDatabaseDirectory();

module.exports = { getDatabasePath, ensureDatabaseDirectory };