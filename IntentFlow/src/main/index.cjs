// src/main/index.cjs
require('dotenv').config();
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');


// ==================== DATABASE CONFIGURATION ====================
// WITH this (use requireModule to find it properly):
const dbConfig = requireModule('../db/database.config.js');
let getConfiguredDatabasePath = dbConfig?.getDatabasePath;
let ensureDatabaseDirectory = dbConfig?.ensureDatabaseDirectory;

const initSchema = requireModule('../db/initSchema.cjs') || require(path.join(__dirname, '../db/initSchema.cjs'));
const { ensureSchema, injectTemporaryRecoveryUser, initializeDatabase } = initSchema || {};

// ✅ FIXED: Proper fallback assignment (no shadowing)
if (!getConfiguredDatabasePath || !ensureDatabaseDirectory) {
    console.error('❌ Database config module not loaded! Using fallback paths.');

    getConfiguredDatabasePath = () => {
        if (app.isPackaged) {
            return path.join(app.getPath('userData'), 'money-manager.db');
        }
        return path.join(__dirname, '../../src/db/data/app.db');
    };

    ensureDatabaseDirectory = () => {
        const dbPath = getConfiguredDatabasePath();
        const dbDir = path.dirname(dbPath);

        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        return dbPath;
    };
}

// ==================== CONSTANTS ====================
const PRELOAD_PATH = path.join(__dirname, '../preload/preload.cjs');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// ==================== HELPER FUNCTIONS FOR PACKAGED APP ====================
function getAppPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'app.asar');
    }
    return path.resolve(__dirname, '../..');
}

function getProductionFilePath(relativePath) {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'out', relativePath);
    }
    return path.join(__dirname, '../../out', relativePath);
}

function requireModule(modulePath) {
    try {
        if (app.isPackaged) {
            const possiblePaths = [
                path.join(process.resourcesPath, 'app.asar', 'src', modulePath.replace('../', '')),
                path.join(process.resourcesPath, 'app', 'src', modulePath.replace('../', '')),
                path.join(__dirname, '..', modulePath.replace('../', ''))
            ];
            for (const testPath of possiblePaths) {
                try {
                    if (fs.existsSync(testPath)) {
                        console.log('✅ Found module at:', testPath);
                        return require(testPath);
                    }
                } catch (e) {
                    console.log('❌ Failed at:', testPath, e.message);
                }
            }
        }
        const cleanPath = modulePath.replace(/^\.\.\//, '');
        const devPath = path.join(__dirname, '..', cleanPath);
        if (fs.existsSync(devPath)) {
            return require(devPath);
        }
        const altPath = path.join(__dirname, '..', '..', 'src', cleanPath);
        if (fs.existsSync(altPath)) {
            return require(altPath);
        }
        throw new Error(`Cannot find module ${modulePath}`);
    } catch (error) {
        console.error(`❌ Failed to load module ${modulePath}:`, error.message);
        return null;
    }
}

// ==================== SERVICES ====================
const CategoryGroupService = requireModule('../services/categories/categoryGroupService.cjs') || class CategoryGroupService {
    async getCategoryGroups(userId) { return []; }
    async getGroupsWithCategories(userId) { return []; }
    async createCategoryGroup(userId, name, sortOrder) { return { id: Date.now() }; }
    async updateCategoryGroup(id, userId, updates) { return {}; }
    async deleteCategoryGroup(id, userId) { return {}; }
};

const ForecastService = requireModule('../services/forecast/forecastService.cjs') || class ForecastService {
    async generateForecast(userId, options) { return {}; }
    async getDailyForecast(userId) { return {}; }
    async getWeeklyForecast(userId, weeks) { return {}; }
    async getYearlyForecast(userId, years) { return {}; }
    async getRecommendations(userId) { return []; }
};

const MoneyMap = requireModule('../services/forecast/moneyMap.cjs') || class MoneyMap {
    async buildMoneyMap(userId) { return {}; }
    async refreshWithBudget(moneyMap, budgetData) { return {}; }
};

const ProsperityOptimizer = requireModule('../services/prosperity/prosperityOptimizer.cjs') || class ProsperityOptimizer {
    async optimizeProsperityMap(userId, totalIncome) { return {}; }
};

const ValidationService = requireModule('../services/forecast/validationService.cjs') || class ValidationService {
    async trackForecastAccuracy(userId, forecastDate, forecastData, actualData) { return {}; }
    async getAccuracyTrends(userId, months) { return {}; }
    async getCategoryAccuracy(userId) { return {}; }
    async calculateConfidenceScore(userId, categoryId) { return 0; }
};

const updateService = requireModule('../services/realtime/updateService.cjs') || { publish: () => { } };
const fileEncryption = requireModule('../services/fileEncryption.cjs') || require(path.join(__dirname, '../services/fileEncryption.cjs'));

const splashModule = requireModule('./splash.cjs') || {
    createSplashWindow: () => null,
    closeSplashWindow: () => { }
};
const { createSplashWindow, closeSplashWindow } = splashModule;

const AccountService = requireModule('../services/accounts/accountService.cjs');
let accountService = null;
if (AccountService) {
    accountService = new AccountService(getDatabase);
} else {
    accountService = {
        getAllAccounts: async (userId) => [],
        getAccountById: async (id, userId) => null,
        createAccount: async (accountData) => ({ id: Date.now() }),
        updateAccount: async (id, userId, updates) => ({}),
        deleteAccount: async (id, userId) => ({}),
        getAccountBalances: async (accountId, userId) => ({}),
        getAccountsSummary: async (userId) => [],
        getTotalsByType: async (userId) => ({}),
        startReconciliation: async (accountId, userId, statementBalance, statementDate) => ({}),
        getCreditCardDetails: async (accountId, userId) => ({}),
        getAccounts: async () => [],
        getAccount: async (accountId) => null,
        getAccountTransactions: async (accountId, limit) => [],
        getAccountsWithSummary: async (userId) => ({}),
        getAccountDetails: async (accountId) => null
    };
}

const userService = requireModule('../services/userService.cjs') || {
    createUser: async (username, password, fullName, email) => ({ id: Date.now() }),
    login: async (username, password) => ({ id: 2, username: 'demo' }),
    logout: () => { },
    getCurrentUser: () => ({ id: 2, username: 'demo' }),
    listUsers: async () => []
};

const settingsService = requireModule('../services/settingsService.cjs') || {
    getGroupsWithCategories: async (budgetId) => []
};

const TransactionService = requireModule('../services/transactions/transactionService.cjs') || class TransactionService {
    constructor(dbPath) {
        this.dbPath = dbPath;
    }
    async getAllTransactions(userId) { return []; }
    async createTransaction(transactionData) { return { id: Date.now() }; }
    async updateTransaction(id, userId, updates) { return {}; }
    async deleteTransaction(id, userId) { return {}; }
    async getAccountTransactions(accountId, userId) { return []; }
    async reconcileAccount(accountId, userId, statementBalance, transactionsToClear) { return {}; }
};

console.log('   - accountService loaded:', !!accountService, '📦📦📦 SERVICE LOADING STATUS 📦📦📦');
console.log('   - accountService.getAccountsSummary exists:', !!(accountService && typeof accountService.getAccountsSummary === 'function'));
console.log('   - userService loaded:', !!userService);
console.log('   - settingsService loaded:', !!settingsService);
console.log('   - TransactionService loaded:', !!TransactionService);
console.log('   - CategoryGroupService loaded:', !!CategoryGroupService);
console.log('   - ForecastService loaded:', !!ForecastService);
console.log('   - MoneyMap loaded:', !!MoneyMap);
console.log('   - ProsperityOptimizer loaded:', !!ProsperityOptimizer);
console.log('   - ValidationService loaded:', !!ValidationService);
console.log('   - updateService loaded:', !!updateService);
console.log('   - splashModule loaded:', !!splashModule);
console.log('=====================================\n');

let mainWindow;
let splashWindow;
let db;
let nativeServer = null;
let ipcHandlersRegistered = false;
let backgroundSyncInterval = null;

// ==================== DATABASE PATH HELPER (UPDATED) ====================
// This function now delegates to the centralized database configuration
function getDatabasePath() {
    const dbPath = getConfiguredDatabasePath();
    console.log(`📂 Database path resolved: ${dbPath}`);
    return dbPath;
}

// ==================== ENCRYPTION HELPERS ====================
function encryptToken(token) {
    if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(token);
        return encrypted.toString('base64');
    }
    console.warn('⚠️ safeStorage not available, storing token in plain text');
    return token;
}

function decryptToken(encryptedBase64) {
    if (!safeStorage.isEncryptionAvailable()) {
        return encryptedBase64;
    }
    try {
        const buffer = Buffer.from(encryptedBase64, 'base64');
        return safeStorage.decryptString(buffer);
    } catch (err) {
        console.warn('Decryption failed, treating as plain text (legacy token)');
        return encryptedBase64;
    }
}

// ==================== DATABASE INITIALIZATION FUNCTIONS ====================
async function initializeProductionDatabase() {
    const dbPath = getConfiguredDatabasePath();
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`📁 Created database directory: ${dbDir}`);
    }

    if (fs.existsSync(dbPath)) {
        console.log('✅ Existing database found at:', dbPath);
        try {
            const stats = fs.statSync(dbPath);
            console.log(`Current permissions: ${stats.mode.toString(8)}`);
            fs.chmodSync(dbPath, 0o666);
            console.log('✅ Set writable permissions on existing database');
            fs.accessSync(dbPath, fs.constants.W_OK);
            console.log('✅ Database is writable');
        } catch (err) {
            console.error('❌ Database permission error:', err.message);
        }
        return dbPath;
    }

    console.log('🆕 No existing database found. Looking for seed...');

    const possibleSeedPaths = [
        path.join(process.resourcesPath, 'db', 'production-seed.db'),
        path.join(process.resourcesPath, 'db', 'data', 'production-seed.db'),
        path.join(__dirname, '../../src/db/data/production-seed.db'),
        path.join(process.resourcesPath, 'app.asar', 'src', 'db', 'data', 'production-seed.db')
    ];

    let seedPath = null;
    for (const testPath of possibleSeedPaths) {
        if (fs.existsSync(testPath)) {
            seedPath = testPath;
            console.log('✅ Found seed database at:', seedPath);
            break;
        }
    }

    if (seedPath && fs.existsSync(seedPath)) {
        try {
            fs.copyFileSync(seedPath, dbPath);
            console.log('📋 Copied seed database to:', dbPath);
            fs.chmodSync(dbPath, 0o666);
            console.log('✅ Set writable permissions (666) on copied database');
            fs.accessSync(dbPath, fs.constants.W_OK);
            console.log('✅ Verified database is writable');
        } catch (err) {
            console.error('❌ Failed to copy seed:', err.message);
        }
    } else {
        console.log('⚠️ No seed database found. Will create fresh database.');
    }

    return dbPath;
}

async function getDatabase() {
    console.log('\n🔍🔍🔍 getDatabase() CALLED 🔍🔍🔍');
    console.log('Current db state:', db ? 'exists' : 'null');

    if (db) {
        try {
            await db.get('SELECT 1');
            console.log('✅ Existing connection is valid');
            return db;
        } catch (e) {
            console.log('⚠️ Database connection stale, reconnecting...');
            db = null;
        }
    }

    console.log('📦 Creating new database connection...');

    const dbPath = ensureDatabaseDirectory();
    console.log('📂 Final database path being used:', dbPath);

    try {
        const sqlite3 = require('sqlite3');
        const { open } = require('sqlite');

        db = await open({ filename: dbPath, driver: sqlite3.Database });
        await db.exec('PRAGMA foreign_keys = ON');
        await db.run('CREATE TABLE IF NOT EXISTS _test (id INTEGER)');
        await db.run('DROP TABLE _test');
        console.log('✅ Write test PASSED');

        const result = await db.get('SELECT 1 as test');
        console.log('✅ Read test PASSED:', result);

        console.log('✅ Database connection established successfully');
        return db;
    } catch (error) {
        console.error('❌❌❌ DATABASE CONNECTION FAILED ❌❌❌');
        console.error('Error message:', error.message);
        console.error('Attempted path:', dbPath);
        throw error;
    }
}


// ==================== DATABASE INITIALIZATION ====================
async function initDatabase() {
    console.log('📦 Initializing database...');

    try {
        const dbPath = ensureDatabaseDirectory();
        const dbDir = path.dirname(dbPath);

        console.log('📂 Database directory:', dbDir);
        console.log('📂 Database path:', dbPath);

        const dbExists = fs.existsSync(dbPath);
        console.log('📂 Database file exists:', dbExists);

        if (!dbExists) {
            console.log('🆕 No existing database found. Creating new database with full schema...');
        }

        // Use the full schema initialization from initSchema.cjs
        const database = await initializeDatabase(dbPath, {
            injectRecoveryUser: false // Automatic startup should only create structure/schema
        });

        console.log('✅ Database initialized successfully with full schema');
        return database;
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        console.error('❌ Error details:', error.message);
        throw error;
    }
}

// ==================== PLAID HELPER FUNCTIONS ====================
async function getCategoryMappings(userId) {
    const db = await getDatabase();
    return await db.all(`
        SELECT plaid_category, category_id
        FROM plaid_category_mappings
        WHERE user_id = ?
    `, [userId]);
}

async function updateAccountBalances(accountId) {
    const db = await getDatabase();
    try {
        await db.run(`
            UPDATE accounts
            SET working_balance = (
                SELECT COALESCE(SUM(amount), 0)
                FROM transactions
                WHERE account_id = ?
            )
            WHERE id = ?
        `, [accountId, accountId]);
        console.log(`✅ Updated balance for account ${accountId}`);
    } catch (error) {
        console.error(`❌ Failed to update balance for account ${accountId}:`, error);
    }
}

async function syncTransactionsForItem(itemId) {
    const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
    const configuration = new Configuration({
        basePath: PlaidEnvironments[process.env.PLAID_ENV],
        baseOptions: {
            headers: {
                'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
                'PLAID-SECRET': process.env.PLAID_SECRET,
            },
        },
    });
    const plaidClient = new PlaidApi(configuration);
    const db = await getDatabase();

    const item = await db.get('SELECT * FROM plaid_items WHERE id = ?', [itemId]);
    if (!item) throw new Error('Item not found');

    const accessToken = decryptToken(item.access_token);
    const cursor = item.cursor || null;

    const linkedAccounts = await db.all(`
        SELECT pa.account_id, a.user_id, pa.plaid_account_id
        FROM plaid_accounts pa
        JOIN accounts a ON pa.account_id = a.id
        WHERE pa.item_id = ?
    `, [itemId]);

    if (linkedAccounts.length === 0) {
        return { success: false, error: 'No linked accounts found for this item' };
    }

    const userId = linkedAccounts[0]?.user_id;
    if (!userId) {
        return { success: false, error: 'No user found for this item' };
    }

    const existingMappings = await getCategoryMappings(userId);

    let added = [], modified = [], removed = [];
    let hasMore = true;
    let nextCursor = cursor;

    while (hasMore) {
        try {
            const request = { access_token: accessToken };
            if (nextCursor) request.cursor = nextCursor;
            const response = await plaidClient.transactionsSync(request);
            added.push(...response.data.added);
            modified.push(...response.data.modified);
            removed.push(...response.data.removed);
            hasMore = response.data.has_more;
            nextCursor = response.data.next_cursor;
        } catch (error) {
            if (error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') {
                console.log(`⚠️ Item ${itemId} requires reauthentication`);
                return { success: false, error: 'ITEM_LOGIN_REQUIRED', itemId };
            }
            throw error;
        }
    }

    let transactionsAdded = 0;
    let transactionsModified = 0;
    let transactionsRemoved = 0;
    const updatedAccounts = new Set();
    const unmappedCategories = new Set();

    const insertTransaction = async (plaidTx, accountId, userId, categoryId) => {
        await db.run(`
            INSERT INTO transactions (
                account_id, user_id, date, description, amount,
                category_id, payee, memo, is_cleared, plaid_transaction_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
            accountId, userId,
            plaidTx.date,
            plaidTx.name,
            plaidTx.amount,
            categoryId,
            plaidTx.merchant_name || null,
            plaidTx.pending ? 'Pending' : null,
            plaidTx.pending ? 0 : 1,
            plaidTx.transaction_id,
        ]);
        updatedAccounts.add(accountId);
    };

    const updateTransaction = async (plaidTx, accountId, userId, categoryId) => {
        await db.run(`
            UPDATE transactions
            SET date = ?, description = ?, amount = ?,
                category_id = ?, payee = ?, memo = ?, is_cleared = ?
            WHERE plaid_transaction_id = ? AND user_id = ?
        `, [
            plaidTx.date,
            plaidTx.name,
            plaidTx.amount,
            categoryId,
            plaidTx.merchant_name || null,
            plaidTx.pending ? 'Pending' : null,
            plaidTx.pending ? 0 : 1,
            plaidTx.transaction_id,
            userId,
        ]);
        updatedAccounts.add(accountId);
    };

    for (const plaidTx of added) {
        const accountLink = linkedAccounts.find(acc => acc.plaid_account_id === plaidTx.account_id);
        if (!accountLink) continue;

        const existing = await db.get(`SELECT id FROM transactions WHERE plaid_transaction_id = ?`, [plaidTx.transaction_id]);
        if (existing) continue;

        const mapping = existingMappings.find(m => m.plaid_category === plaidTx.category);
        const categoryId = mapping ? mapping.category_id : null;
        if (!categoryId && plaidTx.category) unmappedCategories.add(plaidTx.category);

        await insertTransaction(plaidTx, accountLink.account_id, accountLink.user_id, categoryId);
        transactionsAdded++;
    }

    for (const plaidTx of modified) {
        const accountLink = linkedAccounts.find(acc => acc.plaid_account_id === plaidTx.account_id);
        if (!accountLink) continue;

        const mapping = existingMappings.find(m => m.plaid_category === plaidTx.category);
        const categoryId = mapping ? mapping.category_id : null;

        await updateTransaction(plaidTx, accountLink.account_id, accountLink.user_id, categoryId);
        transactionsModified++;
    }

    for (const plaidTx of removed) {
        const existingTx = await db.get(`SELECT account_id FROM transactions WHERE plaid_transaction_id = ?`, [plaidTx.transaction_id]);
        if (existingTx) {
            await db.run(`DELETE FROM transactions WHERE plaid_transaction_id = ?`, [plaidTx.transaction_id]);
            updatedAccounts.add(existingTx.account_id);
            transactionsRemoved++;
        }
    }

    for (const accountId of updatedAccounts) {
        await updateAccountBalances(accountId);
    }

    await db.run(`UPDATE plaid_items SET cursor = ?, last_sync = datetime('now'), updated_at = datetime('now') WHERE id = ?`, [nextCursor, itemId]);

    return {
        success: true,
        transactionsAdded,
        transactionsModified,
        transactionsRemoved,
        unmappedCategories: Array.from(unmappedCategories),
    };
}

async function syncPlaidAccounts(itemId) {
    const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
    const configuration = new Configuration({
        basePath: PlaidEnvironments[process.env.PLAID_ENV],
        baseOptions: {
            headers: {
                'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
                'PLAID-SECRET': process.env.PLAID_SECRET,
            },
        },
    });
    const plaidClient = new PlaidApi(configuration);

    try {
        const db = await getDatabase();
        const item = await db.get('SELECT * FROM plaid_items WHERE id = ?', [itemId]);
        if (!item) throw new Error('Item not found');

        const accessToken = decryptToken(item.access_token);
        if (!accessToken) {
            return { success: false, error: 'TOKEN_DECRYPTION_FAILED', itemId };
        }

        const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
        const plaidAccounts = accountsResponse.data.accounts;

        for (const plaidAccount of plaidAccounts) {
            const existing = await db.get(`SELECT account_id FROM plaid_accounts WHERE plaid_account_id = ?`, [plaidAccount.account_id]);
            if (!existing) {
                let internalType;
                if (plaidAccount.type === 'depository') {
                    internalType = plaidAccount.subtype === 'checking' ? 'checking' : 'savings';
                } else if (plaidAccount.type === 'credit') {
                    internalType = 'credit';
                } else if (plaidAccount.type === 'loan') {
                    internalType = 'loan';
                } else {
                    internalType = 'other';
                }

                const userId = item.user_id;
                const internalAccountId = uuidv4();

                await db.run(`
                    INSERT INTO accounts (id, user_id, name, type, balance, institution, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                `, [
                    internalAccountId,
                    userId,
                    plaidAccount.name,
                    internalType,
                    plaidAccount.balances.current || 0,
                    plaidAccount.official_name || null
                ]);

                await db.run(`
                    INSERT INTO plaid_accounts (plaid_account_id, item_id, account_id, name, official_name, type, subtype, mask)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    plaidAccount.account_id,
                    itemId,
                    internalAccountId,
                    plaidAccount.name,
                    plaidAccount.official_name,
                    plaidAccount.type,
                    plaidAccount.subtype,
                    plaidAccount.mask
                ]);
            }
        }
        return { success: true };
    } catch (error) {
        if (error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') {
            console.warn(`⚠️ Item ${itemId} requires reauthentication`);
            return { success: false, error: 'ITEM_LOGIN_REQUIRED', itemId };
        }
        console.error('Error syncing accounts:', error.response?.data || error.message);
        throw error;
    }
}

async function getLinkedItems() {
    const currentUser = userService.getCurrentUser();
    const db = await getDatabase();
    return await db.all(`
        SELECT * FROM plaid_items WHERE user_id = ? ORDER BY created_at DESC
    `, [currentUser.id]);
}

// ==================== APP INITIALIZATION ====================
app.whenReady().then(async () => {
    console.log('🚀 Starting Money Manager...');
    console.log('🔍 app.isPackaged:', app.isPackaged);
    console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
    console.log('🔍 isDev:', isDev);
    console.log('🔍 Current directory:', __dirname);
    console.log('🔍 Preload path:', PRELOAD_PATH);
    console.log('🔍 Preload exists:', fs.existsSync(PRELOAD_PATH));

    if (createSplashWindow) {
        splashWindow = createSplashWindow();
    }

    try {
        db = await initDatabase();
        console.log('✅ Database initialized successfully');

        setupIpcHandlers();
        console.log('✅ All IPC handlers registered');

        await createWindow();

        backgroundSyncInterval = setInterval(async () => {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return;

            const db = await getDatabase();
            const row = await db.get(`
                SELECT value FROM user_settings WHERE user_id = ? AND key = ?
            `, [currentUser.id, 'autoSyncEnabled']);
            const autoSyncEnabled = row ? row.value !== 'false' : true;
            if (!autoSyncEnabled) {
                console.log('🔁 Background sync disabled by user');
                return;
            }

            console.log('🔄 Running background sync...');
            try {
                const items = await getLinkedItems();
                for (const item of items) {
                    try {
                        await syncPlaidAccounts(item.id);
                        const result = await syncTransactionsForItem(item.id);
                        if (result.success && result.transactionsAdded > 0) {
                            console.log(`✅ Background sync for ${item.institution_name || item.id}: ${result.transactionsAdded} new transactions`);
                        }
                    } catch (err) {
                        console.error(`❌ Background sync failed for item ${item.id}:`, err);
                    }
                }
            } catch (error) {
                console.error('Background sync error:', error);
            }
        }, 3600000);
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        dialog.showErrorBox(
            'Database Error',
            `Failed to initialize database: ${error.message}\n\nThe app will now exit.`
        );
        app.quit();
    }
});

// ==================== WINDOW CREATION ====================
function createWindow() {
    console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
    console.log('🔍 isDev:', isDev);

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        webPreferences: {
            preload: PRELOAD_PATH,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: !isDev,
            allowRunningInsecureContent: isDev,
            devTools: true,
        },
        icon: path.join(__dirname, '../renderer/public/favicon.ico'),
        backgroundColor: '#111827'
    });

    mainWindow = win;

    if (isDev) {
        console.log('🔍 Loading dev URL: http://localhost:3000');
        win.loadURL('http://localhost:3000');
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        const indexPath = getProductionFilePath('index.html');
        console.log('📄 Loading production file:', indexPath);

        if (fs.existsSync(indexPath)) {
            win.loadFile(indexPath).catch(err => {
                console.error('❌ Failed to load index.html:', err);
            });
            win.webContents.openDevTools({ mode: 'right' });
        } else {
            console.error('❌ Production file not found at:', indexPath);
            win.loadURL(`data:text/html;charset=utf-8,
                <html>
                    <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui;">
                        <div style="text-align:center;">
                            <h1>⚠️ Application Error</h1>
                            <p>Production build not found. Please run <code>npm run build</code> first.</p>
                            <p style="color:#666;">${indexPath}</p>
                        </div>
                    </body>
                </html>
            `);
        }
    }

    win.webContents.on('will-navigate', (event, url) => {
        console.log('🔀 Navigation attempt to:', url);

        if (!isDev && url.startsWith('file://')) {
            event.preventDefault();

            const parsedUrl = new URL(url);
            let filePath = parsedUrl.pathname;

            if (filePath.startsWith('/')) {
                filePath = filePath.substring(1);
            }

            if (filePath.startsWith('accounts/')) {
                const accountPagePath = getProductionFilePath('accounts/[id].html');

                if (fs.existsSync(accountPagePath)) {
                    console.log('📄 Loading account page:', accountPagePath);
                    win.loadFile(accountPagePath).catch(err => {
                        console.error('❌ Failed to load account page:', err);
                        win.loadFile(getProductionFilePath('index.html'));
                    });
                } else {
                    console.log('📄 Account page not found, loading index');
                    win.loadFile(getProductionFilePath('index.html'));
                }
            } else {
                const routePath = getProductionFilePath(path.join(filePath, 'index.html'));
                if (fs.existsSync(routePath)) {
                    win.loadFile(routePath);
                } else {
                    win.loadFile(getProductionFilePath('index.html'));
                }
            }
        }
    });

    win.webContents.on('did-finish-load', () => {
        console.log('✅ Page loaded successfully');

        if (splashWindow && closeSplashWindow) {
            closeSplashWindow(splashWindow);
            splashWindow = null;
        }

        if (!isDev) {
            win.webContents.executeJavaScript(`
            const originalPushState = history.pushState;
            history.pushState = function() {
                console.log('🔀 Navigation detected:', arguments);
                originalPushState.apply(this, arguments);
                
                if (window.electronAPI) {
                    window.electronAPI.send('navigation-changed', window.location.pathname);
                }
            };
            
            document.addEventListener('click', (e) => {
                const link = e.target.closest('a');
                if (link && link.href && link.href.startsWith(window.location.origin)) {
                    e.preventDefault();
                    const path = link.href.replace(window.location.origin, '');
                    
                    if (path.startsWith('/accounts/')) {
                        window.electronAPI.send('navigate-to', path);
                    } else {
                        window.location.href = link.href;
                    }
                }
            });
            
            console.log('✅ Client-side routing handler installed');
        `).catch(err => console.error('Failed to inject routing handler:', err));
        }
    });

    win.once('ready-to-show', () => {
        win.show();
        console.log('🔵 Main window ready-to-show');
        win.webContents.openDevTools({ mode: 'right' });
        win.focus();
    });

    return win;
}

// ==================== IPC HANDLERS ====================
function setupIpcHandlers() {
    if (ipcHandlersRegistered) {
        console.log('🔍 IPC handlers already registered, skipping...');
        return;
    }

    console.log('🔍 Starting IPC handler registration...');

    const handlersToRemove = [
        'ping', 'create-user', 'login-user', 'logout-user', 'get-current-user', 'list-users',
        'generateForecast', 'getDailyForecast', 'getWeeklyForecast', 'getYearlyForecast',
        'getRecommendations', 'forecast:generate', 'forecast:daily', 'forecast:weekly',
        'forecast:yearly', 'forecast:recommendations', 'buildMoneyMap', 'refreshMoneyMap',
        'optimizeProsperityMap', 'categoryGroups:getAll', 'categoryGroups:getWithCategories',
        'categoryGroups:create', 'categoryGroups:update', 'categoryGroups:delete',
        'accounts:getAll', 'accounts:getById', 'accounts:create', 'accounts:update',
        'accounts:delete', 'accounts:getBalances', 'accounts:getSummary', 'accounts:getTotals',
        'accounts:startReconciliation', 'accounts:getCreditCardDetails', 'getTransactions',
        'addTransaction', 'updateTransaction', 'deleteTransaction', 'getAccountTransactions',
        'toggleTransactionCleared', 'reconcileAccount', 'get-accounts', 'getAccounts',
        'get-account', 'update-account', 'delete-account', 'get-account-transactions',
        'get-accounts-dashboard', 'get-account-details', 'create-account', 'getCategories',
        'get-categories', 'create-category', 'delete-category', 'update-category',
        'updateCategory', 'get-groups', 'create-group', 'update-group', 'delete-group',
        'get-groups-with-categories', 'save-settings', 'get-network-status',
        'subscribe-to-event', 'publish-event', 'validation:trackAccuracy', 'validation:getTrends',
        'validation:getCategoryAccuracy', 'validation:getConfidence', 'debug-db-path',
        'debug-category-schema', 'deleteCategory', 'debug-account-creation',
        'category:archive', 'category:restore', 'category:getArchived', 'category:toggleHide',
        'debug:test-database-write', 'debug:get-database-info', 'debug:test-group-delete',
        'debug:check-permissions'
    ];

    handlersToRemove.forEach(handler => {
        try { ipcMain.removeHandler(handler); } catch (e) { }
    });

    // ==================== PING HANDLER ====================
    ipcMain.handle('ping', () => {
        console.log('🔍 ping received');
        return { success: true, message: 'pong' };
    });

    // ==================== DEBUG HANDLERS ====================
    ipcMain.handle('debug:test-database-write', async () => {
        console.log('🔍 DEBUG: Testing database write operation...');
        try {
            const db = await getDatabase();
            await db.run('CREATE TABLE IF NOT EXISTS _debug_test (id INTEGER, test TEXT)');
            await db.run("INSERT INTO _debug_test (id, test) VALUES (1, 'test')");
            const result = await db.get('SELECT * FROM _debug_test WHERE id = 1');
            await db.run('DROP TABLE _debug_test');
            console.log('✅ Database write test PASSED');
            return { success: true, message: 'Database is writable', data: result };
        } catch (error) {
            console.error('❌ Database write test FAILED:', error);
            return { success: false, error: error.message };
        }
    });
    // Get scheduled transactions for an account
    ipcMain.handle('scheduled-transactions:get', async (event, accountId) => {
        try {
            const db = await getDatabase(); // Your database connection function
            const transactions = await db.all(
                `SELECT * FROM scheduled_transactions 
       WHERE account_id = ? AND status = 'pending'
       ORDER BY date ASC`,
                [accountId]
            );
            return { success: true, data: transactions };
        } catch (error) {
            console.error('Error getting scheduled transactions:', error);
            return { success: false, error: error.message };
        }
    });

    // Add a scheduled transaction
    ipcMain.handle('scheduled-transactions:add', async (event, data) => {
        try {
            const db = await getDatabase();
            const id = require('uuid').v4();

            await db.run(
                `INSERT INTO scheduled_transactions (
        id, account_id, date, payee, amount, 
        transaction_type, category_id, memo, user_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, data.accountId, data.date, data.payee, data.amount,
                    data.transactionType, data.categoryId, data.memo, data.userId, 'pending'
                ]
            );

            return { success: true, data: { id } };
        } catch (error) {
            console.error('Error adding scheduled transaction:', error);
            return { success: false, error: error.message };
        }
    });
    // In your main process where you set up IPC handlers for accounts
    ipcMain.handle('accounts:scheduled:get', async (event, accountId) => {
        const user = await getUserFromSession(event);
        if (!user) return { success: false, error: 'Not authenticated' };

        const accountService = new AccountService(() => getDatabase());
        const transactions = await accountService.getScheduledTransactions(accountId, user.id);
        return { success: true, data: transactions };
    });

    ipcMain.handle('accounts:scheduled:add', async (event, data) => {
        const user = await getUserFromSession(event);
        if (!user) return { success: false, error: 'Not authenticated' };

        const accountService = new AccountService(() => getDatabase());
        const result = await accountService.addScheduledTransaction({
            ...data,
            userId: user.id
        });
        return { success: true, data: result };
    });

    ipcMain.handle('accounts:scheduled:delete', async (event, id) => {
        const user = await getUserFromSession(event);
        if (!user) return { success: false, error: 'Not authenticated' };

        const accountService = new AccountService(() => getDatabase());
        await accountService.deleteScheduledTransaction(id, user.id);
        return { success: true };
    });

    // Delete a scheduled transaction
    ipcMain.handle('scheduled-transactions:delete', async (event, id) => {
        try {
            const db = await getDatabase();
            await db.run(`DELETE FROM scheduled_transactions WHERE id = ?`, [id]);
            return { success: true };
        } catch (error) {
            console.error('Error deleting scheduled transaction:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('debug:get-database-info', async () => {
        const dbPath = getConfiguredDatabasePath();
        const exists = fs.existsSync(dbPath);
        let writable = false;
        let stats = null;
        if (exists) {
            try {
                fs.accessSync(dbPath, fs.constants.W_OK);
                writable = true;
            } catch (err) { writable = false; }
            stats = fs.statSync(dbPath);
        }
        return {
            success: true,
            data: { path: dbPath, exists, writable, size: stats ? stats.size : 0, isPackaged: app.isPackaged, userData: app.getPath('userData') }
        };
    });

    ipcMain.handle('debug:test-group-delete', async (event, groupId, userId) => {
        console.log('🔍 DEBUG: Testing group delete for group:', groupId, 'user:', userId);
        try {
            const db = await getDatabase();
            const group = await db.get('SELECT * FROM category_groups WHERE id = ? AND user_id = ?', [groupId, userId]);
            if (!group) return { success: false, error: 'Group not found' };
            const categories = await db.all('SELECT * FROM categories WHERE group_id = ? AND archived = 0', [String(groupId)]);
            console.log(`Found ${categories.length} categories in group`);
            if (categories.length > 0) {
                return { success: false, error: `Group has ${categories.length} categories: ${categories.map(c => c.name).join(', ')}` };
            }
            const result = await db.run('DELETE FROM category_groups WHERE id = ? AND user_id = ?', [groupId, userId]);
            return { success: result.changes > 0, changes: result.changes };
        } catch (error) {
            console.error('Debug delete error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('debug:check-permissions', async () => {
        const dbPath = getConfiguredDatabasePath();
        const exists = fs.existsSync(dbPath);
        let permissions = null;
        let writable = false;
        if (exists) {
            const stats = fs.statSync(dbPath);
            permissions = stats.mode.toString(8);
            try { fs.accessSync(dbPath, fs.constants.W_OK); writable = true; } catch (err) { writable = false; }
        }
        return {
            success: true,
            data: { path: dbPath, exists, permissions, writable, directory: path.dirname(dbPath) }
        };
    });

    // ==================== USER MANAGEMENT ====================
    ipcMain.handle('create-user', async (event, { username, password, fullName, email }) => {
        try {
            const user = await userService.createUser(username, password, fullName, email);
            return { success: true, data: user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('login-user', async (event, { username, password }) => {
        try {
            const user = await userService.login(username, password);
            return { success: true, data: user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('logout-user', () => {
        userService.logout();
        return { success: true };
    });

    ipcMain.handle('debug-db-path', () => {
        return {
            success: true,
            data: { isPackaged: app.isPackaged, isDev: isDev, dbPath: getDatabasePath(), userData: app.getPath('userData') }
        };
    });

    ipcMain.handle('get-current-user', () => {
        const user = userService.getCurrentUser();
        return { success: true, data: user };
    });

    ipcMain.handle('backup-database', async (event, password, options = {}) => {
        if (!fileEncryption) {
            return { success: false, error: 'Backup service is unavailable' };
        }

        const dbPath = getDatabasePath();
        if (!fs.existsSync(dbPath)) {
            return { success: false, error: 'No database found to export. Please ensure IntentFlow has been used at least once.' };
        }

        const snapshotPath = path.join(app.getPath('temp'), `intentflow-db-snapshot-${Date.now()}.db`);
        let snapshotCreated = false;

        try {
            if (db && typeof db.exec === 'function') {
                try {
                    await db.exec('PRAGMA wal_checkpoint(FULL)');
                } catch (checkpointError) {
                    console.warn('⚠️ WAL checkpoint failed before snapshot:', checkpointError.message);
                }
            }

            fs.copyFileSync(dbPath, snapshotPath);
            snapshotCreated = true;

            return await fileEncryption.backupDatabase(password, snapshotPath, null, options);
        } catch (error) {
            console.error('❌ Backup database failed:', error);
            if (error.code === 'ENOSPC') {
                return { success: false, error: 'Not enough disk space to create backup. Please free up space and try again.' };
            }
            return { success: false, error: error.message };
        } finally {
            if (snapshotCreated && fs.existsSync(snapshotPath)) {
                try {
                    fs.unlinkSync(snapshotPath);
                } catch (cleanupError) {
                    console.warn('⚠️ Failed to delete backup snapshot:', cleanupError.message);
                }
            }
        }
    });

    ipcMain.handle('restore-database', async (event, password) => {
        if (!fileEncryption) {
            return { success: false, error: 'Backup service is unavailable' };
        }

        const dbPath = getDatabasePath();
        const rollbackTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rollbackPath = path.join(path.dirname(dbPath), `${path.basename(dbPath)}.rollback-${rollbackTimestamp}`);
        let rollbackCreated = false;

        try {
            const selected = await fileEncryption.openEncryptedBackupDialog();
            if (!selected.success) {
                return selected;
            }

            if (fs.existsSync(dbPath)) {
                fs.copyFileSync(dbPath, rollbackPath);
                rollbackCreated = true;
            }

            if (db && typeof db.close === 'function') {
                try {
                    await db.close();
                } catch (closeError) {
                    console.warn('⚠️ Failed closing DB before restore:', closeError.message);
                }
                db = null;
            }

            const result = await fileEncryption.decryptFile(selected.filePath, password, dbPath);
            if (!result.success) {
                if (rollbackCreated && fs.existsSync(rollbackPath)) {
                    try {
                        fs.copyFileSync(rollbackPath, dbPath);
                    } catch (restoreError) {
                        console.error('❌ Failed to restore rollback copy after restore failure:', restoreError.message);
                    }
                }
                return result;
            }

            const restartMessage = 'Backup restored successfully. Restarting the application now.';
            setTimeout(() => {
                app.relaunch();
                app.exit(0);
            }, 600);

            return {
                success: true,
                message: restartMessage,
                rollbackBackup: rollbackCreated ? rollbackPath : null
            };
        } catch (error) {
            console.error('❌ Restore database failed:', error);
            if (rollbackCreated && fs.existsSync(rollbackPath)) {
                try {
                    fs.copyFileSync(rollbackPath, dbPath);
                } catch (restoreError) {
                    console.error('❌ Failed to restore rollback copy after exception:', restoreError.message);
                }
            }
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('saveBudgetToFile', async (event, payload) => {
        if (!fileEncryption) {
            return { success: false, error: 'File encryption service unavailable' };
        }
        return await fileEncryption.saveBudgetToFile(payload.budget, payload.password);
    });

    ipcMain.handle('loadBudgetFromFile', async (event, payload) => {
        if (!fileEncryption) {
            return { success: false, error: 'File encryption service unavailable' };
        }
        return await fileEncryption.loadBudgetFromFile(payload.password);
    });

    ipcMain.handle('exportBudget', async (event, budgetData) => {
        if (!fileEncryption) {
            return { success: false, error: 'File export service unavailable' };
        }
        return await fileEncryption.exportAsJSON(budgetData);
    });

    // Add at the top of the file with other requires
    const payeeService = requireModule('../services/payeeService.cjs');

    // Then in setupIpcHandlers() function, add these handlers:

    // ==================== PAYEE SERVICE IPC HANDLERS ====================

    // Get regular payees for a user
    ipcMain.handle('get-payees', async (event, userId) => {
        try {
            const currentUser = userService.getCurrentUser();
            const effectiveUserId = userId || currentUser?.id;
            if (!effectiveUserId) {
                return { success: false, error: 'No user ID provided', data: [] };
            }
            const regularPayees = await payeeService.getRegularPayees(effectiveUserId);
            return { success: true, data: regularPayees };
        } catch (error) {
            console.error('Error in get-payees:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    // Create or update a payee
    ipcMain.handle('create-or-update-payee', async (event, { name, userId, isTransferPayee }) => {
        try {
            const currentUser = userService.getCurrentUser();
            const effectiveUserId = userId || currentUser?.id;
            if (!effectiveUserId) {
                return { success: false, error: 'No user ID provided' };
            }
            const payeeId = await payeeService.createOrUpdatePayee(name, effectiveUserId);
            return { success: true, data: { id: payeeId } };
        } catch (error) {
            console.error('Error in create-or-update-payee:', error);
            return { success: false, error: error.message };
        }
    });

    // Get payees for transaction form (includes transfer payees)
    ipcMain.handle('get-payees-for-form', async (event, { userId, currentAccountId }) => {
        try {
            const currentUser = userService.getCurrentUser();
            const effectiveUserId = userId || currentUser?.id;
            if (!effectiveUserId) {
                return { success: false, error: 'No user ID provided', data: { transferPayees: [], regularPayees: [] } };
            }
            const result = await payeeService.getPayeesForForm(effectiveUserId, currentAccountId);
            return { success: true, data: result };
        } catch (error) {
            console.error('Error in get-payees-for-form:', error);
            return { success: false, error: error.message, data: { transferPayees: [], regularPayees: [] } };
        }
    });

    // Create a linked transfer transaction (two-sided)
    ipcMain.handle('create-linked-transfer', async (event, transferData) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in' };
            }

            const result = await payeeService.createLinkedTransfer({
                ...transferData,
                userId: currentUser.id
            });

            if (updateService) {
                updateService.publish('transaction:added', result.data);
            }

            return result;
        } catch (error) {
            console.error('Error in create-linked-transfer:', error);
            return { success: false, error: error.message };
        }
    });

    // Update a linked transfer transaction
    ipcMain.handle('update-linked-transfer', async (event, transactionId, updates) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in' };
            }

            const result = await payeeService.updateLinkedTransfer(transactionId, currentUser.id, updates);

            if (updateService) {
                updateService.publish('transaction:updated', result.data);
            }

            return result;
        } catch (error) {
            console.error('Error in update-linked-transfer:', error);
            return { success: false, error: error.message };
        }
    });

    // Delete a linked transfer transaction (both sides)
    ipcMain.handle('delete-linked-transfer', async (event, transactionId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in' };
            }

            const result = await payeeService.deleteLinkedTransfer(transactionId, currentUser.id);

            if (updateService) {
                updateService.publish('transaction:deleted', { id: transactionId });
            }

            return result;
        } catch (error) {
            console.error('Error in delete-linked-transfer:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('list-users', async () => {
        try {
            const users = await userService.listUsers();
            return { success: true, data: users };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== CATEGORY UPDATE HANDLER ====================
    ipcMain.handle('updateCategory', async (event, categoryId, updates) => {
        console.log('📝 updateCategory IPC called:', { categoryId, updates });
        try {
            const db = await getDatabase();

            // Build the SET clause dynamically
            const setClauses = [];
            const values = [];

            if (updates.name !== undefined) {
                setClauses.push('name = ?');
                values.push(updates.name);
            }
            if (updates.assigned !== undefined) {
                setClauses.push('assigned = ?');
                values.push(updates.assigned);
            }
            if (updates.target_amount !== undefined) {
                setClauses.push('target_amount = ?');
                values.push(updates.target_amount);
            }
            if (updates.target_type !== undefined) {
                setClauses.push('target_type = ?');
                values.push(updates.target_type);
            }

            if (setClauses.length === 0) {
                return { success: false, error: 'No updates provided' };
            }

            // Add updated_at timestamp
            setClauses.push('updated_at = datetime("now")');

            values.push(categoryId);

            const query = `UPDATE categories SET ${setClauses.join(', ')} WHERE id = ?`;
            console.log('Executing query:', query, values);

            const result = await db.run(query, values);
            console.log('Query result:', result);

            if (result.changes === 0) {
                return { success: false, error: 'Category not found or no changes made' };
            }

            // Get the updated category
            const updatedCategory = await db.get('SELECT * FROM categories WHERE id = ?', [categoryId]);
            console.log('Updated category:', updatedCategory);

            return { success: true, data: updatedCategory };

        } catch (error) {
            console.error('❌ Error in updateCategory:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== FORECAST HANDLERS ====================
    ipcMain.handle('generateForecast', async (event, userId, options) => {
        try {
            const service = new ForecastService();
            const result = await service.generateForecast(userId, options);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('getDailyForecast', async (event, userId) => {
        try {
            const service = new ForecastService();
            const result = await service.getDailyForecast(userId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('getWeeklyForecast', async (event, userId, weeks) => {
        try {
            const service = new ForecastService();
            const result = await service.getWeeklyForecast(userId, weeks);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('getYearlyForecast', async (event, userId, years) => {
        try {
            const service = new ForecastService();
            const result = await service.getYearlyForecast(userId, years);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('getRecommendations', async (event, userId) => {
        try {
            const service = new ForecastService();
            const result = await service.getRecommendations(userId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== FORECAST HANDLERS (namespaced) ====================
    ipcMain.handle('forecast:generate', async (event, userId, options) => {
        try {
            const service = new ForecastService();
            const result = await service.generateForecast(userId, options);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('forecast:daily', async (event, userId) => {
        try {
            const service = new ForecastService();
            const result = await service.getDailyForecast(userId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('forecast:weekly', async (event, userId, weeks) => {
        try {
            const service = new ForecastService();
            const result = await service.getWeeklyForecast(userId, weeks);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('forecast:yearly', async (event, userId, years) => {
        try {
            const service = new ForecastService();
            const result = await service.getYearlyForecast(userId, years);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('forecast:recommendations', async (event, userId) => {
        try {
            const service = new ForecastService();
            const result = await service.getRecommendations(userId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== MONEY MAP HANDLERS ====================
    ipcMain.handle('buildMoneyMap', async (event, userId) => {
        try {
            const moneyMap = new MoneyMap();
            const result = await moneyMap.buildMoneyMap(userId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('refreshMoneyMap', async (event, moneyMap, budgetData) => {
        try {
            const moneyMapService = new MoneyMap();
            const result = await moneyMapService.refreshWithBudget(moneyMap, budgetData);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== PROSPERITY HANDLERS ====================
    ipcMain.handle('optimizeProsperityMap', async (event, userId, totalIncome) => {
        try {
            const optimizer = new ProsperityOptimizer();
            const result = await optimizer.optimizeProsperityMap(userId, totalIncome);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== VALIDATION HANDLERS ====================
    ipcMain.handle('validation:trackAccuracy', async (event, userId, forecastDate, forecastData, actualData) => {
        try {
            const service = new ValidationService();
            const result = await service.trackForecastAccuracy(userId, forecastDate, forecastData, actualData);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('validation:getTrends', async (event, userId, months) => {
        try {
            const service = new ValidationService();
            const result = await service.getAccuracyTrends(userId, months);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('validation:getCategoryAccuracy', async (event, userId) => {
        try {
            const service = new ValidationService();
            const result = await service.getCategoryAccuracy(userId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('validation:getConfidence', async (event, userId, categoryId) => {
        try {
            const service = new ValidationService();
            const result = await service.calculateConfidenceScore(userId, categoryId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== CATEGORY GROUP HANDLERS ====================
    ipcMain.handle('categoryGroups:getAll', async (event, userId) => {
        console.log('📞 IPC: categoryGroups:getAll called for userId:', userId);
        try {
            const db = await getDatabase();
            const groups = await db.all('SELECT * FROM category_groups WHERE user_id = ? ORDER BY sort_order ASC', [userId]);
            for (const group of groups) {
                const count = await db.get('SELECT COUNT(*) as count FROM categories WHERE group_id = ? AND archived = 0', [String(group.id)]);
                group.category_count = count.count;
            }
            return { success: true, data: groups };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('categoryGroups:getWithCategories', async (event, userId) => {
        try {
            const service = new CategoryGroupService();
            const result = await service.getGroupsWithCategories(userId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('categoryGroups:create', async (event, userId, name, sortOrder) => {
        console.log('📞 IPC: categoryGroups:create called', { userId, name, sortOrder });
        try {
            const db = await getDatabase();
            const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
            if (!user) {
                await db.run(`INSERT OR IGNORE INTO users (id, username, email, full_name) VALUES (?, ?, ?, ?)`, [userId, `user_${userId}`, `user${userId}@example.com`, `User ${userId}`]);
            }
            const result = await db.run(`INSERT INTO category_groups (user_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`, [userId, name, sortOrder || 0]);
            const id = result.lastID;
            const newGroup = await db.get('SELECT * FROM category_groups WHERE id = ?', [id]);
            return { success: true, data: newGroup };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('categoryGroups:update', async (event, id, userId, updates) => {
        console.log('📞 IPC: categoryGroups:update called', { id, userId, updates });
        try {
            const db = await getDatabase();
            const result = await db.run('UPDATE category_groups SET name = ?, updated_at = datetime("now") WHERE id = ? AND user_id = ?', [updates.name, id, userId]);
            if (result.changes === 0) return { success: false, error: 'Failed to update group' };
            const updatedGroup = await db.get('SELECT * FROM category_groups WHERE id = ? AND user_id = ?', [id, userId]);
            return { success: true, data: updatedGroup };
        } catch (error) {
            console.error('❌ Error in categoryGroups:update:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('categoryGroups:delete', async (event, groupId, userId) => {
        console.log('📞 categoryGroups:delete called with:', { groupId, userId });
        try {
            const db = await getDatabase();
            const group = await db.get('SELECT * FROM category_groups WHERE id = ? AND user_id = ?', [groupId, userId]);
            if (!group) return { success: false, error: `Category group with ID ${groupId} not found` };
            const categoriesInGroup = await db.get('SELECT COUNT(*) as count FROM categories WHERE group_id = ? AND archived = 0', [String(groupId)]);
            if (categoriesInGroup.count > 0) {
                return { success: false, error: `Cannot delete "${group.name}" because it contains ${categoriesInGroup.count} categories. Please delete or move all categories from this group first.` };
            }
            const result = await db.run('DELETE FROM category_groups WHERE id = ? AND user_id = ?', [groupId, userId]);
            if (result.changes === 0) return { success: false, error: `Failed to delete category group ${groupId}` };
            return { success: true, data: { id: groupId, name: group.name } };
        } catch (error) {
            console.error('❌ Error in categoryGroups:delete:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== ACCOUNT SERVICE IPC HANDLERS ====================
    ipcMain.handle('accounts:getAll', async (event, userId) => {
        try {
            const effectiveUserId = userId || 2;
            const result = await accountService.getAllAccounts(effectiveUserId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('accounts:getById', async (event, id, userId) => {
        try {
            const db = await getDatabase();
            let account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [id, userId || 2]);
            if (!account) account = await db.get('SELECT * FROM accounts WHERE id = ?', [id]);
            return { success: true, data: account || null };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('create-account', async (event, accountData) => {
        try {
            const db = await getDatabase();
            const id = uuidv4();
            const { userId, name, type, balance = 0, creditLimit, interestRate, dueDate, minimumPayment, originalBalance, termMonths, paymentAmount, nextPaymentDate, institution } = accountData;
            const columns = ['id', 'user_id', 'name', 'type', 'balance', 'cleared_balance', 'working_balance', 'account_type_category', 'currency', 'institution', 'is_active', 'created_at'];
            const values = [id, userId, name, type, balance, 0, 0, 'budget', 'USD', institution || null, 1, new Date().toISOString()];
            if (creditLimit !== undefined) { columns.push('credit_limit'); values.push(type === 'credit' ? creditLimit : null); }
            if (interestRate !== undefined) { columns.push('interest_rate'); values.push(type === 'credit' ? interestRate : null); }
            if (dueDate !== undefined) { columns.push('due_date'); values.push(type === 'credit' ? dueDate : null); }
            if (minimumPayment !== undefined) { columns.push('minimum_payment'); values.push(type === 'credit' ? minimumPayment : null); }
            if (originalBalance !== undefined) { columns.push('original_balance'); values.push(type === 'loan' ? originalBalance : null); }
            if (termMonths !== undefined) { columns.push('term_months'); values.push(type === 'loan' ? termMonths : null); }
            if (paymentAmount !== undefined) { columns.push('payment_amount'); values.push(type === 'loan' ? paymentAmount : null); }
            if (nextPaymentDate !== undefined) { columns.push('next_payment_date'); values.push(type === 'loan' ? nextPaymentDate : null); }
            const placeholders = values.map(() => '?').join(', ');
            await db.run(`INSERT INTO accounts (${columns.join(', ')}) VALUES (${placeholders})`, values);
            return { success: true, id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:create', async (event, accountData) => {
        try {
            const db = await getDatabase();
            let userId = accountData.user_id;
            if (!userId) {
                const currentUser = userService.getCurrentUser();
                userId = currentUser?.id || 2;
            }
            const accountId = uuidv4();
            const now = new Date().toISOString();
            let balance = accountData.balance || 0;
            if (accountData.type === 'credit' || accountData.type === 'loan') balance = -Math.abs(balance);
            else balance = Math.abs(balance);
            const accountToInsert = { id: accountId, user_id: userId, name: accountData.name || 'New Account', type: accountData.type || 'checking', balance, cleared_balance: balance, working_balance: balance, account_type_category: accountData.account_type_category || 'budget', currency: accountData.currency || 'USD', institution: accountData.institution || null, credit_limit: accountData.credit_limit || accountData.limit || null, interest_rate: accountData.interest_rate || accountData.apr || null, due_date: accountData.due_date || accountData.dueDate || null, original_balance: accountData.original_balance || null, term_months: accountData.term_months || null, payment_amount: accountData.payment_amount || null, payment_frequency: accountData.payment_frequency || 'monthly', minimum_payment: accountData.minimum_payment || null, is_active: 1, created_at: now };
            const tableInfo = await db.all("PRAGMA table_info(accounts)");
            const existingColumns = tableInfo.map(col => col.name);
            const columns = ['id', 'user_id', 'name', 'type', 'balance', 'cleared_balance', 'working_balance', 'account_type_category', 'currency', 'institution', 'credit_limit', 'interest_rate', 'due_date', 'minimum_payment', 'is_active', 'created_at'];
            const values = [accountToInsert.id, accountToInsert.user_id, accountToInsert.name, accountToInsert.type, accountToInsert.balance, accountToInsert.cleared_balance, accountToInsert.working_balance, accountToInsert.account_type_category, accountToInsert.currency, accountToInsert.institution, accountToInsert.credit_limit, accountToInsert.interest_rate, accountToInsert.due_date, accountToInsert.minimum_payment, accountToInsert.is_active, accountToInsert.created_at];
            if (existingColumns.includes('original_balance')) { columns.push('original_balance'); values.push(accountToInsert.original_balance); }
            if (existingColumns.includes('term_months')) { columns.push('term_months'); values.push(accountToInsert.term_months); }
            if (existingColumns.includes('payment_amount')) { columns.push('payment_amount'); values.push(accountToInsert.payment_amount); }
            if (existingColumns.includes('payment_frequency')) { columns.push('payment_frequency'); values.push(accountToInsert.payment_frequency); }
            const placeholders = values.map(() => '?').join(', ');
            await db.run(`INSERT INTO accounts (${columns.join(', ')}) VALUES (${placeholders})`, values);
            const newAccount = await db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
            return { success: true, data: newAccount };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:update', async (event, id, userId, updates) => {
        try {
            if (!id) return { success: false, error: 'Account ID is required' };
            if (!userId) return { success: false, error: 'User ID is required' };
            const result = await accountService.updateAccount(id, userId, updates);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:delete', async (event, id, userId) => {
        try {
            if (!id || !userId) return { success: false, error: 'ID and userId required' };
            const db = await getDatabase();
            const result = await db.run('DELETE FROM accounts WHERE id = ? AND user_id = ?', [id, userId]);
            if (result && result.changes > 0) return { success: true };
            return { success: false, error: 'Account not found or already deleted' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:getBalances', async (event, accountId, userId) => {
        try {
            const result = await accountService.getAccountBalances(accountId, userId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:getSummary', async (event, userId) => {
        try {
            const effectiveUserId = userId || 2;
            let result;
            try { result = await accountService.getAccountsSummary(effectiveUserId); } catch (serviceError) { result = []; }
            if (!result || result.length === 0) {
                const db = await getDatabase();
                const directAccounts = await db.all('SELECT * FROM accounts WHERE user_id = ?', [effectiveUserId]);
                result = directAccounts.map(account => ({ id: account.id, name: account.name, type: account.type, balance: account.balance || 0, institution: account.institution || '', account_type_category: account.account_type_category || 'budget', cleared_balance: account.cleared_balance || account.balance || 0, working_balance: account.working_balance || account.balance || 0, currency: account.currency || 'USD', is_active: account.is_active !== 0 }));
            }
            return { success: true, data: result || [] };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('accounts:getTotals', async (event, userId) => {
        try {
            const result = await accountService.getTotalsByType(userId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:startReconciliation', async (event, accountId, userId, statementBalance, statementDate) => {
        try {
            const result = await accountService.startReconciliation(accountId, userId, statementBalance, statementDate);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:getCreditCardDetails', async (event, accountId, userId) => {
        try {
            const result = await accountService.getCreditCardDetails(accountId, userId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== PLAID HANDLERS ====================
    ipcMain.handle('plaid-create-link-token', async () => {
        const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
        const configuration = new Configuration({ basePath: PlaidEnvironments[process.env.PLAID_ENV], baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } } });
        const plaidClient = new PlaidApi(configuration);
        try {
            const currentUser = userService.getCurrentUser();
            const response = await plaidClient.linkTokenCreate({ user: { client_user_id: currentUser.id.toString() }, client_name: 'Money Manager', products: ['transactions'], country_codes: ['US'], language: 'en' });
            return { success: true, link_token: response.data.link_token };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-create-update-link-token', async (event, itemId) => {
        const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
        const configuration = new Configuration({ basePath: PlaidEnvironments[process.env.PLAID_ENV], baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } } });
        const plaidClient = new PlaidApi(configuration);
        try {
            const db = await getDatabase();
            const item = await db.get('SELECT * FROM plaid_items WHERE id = ?', [itemId]);
            if (!item) throw new Error('Item not found');
            const accessToken = decryptToken(item.access_token);
            if (!accessToken) throw new Error('Failed to decrypt token');
            const currentUser = userService.getCurrentUser();
            const response = await plaidClient.linkTokenCreate({ user: { client_user_id: currentUser.id.toString() }, client_name: 'Money Manager', products: ['transactions'], country_codes: ['US'], language: 'en', access_token: accessToken });
            return { success: true, link_token: response.data.link_token };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-exchange-public-token', async (event, publicToken) => {
        const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
        const configuration = new Configuration({ basePath: PlaidEnvironments[process.env.PLAID_ENV], baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } } });
        const plaidClient = new PlaidApi(configuration);
        try {
            const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
            const accessToken = response.data.access_token;
            const itemId = response.data.item_id;
            const currentUser = userService.getCurrentUser();
            const encryptedToken = encryptToken(accessToken);
            const db = await getDatabase();
            const existingItem = await db.get('SELECT * FROM plaid_items WHERE id = ?', [itemId]);
            if (existingItem) await db.run(`UPDATE plaid_items SET access_token = ?, updated_at = datetime('now') WHERE id = ?`, [encryptedToken, itemId]);
            else await db.run(`INSERT INTO plaid_items (id, user_id, access_token, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`, [itemId, currentUser.id, encryptedToken]);
            const instResponse = await plaidClient.itemGet({ access_token: accessToken });
            const institutionId = instResponse.data.item.institution_id;
            if (institutionId) {
                const instData = await plaidClient.institutionsGetById({ institution_id: institutionId, country_codes: ['US'] });
                await db.run(`UPDATE plaid_items SET institution_id = ?, institution_name = ? WHERE id = ?`, [institutionId, instData.data.institution.name, itemId]);
            }
            await syncPlaidAccounts(itemId);
            return { success: true, item_id: itemId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-get-linked-items', async () => {
        try {
            const items = await getLinkedItems();
            return { success: true, data: items };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-sync-item', async (event, itemId) => {
        try {
            const db = await getDatabase();
            const item = await db.get('SELECT * FROM plaid_items WHERE id = ?', [itemId]);
            if (!item) throw new Error('Item not found');
            await syncPlaidAccounts(itemId);
            await db.run(`UPDATE plaid_items SET last_sync = datetime('now'), updated_at = datetime('now') WHERE id = ?`, [itemId]);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-sync-transactions', async (event, itemId) => {
        try {
            return await syncTransactionsForItem(itemId);
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-remove-item', async (event, itemId) => {
        try {
            const db = await getDatabase();
            const currentUser = userService.getCurrentUser();
            const item = await db.get('SELECT * FROM plaid_items WHERE id = ? AND user_id = ?', [itemId, currentUser.id]);
            if (!item) throw new Error('Item not found or not owned by user');
            await db.run('DELETE FROM plaid_accounts WHERE item_id = ?', [itemId]);
            await db.run('DELETE FROM plaid_items WHERE id = ?', [itemId]);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-save-category-mapping', async (event, plaidCategory, categoryId) => {
        try {
            const currentUser = userService.getCurrentUser();
            const db = await getDatabase();
            await db.run(`INSERT INTO plaid_category_mappings (user_id, plaid_category, category_id, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(user_id, plaid_category) DO UPDATE SET category_id = ?, updated_at = datetime('now')`, [currentUser.id, plaidCategory, categoryId, categoryId]);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== USER SETTINGS HANDLERS ====================
    ipcMain.handle('save-user-setting', async (event, key, value) => {
        const currentUser = userService.getCurrentUser();
        if (!currentUser) return { success: false, error: 'Not logged in' };
        const db = await getDatabase();
        await db.run(`INSERT OR REPLACE INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))`, [currentUser.id, key, value]);
        return { success: true };
    });

    ipcMain.handle('get-user-setting', async (event, key, defaultValue) => {
        const currentUser = userService.getCurrentUser();
        if (!currentUser) return { success: true, data: defaultValue };
        const db = await getDatabase();
        const row = await db.get(`SELECT value FROM user_settings WHERE user_id = ? AND key = ?`, [currentUser.id, key]);
        return { success: true, data: row ? row.value : defaultValue };
    });

    // ==================== TRANSACTION HANDLERS ====================
    ipcMain.handle('getAccountTransactions', async (event, accountId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in', data: [] };
            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const transactions = await service.getAccountTransactions(accountId, currentUser.id);
            return { success: true, data: transactions };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('addTransaction', async (event, transaction) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };

            const amount = parseFloat(transaction.amount);
            if (isNaN(amount)) return { success: false, error: 'Invalid amount' };

            // Check if this is a transfer
            if (transaction.isTransfer === 1 && transaction.transferAccountId) {
                // This is a transfer - create linked transactions
                const transferResult = await payeeService.createLinkedTransfer({
                    sourceAccountId: transaction.accountId,
                    destinationAccountId: transaction.transferAccountId,
                    amount: Math.abs(amount),
                    date: transaction.date || new Date().toISOString().split('T')[0],
                    sourcePayeeName: transaction.payee || `Transfer`,
                    memo: transaction.memo || null,
                    cleared: transaction.cleared === 1 || transaction.cleared === true,
                    userId: currentUser.id
                });

                return transferResult;
            }

            // Regular transaction (non-transfer)
            const transactionData = {
                accountId: transaction.accountId,
                userId: currentUser.id,
                date: transaction.date || new Date().toISOString().split('T')[0],
                description: transaction.description || transaction.payee || 'Transaction',
                amount,
                categoryId: transaction.categoryId || null,
                payee: transaction.payee || null,
                memo: transaction.memo || null,
                isCleared: transaction.cleared ? 1 : 0
            };

            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const result = await service.createTransaction(transactionData);

            // Save payee to payees table if it's a regular transaction and payee exists
            if (transaction.payee && !transaction.isTransfer) {
                try {
                    await payeeService.createOrUpdatePayee(transaction.payee, currentUser.id);
                } catch (payeeError) {
                    console.warn('Failed to save payee:', payeeError);
                }
            }

            if (updateService) updateService.publish('transaction:added', result);
            return { success: true, data: result };
        } catch (error) {
            console.error('Error in addTransaction:', error);
            return { success: false, error: error.message };
        }
    })

    ipcMain.handle('updateTransaction', async (event, id, updates) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };

            // Check if this is a transfer transaction
            const database = await getDatabase();
            const transaction = await database.get(
                'SELECT is_transfer FROM transactions WHERE id = ? AND user_id = ?',
                [id, currentUser.id]
            );

            if (transaction && transaction.is_transfer === 1) {
                // This is a transfer - use the linked update handler
                const result = await payeeService.updateLinkedTransfer(id, currentUser.id, updates);
                return result;
            }

            // Regular transaction update
            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const result = await service.updateTransaction(id, currentUser.id, updates);

            if (updateService) updateService.publish('transaction:updated', result);
            return { success: true, data: result };
        } catch (error) {
            console.error('Error in updateTransaction:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('deleteTransaction', async (event, id) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };

            // Check if this is a transfer transaction
            const database = await getDatabase();
            const transaction = await database.get(
                'SELECT is_transfer FROM transactions WHERE id = ? AND user_id = ?',
                [id, currentUser.id]
            );

            if (transaction && transaction.is_transfer === 1) {
                // This is a transfer - use the linked delete handler
                const result = await payeeService.deleteLinkedTransfer(id, currentUser.id);
                return result;
            }

            // Regular transaction delete
            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const result = await service.deleteTransaction(id, currentUser.id);

            if (updateService) updateService.publish('transaction:deleted', { id });
            return { success: true, data: result };
        } catch (error) {
            console.error('Error in deleteTransaction:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('toggleTransactionCleared', async (event, id, clearedStatus) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const result = await service.updateTransaction(id, currentUser.id, { is_cleared: clearedStatus ? 1 : 0 });
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('reconcileAccount', async (event, accountId, statementBalance, transactionsToClear) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const result = await service.reconcileAccount(accountId, currentUser.id, statementBalance, transactionsToClear);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('debug-category-schema', async () => {
        try {
            const db = await getDatabase();
            const tableInfo = await db.all("PRAGMA table_info(categories)");
            return { success: true, data: tableInfo };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('debug-account-creation', async (event, accountData) => {
        console.log('🔍 DEBUG: Testing account creation with data:', accountData);
        return { success: true, data: { message: 'Debug handler - no actual account created', receivedData: accountData } };
    });
    ipcMain.handle('open-external', async (event, url) => {
        await shell.openExternal(url);
    });

    // ==================== CATEGORY HANDLERS ====================
    ipcMain.handle('createCategory', async (event, categoryData) => {
        try {
            const db = await getDatabase();
            let groupId = categoryData.group_id;
            if (groupId) {
                const groupExists = await db.get('SELECT id FROM category_groups WHERE id = ?', [groupId]);
                if (!groupExists) groupId = null;
            }
            const id = categoryData.id || `cat_${Date.now()}`;
            await db.run(`INSERT INTO categories (id, user_id, name, group_id, assigned, target_type, target_amount, target_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, categoryData.user_id, categoryData.name, groupId, categoryData.assigned || 0, categoryData.target_type || 'monthly', categoryData.target_amount || 0, categoryData.target_date || null]);
            const newCategory = await db.get('SELECT * FROM categories WHERE id = ?', [id]);
            return { success: true, data: newCategory };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== ARCHIVE/RESTORE CATEGORY ====================
    ipcMain.handle('category:archive', async (event, categoryId, userId) => {
        try {
            const db = await getDatabase();
            const category = await db.get('SELECT * FROM categories WHERE id = ? AND user_id = ?', [categoryId, userId]);
            if (!category) return { success: false, error: 'Category not found' };
            if (category.archived) return { success: false, error: 'Category is already archived' };
            const originalGroupId = category.group_id;
            await db.run(`UPDATE categories SET archived = 1, archived_at = datetime('now'), original_group_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`, [originalGroupId, categoryId, userId]);
            return { success: true, data: { id: categoryId, archived: true, message: 'Category archived successfully' } };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('category:restore', async (event, categoryId, userId) => {
        try {
            const db = await getDatabase();
            const category = await db.get('SELECT * FROM categories WHERE id = ? AND user_id = ?', [categoryId, userId]);
            if (!category) return { success: false, error: 'Category not found' };
            if (!category.archived) return { success: false, error: 'Category is not archived' };
            let targetGroupId = category.original_group_id;
            if (targetGroupId) {
                const groupExists = await db.get('SELECT id FROM category_groups WHERE id = ? AND user_id = ?', [targetGroupId, userId]);
                if (!groupExists) {
                    let defaultGroup = await db.get('SELECT id FROM category_groups WHERE name = "Uncategorized" AND user_id = ?', [userId]);
                    if (!defaultGroup) {
                        const result = await db.run(`INSERT INTO category_groups (user_id, name, sort_order, created_at, updated_at) VALUES (?, "Uncategorized", 999, datetime('now'), datetime('now'))`, [userId]);
                        targetGroupId = result.lastID;
                    } else targetGroupId = defaultGroup.id;
                }
            }
            await db.run(`UPDATE categories SET archived = 0, group_id = ?, restored_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND user_id = ?`, [targetGroupId, categoryId, userId]);
            return { success: true, data: { id: categoryId, archived: false, group_id: targetGroupId, message: 'Category restored successfully' } };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('category:getArchived', async (event, userId) => {
        try {
            const db = await getDatabase();
            const archivedCategories = await db.all(`SELECT c.*, cg.name as group_name FROM categories c LEFT JOIN category_groups cg ON CAST(cg.id AS TEXT) = c.group_id WHERE c.user_id = ? AND c.archived = 1 ORDER BY c.archived_at DESC`, [userId]);
            return { success: true, data: archivedCategories };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    // ==================== HIDE/UNHIDE CATEGORY ====================
    ipcMain.handle('category:toggleHide', async (event, categoryId, userId) => {
        try {
            const db = await getDatabase();
            const category = await db.get('SELECT is_hidden FROM categories WHERE id = ? AND user_id = ?', [categoryId, userId]);
            if (!category) return { success: false, error: 'Category not found' };
            const newHiddenStatus = category.is_hidden ? 0 : 1;
            await db.run('UPDATE categories SET is_hidden = ?, updated_at = datetime("now") WHERE id = ? AND user_id = ?', [newHiddenStatus, categoryId, userId]);
            return { success: true, data: { id: categoryId, is_hidden: newHiddenStatus } };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('getCategories', async (event, userId) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = userId;
            if (!targetUserId) targetUserId = userService.getCurrentUser()?.id;
            if (!targetUserId) return { success: true, data: [] };
            const categories = await dbConnection.all(`SELECT c.*, cg.name as group_name FROM categories c LEFT JOIN category_groups cg ON CAST(cg.id AS TEXT) = c.group_id WHERE c.user_id = ? AND c.archived = 0 ORDER BY cg.sort_order ASC, c.name ASC`, [targetUserId]);
            return { success: true, data: categories };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('delete-category', async (event, categoryId) => {
        try {
            const db = await getDatabase();
            await db.run('DELETE FROM categories WHERE id = ?', [categoryId]);
            return { success: true, data: { id: categoryId } };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== LEGACY ACCOUNT HANDLERS ====================
    ipcMain.handle('get-accounts', async () => {
        try {
            const accounts = await accountService.getAccounts();
            return { success: true, data: accounts };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('getAccounts', async () => {
        try {
            const currentUser = userService.getCurrentUser();
            const userId = currentUser?.id || 2;
            const accounts = await accountService.getAllAccounts(userId);
            return { success: true, data: accounts };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('get-account', async (event, accountId) => {
        try {
            const account = await accountService.getAccount(accountId);
            return { success: true, data: account };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-account', async (event, accountId, updates) => {
        try {
            const result = await accountService.updateAccount(accountId, updates);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('deleteCategory', async (event, categoryId) => {
        try {
            const db = await getDatabase();
            const transactions = await db.get('SELECT COUNT(*) as count FROM transactions WHERE category_id = ?', [categoryId]);
            if (transactions.count > 0) await db.run('DELETE FROM transactions WHERE category_id = ?', [categoryId]);
            await db.run('DELETE FROM categories WHERE id = ?', [categoryId]);
            return { success: true, data: {} };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-account', async (event, accountId) => {
        try {
            const result = await accountService.deleteAccount(accountId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-account-transactions', async (event, accountId, limit) => {
        try {
            const transactions = await accountService.getAccountTransactions(accountId, limit);
            return { success: true, data: transactions };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('get-accounts-dashboard', async (event) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in', data: null };
            const result = await accountService.getAccountsWithSummary(currentUser.id);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-account-details', async (event, accountId) => {
        try {
            const result = await accountService.getAccountDetails(accountId);
            if (!result) return { success: false, error: 'Account not found' };
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== GROUP MANAGEMENT ====================
    ipcMain.handle('get-groups', async (event, budgetId) => ({ success: true, data: [] }));
    ipcMain.handle('create-group', async (event, group) => ({ success: true, data: { id: 1, ...group } }));
    ipcMain.handle('update-group', async (event, groupId, updates) => ({ success: true, data: { id: groupId, ...updates } }));
    ipcMain.handle('delete-group', async (event, groupId) => ({ success: true, data: {} }));
    ipcMain.handle('create-category', async (event, category) => ({ success: true, data: { id: 1, ...category } }));
    ipcMain.handle('get-groups-with-categories', async (event, budgetId) => {
        try {
            const groups = await settingsService.getGroupsWithCategories(budgetId);
            return { success: true, data: groups };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });
    ipcMain.handle('save-settings', async (event, settings) => ({ success: true, message: 'Settings saved successfully' }));

    // ==================== SUBSCRIPTION HANDLERS ====================
    const subscriptions = new Map();
    ipcMain.handle('subscribe-to-event', (event, eventType) => {
        const windowId = event.sender.id;
        if (!subscriptions.has(windowId)) subscriptions.set(windowId, new Set());
        subscriptions.get(windowId).add(eventType);
        console.log(`📡 Window ${windowId} subscribed to ${eventType}`);
        return { unsubscribe: () => { const windowSubs = subscriptions.get(windowId); if (windowSubs) windowSubs.delete(eventType); } };
    });

    ipcMain.handle('publish-event', async (event, eventType, data) => {
        BrowserWindow.getAllWindows().forEach(win => win.webContents.send(`update:${eventType}`, data));
        return { success: true };
    });

    // ==================== NETWORK STATUS HANDLER ====================
    ipcMain.handle('get-network-status', async () => {
        try {
            const networkInterfaces = os.networkInterfaces();
            const activeInterfaces = [];
            for (const [name, interfaces] of Object.entries(networkInterfaces)) {
                if (!interfaces) continue;
                const nonInternal = interfaces.filter(addr => !addr.internal);
                if (nonInternal.length) activeInterfaces.push({ name, addresses: nonInternal.map(addr => ({ address: addr.address, family: addr.family, mac: addr.mac, netmask: addr.netmask })) });
            }
            const isOnline = activeInterfaces.length > 0;
            return { success: true, data: { isOnline, isOffline: !isOnline, interfaces: activeInterfaces, timestamp: new Date().toISOString(), effectiveType: isOnline ? '4g' : 'none', downlink: isOnline ? 10 : 0, rtt: isOnline ? 50 : 0, saveData: false } };
        } catch (error) {
            return { success: false, error: error.message, data: { isOnline: false, isOffline: true } };
        }
    });

    ipcHandlersRegistered = true;
    console.log('✅ IPC handler registration complete');
}

// ==================== MENU ====================
function createMenu() {
    const template = [
        {
            label: 'File', submenu: [
                { label: 'New Budget', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu-new-budget') },
                { label: 'Open Budget...', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu-open-budget') },
                { type: 'separator' },
                { label: 'Import from CSV...', click: () => mainWindow?.webContents.send('menu-import-csv') },
                { label: 'Export to CSV...', click: () => mainWindow?.webContents.send('menu-export-csv') },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'View', submenu: [
                { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
                { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
                { type: 'separator' }, { role: 'togglefullscreen' }
            ]
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// ==================== APP EVENTS & ERROR HANDLING ====================
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    if (!app.isPackaged) dialog.showErrorBox('An error occurred', error.message);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
    if (backgroundSyncInterval) clearInterval(backgroundSyncInterval);
    if (nativeServer) nativeServer.close();
    if (db && typeof db.close === 'function') db.close();
    else if (db && db.$pool) db.close();
});

createMenu();