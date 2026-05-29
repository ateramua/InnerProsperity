
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const DB_FILE_NAME = 'money-manager.db';
const CANONICAL_PROD_DIR_NAME = 'intentflow';

function safeStatSize(filePath) {
    try {
        const st = fs.statSync(filePath);
        return st?.size || 0;
    } catch (_) {
        return 0;
    }
}

function getCanonicalProductionDbPath() {
    const appDataPath = app.getPath('appData');
    // Use a fixed vendor folder to avoid switching when Electron userData changes
    // because of app name / appId / bundle identifier differences across builds.
    return path.join(appDataPath, CANONICAL_PROD_DIR_NAME, DB_FILE_NAME);
}

function getLegacyProductionCandidates() {
    const candidates = [];
    const userDataPath = app.getPath('userData');
    if (userDataPath) {
        candidates.push(path.join(userDataPath, DB_FILE_NAME));
    }
    const appDataPath = app.getPath('appData');
    if (appDataPath) {
        candidates.push(path.join(appDataPath, 'com.intentflow.moneymanager', DB_FILE_NAME));
        candidates.push(path.join(appDataPath, 'IntentFlow', DB_FILE_NAME));
    }
    // Deduplicate while preserving order.
    return [...new Set(candidates)];
}

function migrateLegacyProductionDbIfNeeded(targetDbPath) {
    if (fs.existsSync(targetDbPath)) return;
    const candidates = getLegacyProductionCandidates()
        .filter((p) => p !== targetDbPath && fs.existsSync(p))
        .map((p) => ({ path: p, size: safeStatSize(p) }))
        .sort((a, b) => b.size - a.size);
    if (!candidates.length) return;
    const source = candidates[0];
    if (!source?.path || source.size <= 0) return;
    fs.copyFileSync(source.path, targetDbPath);
    console.log(`📦 Migrated production DB from ${source.path} -> ${targetDbPath} (${source.size} bytes)`);
}

function getDatabasePath() {
    const isPackaged = app.isPackaged;
    let dbPath;

    if (isPackaged) {
        dbPath = getCanonicalProductionDbPath();
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

    if (app.isPackaged) {
        // One-time compatibility move for users coming from prior builds.
        migrateLegacyProductionDbIfNeeded(dbPath);
    }

    // Do not create an empty database file here. Let SQLite create the file when opening
    // it and let initializeDatabase detect whether schema creation is required.
    return dbPath;
}

module.exports = { getDatabasePath, ensureDatabaseDirectory };