
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const runtimeProfile = require('./runtimeProfile.cjs');

const DB_FILE_NAME = runtimeProfile.DB_FILE_NAME;
const CANONICAL_PROD_DIR_NAME = runtimeProfile.CANONICAL_PROD_DIR;

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

function resolveRuntimeProfile() {
    return runtimeProfile.resolveRuntimeProfile({ isPackaged: app.isPackaged });
}

function getDatabasePath() {
    const profile = resolveRuntimeProfile();

    if (profile === runtimeProfile.PROFILES.PRODUCTION) {
        if (process.env.INTENTFLOW_DB_PATH) {
            console.error(
                '❌ INTENTFLOW_DB_PATH is ignored in production — customer data uses Application Support/intentflow/'
            );
        }
        const dbPath = getCanonicalProductionDbPath();
        console.log('📦 Production profile — DB path:', dbPath);
        return dbPath;
    }

    const override = process.env.INTENTFLOW_DB_PATH;
    if (override) {
        const resolved = path.resolve(override);
        runtimeProfile.assertDbPathAllowedForProfile(profile, resolved);
        console.log(`🔧 ${profile} profile — DB path (override):`, resolved);
        return resolved;
    }

    const dbPath = runtimeProfile.getDefaultDevelopmentDbPath();
    console.log(`🔧 ${profile} profile — DB path:`, dbPath);
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
        migrateLegacyProductionDbIfNeeded(dbPath);
    }

    return dbPath;
}

module.exports = {
    getDatabasePath,
    ensureDatabaseDirectory,
    resolveRuntimeProfile,
    getCanonicalProductionDbPath,
    isProductionDatabasePath: runtimeProfile.isProductionDatabasePath,
    isDevelopmentDatabasePath: runtimeProfile.isDevelopmentDatabasePath,
};
