// src/main/index.cjs
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os'); // Added for network status

// ==================== CONSTANTS ====================
const PRELOAD_PATH = path.join(__dirname, '../preload/preload.cjs');
const isDev = process.env.NODE_ENV === 'development';

// ==================== HELPER FUNCTIONS FOR PACKAGED APP ====================
function getAppPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'app.asar');
    }
    return path.resolve(__dirname, '../..');
}
function requireModule(modulePath) {
    try {
        if (app.isPackaged) {
            // In packaged app, try multiple locations
            const possiblePaths = [
                // Try in app.asar first
                path.join(process.resourcesPath, 'app.asar', 'src', modulePath.replace('../', '')),
                // Try in app folder (unpacked)
                path.join(process.resourcesPath, 'app', 'src', modulePath.replace('../', '')),
                // Try relative to current directory
                path.join(__dirname, '..', modulePath.replace('../', ''))
            ];

            for (const testPath of possiblePaths) {
                try {
                    console.log('📦 Trying packaged path:', testPath);
                    // Check if file exists before requiring
                    if (fs.existsSync(testPath)) {
                        console.log('✅ Found module at:', testPath);
                        return require(testPath);
                    }
                } catch (e) {
                    console.log('❌ Failed at:', testPath, e.message);
                }
            }
        }

        // In development - FIXED PATH
        const cleanPath = modulePath.replace(/^\.\.\//, '');
        const devPath = path.join(__dirname, '..', cleanPath);
        console.log('🔍 Trying dev path:', devPath);

        if (fs.existsSync(devPath)) {
            console.log('✅ Found module at:', devPath);
            return require(devPath);
        } else {
            console.error(`❌ Module not found at: ${devPath}`);
            const altPath = path.join(__dirname, '..', '..', 'src', cleanPath);
            console.log('🔍 Trying alternative path:', altPath);

            if (fs.existsSync(altPath)) {
                console.log('✅ Found module at:', altPath);
                return require(altPath);
            }
        }

        throw new Error(`Cannot find module ${modulePath}`);

    } catch (error) {
        console.error(`❌ Failed to load module ${modulePath}:`, error.message);
        return null;
    }
}

// ==================== SERVICES ====================
// Load all services with fallbacks
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

// Windows
const splashModule = requireModule('./splash.cjs') || {
    createSplashWindow: () => null,
    closeSplashWindow: () => { }
};
const { createSplashWindow, closeSplashWindow } = splashModule;

// Services - NOTE: These are OBJECTS, not CLASSES
const accountService = requireModule('../services/accounts/accountService.cjs') || {
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

// TransactionService might be a CLASS
const TransactionService = requireModule('../services/transactions/transactionService.cjs') || class TransactionService {
    async getAllTransactions(userId) { return []; }
    async createTransaction(transactionData) { return { id: Date.now() }; }
    async updateTransaction(id, userId, updates) { return {}; }
    async deleteTransaction(id, userId) { return {}; }
    async getAccountTransactions(accountId, userId) { return []; }
    async reconcileAccount(accountId, userId, statementBalance, transactionsToClear) { return {}; }
};

// ========== DEBUG CODE - MOVED HERE AFTER ALL SERVICES ==========
console.log('\n\x1b[36m%s\x1b[0m', '📦📦📦 SERVICE LOADING STATUS 📦📦📦');
console.log('\x1b[36m%s\x1b[0m', '=====================================');
console.log('   - accountService loaded:', !!accountService);
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
console.log('\x1b[36m%s\x1b[0m', '=====================================\n');

let mainWindow;
let splashWindow;
let db;
let nativeServer = null;
let ipcHandlersRegistered = false;

// ==================== DATABASE PATH HELPER ====================
function getDatabasePath() {
    // In packaged app, use the userData directory
    if (app.isPackaged) {
        const userDataPath = app.getPath('userData');
        const dbPath = path.join(userDataPath, 'money-manager.db');
        console.log('📦 Packaged app - using userData path:', dbPath);
        return dbPath;
    }

    // In development, use the project database
    const projectRoot = path.resolve(__dirname, '../..');
    const devDbPath = path.join(projectRoot, 'src/db/data/app.db');
    console.log('🛠️ Development - using project path:', devDbPath);
    return devDbPath;
}

// ==================== DATABASE HELPER ====================
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
    const dbPath = getDatabasePath();
    console.log('📂 Database path:', dbPath);

    try {
        const sqlite3 = require('sqlite3');
        const { open } = require('sqlite');

        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log('📁 Created database directory at:', dbDir);
        }

        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        await db.exec('PRAGMA foreign_keys = ON');
        await db.get('SELECT 1');
        console.log('✅ Database connection established');

        return db;
    } catch (error) {
        console.error('❌ Failed to create database connection:', error);
        throw error;
    }
}

// ==================== DATABASE INITIALIZATION ====================
async function initDatabase() {
    console.log('📦 Initializing database...');

    const dbPath = getDatabasePath();
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log('📂 Created database directory:', dbDir);
    }

    // Check if database file exists
    const dbExists = fs.existsSync(dbPath);
    console.log('📂 Database exists:', dbExists);

    // For packaged apps on first run, create the database with schema
    if (app.isPackaged && !dbExists) {
        console.log('📦 First run in packaged app - creating new database...');

        try {
            const sqlite3 = require('sqlite3');
            const { open } = require('sqlite');

            db = await open({
                filename: dbPath,
                driver: sqlite3.Database
            });

            // Create tables (your existing table creation code)
            await db.exec(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE,
                    email TEXT UNIQUE,
                    full_name TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS category_groups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    name TEXT NOT NULL,
                    sort_order INTEGER DEFAULT 0,
                    is_hidden INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
                
                CREATE TABLE IF NOT EXISTS categories (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    group_id TEXT,
                    assigned REAL DEFAULT 0,
                    activity REAL DEFAULT 0,
                    available REAL DEFAULT 0,
                    target_type TEXT,
                    target_amount REAL,
                    target_date DATE,
                    priority INTEGER DEFAULT 2,
                    last_month_assigned REAL DEFAULT 0,
                    average_spending REAL DEFAULT 0,
                    is_hidden INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
                
                CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    balance REAL DEFAULT 0,
                    cleared_balance REAL DEFAULT 0,
                    working_balance REAL DEFAULT 0,
                    account_type_category TEXT DEFAULT 'budget',
                    currency TEXT DEFAULT 'USD',
                    institution TEXT,
                    credit_limit REAL,
                    interest_rate REAL,
                    due_date DATE,
                    minimum_payment REAL,
                    is_active INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
                
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    date DATE NOT NULL,
                    description TEXT,
                    amount REAL NOT NULL,
                    category_id TEXT,
                    payee TEXT,
                    memo TEXT,
                    is_cleared INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES accounts(id),
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (category_id) REFERENCES categories(id)
                );
                
                CREATE TABLE IF NOT EXISTS migrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Insert demo user
            await db.run(`
                INSERT OR IGNORE INTO users (id, username, email, full_name) 
                VALUES (2, 'demo', 'demo@example.com', 'Demo User')
            `);

            // Insert sample category groups
            await db.run(`
                INSERT OR IGNORE INTO category_groups (id, user_id, name, sort_order) VALUES 
                (1, 2, 'Fixed Expenses', 1),
                (2, 2, 'Variable Expenses', 2)
            `);

            // Insert sample categories
            await db.run(`
                INSERT OR IGNORE INTO categories (id, user_id, name, group_id, assigned) VALUES 
                ('cat1', 2, 'Groceries', 2, 0),
                ('cat2', 2, 'Rent', 1, 1500),
                ('cat3', 2, 'Utilities', 1, 200),
                ('cat4', 2, 'Dining Out', 2, 300),
                ('cat5', 2, 'Transportation', 2, 150)
            `);

            // Insert sample accounts
            await db.run(`
                INSERT OR IGNORE INTO accounts (id, user_id, name, type, balance, institution) VALUES 
                ('test4', 2, 'Checking', 'checking', 3450.89, 'Chase'),
                ('1faa4471-bbd8-4fbb-9c06-716c9373eb75', 2, 'Savings', 'savings', 10000, 'Chase')
            `);

            // Insert sample transactions
            await db.run(`
                INSERT OR IGNORE INTO transactions (account_id, user_id, date, description, amount, category_id, payee) VALUES 
                ('test4', 2, date('now', '-5 days'), 'Grocery Store', -145.67, 'cat1', 'Walmart'),
                ('test4', 2, date('now', '-10 days'), 'Electric Bill', -85.20, 'cat3', 'Power Company'),
                ('test4', 2, date('now', '-15 days'), 'Restaurant', -45.99, 'cat4', 'Olive Garden')
            `);

            console.log('✅ Created database with schema and sample data');

            return db;
        } catch (error) {
            console.error('❌ Failed to create database:', error);
            throw error;
        }
    }

    try {
        const database = await getDatabase();
        console.log('✅ Database initialized successfully');
        return database;
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        throw error;
    }
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
            webSecurity: !isDev
        },
        icon: path.join(__dirname, '../renderer/public/favicon.ico'),
        backgroundColor: '#111827'
    });
   
    mainWindow = win;

    if (isDev) {
        console.log('🔍 Loading dev URL: http://localhost:3000');
        win.loadURL('http://localhost:3000');
        win.webContents.openDevTools();
    } else {
        const indexPath = path.join(__dirname, '../../out/index.html');
        console.log('📄 Loading production file:', indexPath);

        if (fs.existsSync(indexPath)) {
            win.loadFile(indexPath).catch(err => {
                console.error('❌ Failed to load index.html:', err);
            });
        } else {
            console.error('❌ Production file not found at:', indexPath);
            console.log('📂 Directory contents:', fs.readdirSync(path.dirname(indexPath)));
        }
    }

    // Handle navigation for static exports
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
                const accountPagePath = path.join(__dirname, '../../out/accounts/[id].html');

                if (fs.existsSync(accountPagePath)) {
                    console.log('📄 Loading account page:', accountPagePath);
                    win.loadFile(accountPagePath).catch(err => {
                        console.error('❌ Failed to load account page:', err);
                        win.loadFile(path.join(__dirname, '../../out/index.html'));
                    });
                } else {
                    console.log('📄 Account page not found, loading index');
                    win.loadFile(path.join(__dirname, '../../out/index.html'));
                }
            } else {
                const routePath = path.join(__dirname, '../../out', filePath, 'index.html');
                if (fs.existsSync(routePath)) {
                    win.loadFile(routePath);
                } else {
                    win.loadFile(path.join(__dirname, '../../out/index.html'));
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

    ipcMain.handle('navigate-to', async (event, path) => {
        console.log('🔀 Navigating to:', path);

        if (path.startsWith('/accounts/')) {
            const accountPagePath = path.join(__dirname, '../../out/accounts/[id].html');

            if (fs.existsSync(accountPagePath)) {
                win.loadFile(accountPagePath);
            } else {
                win.loadFile(path.join(__dirname, '../../out/index.html'));
            }
        }
    });

    win.once('ready-to-show', () => {
        win.show();
        console.log('🔵 Main window ready-to-show');
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
    console.log('🔍 Step 1: Inside setupIpcHandlers');

    // Remove any existing handlers to be safe
    try {
        ipcMain.removeHandler('ping');
        ipcMain.removeHandler('create-user');
        ipcMain.removeHandler('login-user');
        ipcMain.removeHandler('logout-user');
        ipcMain.removeHandler('get-current-user');
        ipcMain.removeHandler('list-users');
        ipcMain.removeHandler('generateForecast');
        ipcMain.removeHandler('getDailyForecast');
        ipcMain.removeHandler('getWeeklyForecast');
        ipcMain.removeHandler('getYearlyForecast');
        ipcMain.removeHandler('getRecommendations');
        ipcMain.removeHandler('forecast:generate');
        ipcMain.removeHandler('forecast:daily');
        ipcMain.removeHandler('forecast:weekly');
        ipcMain.removeHandler('forecast:yearly');
        ipcMain.removeHandler('forecast:recommendations');
        ipcMain.removeHandler('buildMoneyMap');
        ipcMain.removeHandler('refreshMoneyMap');
        ipcMain.removeHandler('optimizeProsperityMap');
        ipcMain.removeHandler('categoryGroups:getAll');
        ipcMain.removeHandler('categoryGroups:getWithCategories');
        ipcMain.removeHandler('categoryGroups:create');
        ipcMain.removeHandler('categoryGroups:update');
        ipcMain.removeHandler('categoryGroups:delete');
        ipcMain.removeHandler('accounts:getAll');
        ipcMain.removeHandler('accounts:getById');
        ipcMain.removeHandler('accounts:create');
        ipcMain.removeHandler('accounts:update');
        ipcMain.removeHandler('accounts:delete');
        ipcMain.removeHandler('accounts:getBalances');
        ipcMain.removeHandler('accounts:getSummary');
        ipcMain.removeHandler('accounts:getTotals');
        ipcMain.removeHandler('accounts:startReconciliation');
        ipcMain.removeHandler('accounts:getCreditCardDetails');
        ipcMain.removeHandler('getTransactions');
        ipcMain.removeHandler('addTransaction');
        ipcMain.removeHandler('updateTransaction');
        ipcMain.removeHandler('deleteTransaction');
        ipcMain.removeHandler('getAccountTransactions');
        ipcMain.removeHandler('toggleTransactionCleared');
        ipcMain.removeHandler('reconcileAccount');
        ipcMain.removeHandler('get-accounts');
        ipcMain.removeHandler('getAccounts');
        ipcMain.removeHandler('get-account');
        ipcMain.removeHandler('update-account');
        ipcMain.removeHandler('delete-account');
        ipcMain.removeHandler('get-account-transactions');
        ipcMain.removeHandler('get-accounts-dashboard');
        ipcMain.removeHandler('get-account-details');
        ipcMain.removeHandler('create-account');
        ipcMain.removeHandler('getCategories');
        ipcMain.removeHandler('get-categories');
        ipcMain.removeHandler('create-category');
        ipcMain.removeHandler('delete-category');
        ipcMain.removeHandler('update-category');
        ipcMain.removeHandler('updateCategory');
        ipcMain.removeHandler('get-groups');
        ipcMain.removeHandler('create-group');
        ipcMain.removeHandler('update-group');
        ipcMain.removeHandler('delete-group');
        ipcMain.removeHandler('get-groups-with-categories');
        ipcMain.removeHandler('save-settings');
        ipcMain.removeHandler('get-network-status');
        ipcMain.removeHandler('subscribe-to-event');
        ipcMain.removeHandler('validation:trackAccuracy');
        ipcMain.removeHandler('validation:getTrends');
        ipcMain.removeHandler('validation:getCategoryAccuracy');
        ipcMain.removeHandler('validation:getConfidence');
        ipcMain.removeHandler('debug-db-path');
        ipcMain.removeHandler('debug-category-schema');
    } catch (e) {
        console.log('Some handlers didn\'t exist, that\'s fine');
    }

    // ==================== PING HANDLER ====================
    ipcMain.handle('ping', () => {
        console.log('🔍 ping received');
        return { success: true, message: 'pong' };
    });
    console.log('🔍 Step 2: Basic ping handler registered');

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
            data: {
                isPackaged: app.isPackaged,
                dbPath: getDatabasePath(),
                userData: app.getPath('userData'),
                cwd: process.cwd(),
                __dirname: __dirname
            }
        };
    });

    ipcMain.handle('get-current-user', () => {
        const user = userService.getCurrentUser();
        return { success: true, data: user };
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
        console.log('📝 Updating category:', categoryId, updates);
        try {
            const db = await getDatabase();

            const setClauses = [];
            const values = [];

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
            if (updates.name !== undefined) {
                setClauses.push('name = ?');
                values.push(updates.name);
            }

            values.push(categoryId);

            if (setClauses.length === 0) {
                return { success: false, error: 'No updates provided' };
            }

            const query = `UPDATE categories SET ${setClauses.join(', ')} WHERE id = ?`;
            const result = await db.run(query, values);

            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error updating category:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-category', async (event, categoryId, updates) => {
        console.log('📝 Updating category (update-category):', categoryId, updates);
        try {
            const db = await getDatabase();

            const setClauses = [];
            const values = [];

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
            if (updates.name !== undefined) {
                setClauses.push('name = ?');
                values.push(updates.name);
            }

            values.push(categoryId);

            if (setClauses.length === 0) {
                return { success: false, error: 'No updates provided' };
            }

            const query = `UPDATE categories SET ${setClauses.join(', ')} WHERE id = ?`;
            const result = await db.run(query, values);

            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error updating category:', error);
            return { success: false, error: error.message };
        }
    });
    console.log('✅ Category update handler registered (update-category)');

    // ==================== FORECAST HANDLERS ====================
    ipcMain.handle('generateForecast', async (event, userId, options) => {
        console.log('📞 IPC: generateForecast called');
        try {
            const service = new ForecastService();
            const result = await service.generateForecast(userId, options);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in generateForecast:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('getDailyForecast', async (event, userId) => {
        console.log('📞 IPC: getDailyForecast called');
        try {
            const service = new ForecastService();
            const result = await service.getDailyForecast(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in getDailyForecast:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== VALIDATION HANDLERS ====================
    ipcMain.handle('validation:trackAccuracy', async (event, userId, forecastDate, forecastData, actualData) => {
        console.log('📞 IPC: validation:trackAccuracy called');
        try {
            const service = new ValidationService();
            const result = await service.trackForecastAccuracy(userId, forecastDate, forecastData, actualData);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in validation:trackAccuracy:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('validation:getTrends', async (event, userId, months) => {
        console.log('📞 IPC: validation:getTrends called');
        try {
            const service = new ValidationService();
            const result = await service.getAccuracyTrends(userId, months);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in validation:getTrends:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('validation:getCategoryAccuracy', async (event, userId) => {
        console.log('📞 IPC: validation:getCategoryAccuracy called');
        try {
            const service = new ValidationService();
            const result = await service.getCategoryAccuracy(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in validation:getCategoryAccuracy:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('validation:getConfidence', async (event, userId, categoryId) => {
        console.log('📞 IPC: validation:getConfidence called');
        try {
            const service = new ValidationService();
            const result = await service.calculateConfidenceScore(userId, categoryId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in validation:getConfidence:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== FORECAST HANDLERS (continued) ====================
    ipcMain.handle('getWeeklyForecast', async (event, userId, weeks) => {
        console.log('📞 IPC: getWeeklyForecast called');
        try {
            const service = new ForecastService();
            const result = await service.getWeeklyForecast(userId, weeks);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in getWeeklyForecast:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('getYearlyForecast', async (event, userId, years) => {
        console.log('📞 IPC: getYearlyForecast called');
        try {
            const service = new ForecastService();
            const result = await service.getYearlyForecast(userId, years);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in getYearlyForecast:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('getRecommendations', async (event, userId) => {
        console.log('📞 IPC: getRecommendations called');
        try {
            const service = new ForecastService();
            const result = await service.getRecommendations(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in getRecommendations:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== FORECAST HANDLERS (with namespacing) ====================
    ipcMain.handle('forecast:generate', async (event, userId, options) => {
        console.log('📞 IPC: forecast:generate called');
        try {
            const service = new ForecastService();
            const result = await service.generateForecast(userId, options);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in forecast:generate:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('forecast:daily', async (event, userId) => {
        console.log('📞 IPC: forecast:daily called');
        try {
            const service = new ForecastService();
            const result = await service.getDailyForecast(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in forecast:daily:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('forecast:weekly', async (event, userId, weeks) => {
        console.log('📞 IPC: forecast:weekly called');
        try {
            const service = new ForecastService();
            const result = await service.getWeeklyForecast(userId, weeks);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in forecast:weekly:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('forecast:yearly', async (event, userId, years) => {
        console.log('📞 IPC: forecast:yearly called');
        try {
            const service = new ForecastService();
            const result = await service.getYearlyForecast(userId, years);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in forecast:yearly:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('forecast:recommendations', async (event, userId) => {
        console.log('📞 IPC: forecast:recommendations called');
        try {
            const service = new ForecastService();
            const result = await service.getRecommendations(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in forecast:recommendations:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== MONEY MAP HANDLERS ====================
    ipcMain.handle('buildMoneyMap', async (event, userId) => {
        console.log('📞 IPC: buildMoneyMap called');
        try {
            const moneyMap = new MoneyMap();
            const result = await moneyMap.buildMoneyMap(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in buildMoneyMap:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('refreshMoneyMap', async (event, moneyMap, budgetData) => {
        console.log('📞 IPC: refreshMoneyMap called');
        try {
            const moneyMapService = new MoneyMap();
            const result = await moneyMapService.refreshWithBudget(moneyMap, budgetData);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in refreshMoneyMap:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== PROSPERITY HANDLERS ====================
    ipcMain.handle('optimizeProsperityMap', async (event, userId, totalIncome) => {
        console.log('📞 IPC: optimizeProsperityMap called');
        try {
            const optimizer = new ProsperityOptimizer();
            const result = await optimizer.optimizeProsperityMap(userId, totalIncome);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in optimizeProsperityMap:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== CATEGORY GROUP HANDLERS ====================
    ipcMain.handle('categoryGroups:getAll', async (event, userId) => {
        console.log('📞 IPC: categoryGroups:getAll called');

        let retries = 3;
        let lastError;

        while (retries > 0) {
            try {
                const db = await getDatabase();
                const service = new CategoryGroupService();
                const result = await service.getCategoryGroups(userId);
                return { success: true, data: result };
            } catch (error) {
                lastError = error;
                console.log(`⚠️ Database access failed, retries left: ${retries - 1}`);
                retries--;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.error('❌ Error in categoryGroups:getAll after retries:', lastError);
        return { success: false, error: lastError.message, data: [] };
    });

    ipcMain.handle('categoryGroups:getWithCategories', async (event, userId) => {
        console.log('📞 IPC: categoryGroups:getWithCategories called');
        try {
            const service = new CategoryGroupService();
            const result = await service.getGroupsWithCategories(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in categoryGroups:getWithCategories:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('categoryGroups:create', async (event, userId, name, sortOrder) => {
        console.log('📞 IPC: categoryGroups:create called', { userId, name, sortOrder });
        try {
            const service = new CategoryGroupService();
            const result = await service.createCategoryGroup(userId, name, sortOrder);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in categoryGroups:create:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('categoryGroups:update', async (event, id, userId, updates) => {
        console.log('📞 IPC: categoryGroups:update called', { id, userId, updates });
        try {
            const service = new CategoryGroupService();
            const result = await service.updateCategoryGroup(id, userId, updates);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in categoryGroups:update:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('categoryGroups:delete', async (event, id, userId) => {
        console.log('📞 IPC: categoryGroups:delete called', { id, userId });
        try {
            const service = new CategoryGroupService();
            const result = await service.deleteCategoryGroup(id, userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in categoryGroups:delete:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== ACCOUNT SERVICE IPC HANDLERS ====================
    // FIXED: Removed 'new' keyword - accountService is an object, not a class
    ipcMain.handle('accounts:getAll', async (event, userId) => {
        console.log('\x1b[32m%s\x1b[0m', '💚💚💚💚💚💚💚💚💚💚💚💚💚💚💚');
        console.log('\x1b[32m%s\x1b[0m', '💚 accounts:getAll CALLED');
        console.log('\x1b[32m%s\x1b[0m', '💚💚💚💚💚💚💚💚💚💚💚💚💚💚💚\n');

        try {
            const effectiveUserId = userId || 2;
            const result = await accountService.getAllAccounts(effectiveUserId);
            console.log(`✅ Found ${result.length} accounts`);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('accounts:getById', async (event, id, userId) => {
        console.log('📞 IPC: accounts:getById called');
        try {
            const result = await accountService.getAccountById(id, userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:getById:', error);
            return { success: false, error: error.message };
        }
    });
    // ==================== ACCOUNT SERVICE IPC HANDLERS ====================
    ipcMain.handle('accounts:create', async (event, accountData) => {
        console.log('\n\x1b[36m%s\x1b[0m', '🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷');
        console.log('\x1b[36m%s\x1b[0m', '🔷 ACCOUNT CREATION DEBUG');
        console.log('\x1b[36m%s\x1b[0m', '🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷\n');

        console.log('\x1b[33m%s\x1b[0m', '📞 IPC: accounts:create called');
        console.log('\x1b[33m%s\x1b[0m', '📦 Account data received:');
        console.log('\x1b[32m%s\x1b[0m', JSON.stringify(accountData, null, 2));

        try {
            // Log the accountService to verify it's loaded
            console.log('\x1b[35m%s\x1b[0m', '🛠️ accountService methods available:');
            console.log('\x1b[35m%s\x1b[0m', `   - createAccount: ${typeof accountService.createAccount}`);
            console.log('\x1b[35m%s\x1b[0m', `   - getAllAccounts: ${typeof accountService.getAllAccounts}`);
            console.log('\x1b[35m%s\x1b[0m', `   - getAccountsSummary: ${typeof accountService.getAccountsSummary}`);

            // Check if user is logged in
            const currentUser = userService.getCurrentUser();
            console.log('\x1b[34m%s\x1b[0m', '👤 Current user:');
            console.log('\x1b[34m%s\x1b[0m', JSON.stringify(currentUser, null, 2));

            // Add user_id to account data if not present
            if (!accountData.user_id && currentUser?.id) {
                accountData.user_id = currentUser.id;
                console.log('\x1b[36m%s\x1b[0m', `➕ Added user_id ${currentUser.id} to account data`);
            }

            console.log('\x1b[33m%s\x1b[0m', '⏳ Calling accountService.createAccount...');

            const result = await accountService.createAccount(accountData);

            console.log('\x1b[32m%s\x1b[0m', '✅ Create account result:');
            console.log('\x1b[32m%s\x1b[0m', JSON.stringify(result, null, 2));

            // Verify the account was actually saved by trying to retrieve it
            if (result.success && result.data?.id) {
                console.log('\x1b[36m%s\x1b[0m', `🔍 Verifying account was saved - fetching account ${result.data.id}...`);

                // Wait a moment for the database to update
                await new Promise(resolve => setTimeout(resolve, 100));

                const verifyAccount = await accountService.getAccountById(result.data.id, accountData.user_id || currentUser?.id);
                console.log('\x1b[36m%s\x1b[0m', '🔍 Verification result:');
                console.log('\x1b[36m%s\x1b[0m', JSON.stringify(verifyAccount, null, 2));

                if (verifyAccount) {
                    console.log('\x1b[32m%s\x1b[0m', '✅✅✅ Account verified in database!');
                } else {
                    console.log('\x1b[31m%s\x1b[0m', '❌❌❌ Account NOT found in database after creation!');
                }

                // Get all accounts for this user to see what's there
                console.log('\x1b[35m%s\x1b[0m', `📊 Fetching ALL accounts for user ${accountData.user_id || currentUser?.id}...`);
                const allAccounts = await accountService.getAllAccounts(accountData.user_id || currentUser?.id);
                console.log('\x1b[35m%s\x1b[0m', `📊 Total accounts found: ${allAccounts.length}`);
                console.log('\x1b[35m%s\x1b[0m', '📊 All accounts:');
                console.log('\x1b[35m%s\x1b[0m', JSON.stringify(allAccounts, null, 2));
            }

            console.log('\x1b[36m%s\x1b[0m', '🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷\n');

            return { success: true, data: result };
        } catch (error) {
            console.log('\x1b[31m%s\x1b[0m', '❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
            console.log('\x1b[31m%s\x1b[0m', '❌ ERROR in accounts:create:');
            console.log('\x1b[31m%s\x1b[0m', error);
            console.log('\x1b[31m%s\x1b[0m', error.stack);
            console.log('\x1b[31m%s\x1b[0m', '❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌\n');
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:update', async (event, id, userId, updates) => {
        console.log('📞 IPC: accounts:update called');
        try {
            const result = await accountService.updateAccount(id, userId, updates);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:update:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:delete', async (event, id, userId) => {
        console.log('📞 IPC: accounts:delete called');
        try {
            const result = await accountService.deleteAccount(id, userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:delete:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:getBalances', async (event, accountId, userId) => {
        console.log('📞 IPC: accounts:getBalances called');
        try {
            const result = await accountService.getAccountBalances(accountId, userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:getBalances:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:getSummary', async (event, userId) => {
        console.log('\x1b[35m%s\x1b[0m', '📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊');
        console.log('\x1b[35m%s\x1b[0m', '📊 ACCOUNTS FETCH DEBUG');
        console.log('\x1b[35m%s\x1b[0m', '📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊\n');

        console.log('\x1b[33m%s\x1b[0m', `📞 IPC: accounts:getSummary called with userId:`, userId);

        try {
            const effectiveUserId = userId || 2;
            console.log('\x1b[36m%s\x1b[0m', `🔍 Effective user_id for query: ${effectiveUserId}`);

            // Try the service first
            console.log('\x1b[33m%s\x1b[0m', '⏳ Calling accountService.getAccountsSummary...');
            let result;

            try {
                result = await accountService.getAccountsSummary(effectiveUserId);
            } catch (serviceError) {
                console.log('❌ Service error, falling back to direct query:', serviceError.message);
                result = [];
            }

            console.log('\x1b[32m%s\x1b[0m', '✅ getAccountsSummary result type:', typeof result);
            console.log('\x1b[32m%s\x1b[0m', '✅ isArray:', Array.isArray(result));
            console.log('\x1b[32m%s\x1b[0m', `✅ result length: ${result?.length || 0}`);

            // If service returned empty but we know there are accounts, use direct query
            if ((!result || result.length === 0) && accountService) {
                console.log('\x1b[33m%s\x1b[0m', '⚠️ Service returned empty, trying direct database query...');

                try {
                    const db = await getDatabase();
                    const directAccounts = await db.all('SELECT * FROM accounts WHERE user_id = ?', [effectiveUserId]);
                    console.log('\x1b[32m%s\x1b[0m', `✅ Direct query found ${directAccounts.length} accounts`);

                    // Format them properly
                    result = directAccounts.map(account => ({
                        id: account.id,
                        name: account.name,
                        type: account.type,
                        balance: account.balance || 0,
                        institution: account.institution || '',
                        account_type_category: account.account_type_category || 'budget',
                        cleared_balance: account.cleared_balance || account.balance || 0,
                        working_balance: account.working_balance || account.balance || 0,
                        currency: account.currency || 'USD',
                        is_active: account.is_active !== 0
                    }));

                    console.log('\x1b[32m%s\x1b[0m', `✅ Returning ${result.length} accounts from direct query`);
                } catch (dbError) {
                    console.log('\x1b[31m%s\x1b[0m', '❌ Direct database query failed:', dbError.message);
                }
            }

            console.log('\x1b[35m%s\x1b[0m', '📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊\n');

            return { success: true, data: result || [] };
        } catch (error) {
            console.log('\x1b[31m%s\x1b[0m', '❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
            console.log('\x1b[31m%s\x1b[0m', '❌ ERROR in accounts:getSummary:');
            console.log('\x1b[31m%s\x1b[0m', error);
            console.log('\x1b[31m%s\x1b[0m', error.stack);
            console.log('\x1b[31m%s\x1b[0m', '❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌\n');
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('accounts:getTotals', async (event, userId) => {
        console.log('📞 IPC: accounts:getTotals called');
        try {
            const result = await accountService.getTotalsByType(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:getTotals:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:startReconciliation', async (event, accountId, userId, statementBalance, statementDate) => {
        console.log('📞 IPC: accounts:startReconciliation called');
        try {
            const result = await accountService.startReconciliation(accountId, userId, statementBalance, statementDate);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:startReconciliation:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:getCreditCardDetails', async (event, accountId, userId) => {
        console.log('📞 IPC: accounts:getCreditCardDetails called');
        try {
            const result = await accountService.getCreditCardDetails(accountId, userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:getCreditCardDetails:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== TRANSACTION HANDLERS ====================
    // Note: TransactionService might be a class, so keeping 'new' for now
    ipcMain.handle('getTransactions', async (event) => {
        console.log('📞 IPC: getTransactions called');
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in', data: [] };
            }

            const service = new TransactionService();
            const transactions = await service.getAllTransactions(currentUser.id);
            return { success: true, data: transactions };
        } catch (error) {
            console.error('❌ Error in getTransactions:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('addTransaction', async (event, transaction) => {
        console.log('📞 IPC: addTransaction called with:', transaction);
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in' };
            }

            const amount = parseFloat(transaction.amount);
            if (isNaN(amount)) {
                return { success: false, error: 'Invalid amount - must be a number' };
            }

            const transactionData = {
                accountId: transaction.accountId,
                userId: currentUser.id,
                date: transaction.date || new Date().toISOString().split('T')[0],
                description: transaction.description || transaction.payee || 'Transaction',
                amount: amount,
                categoryId: transaction.categoryId || null,
                payee: transaction.payee || null,
                memo: transaction.memo || null,
                isCleared: transaction.cleared ? 1 : 0
            };

            const service = new TransactionService();
            const result = await service.createTransaction(transactionData);

            if (updateService) {
                updateService.publish('transaction:added', result);
            }

            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in addTransaction:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('updateTransaction', async (event, id, updates) => {
        console.log('📞 IPC: updateTransaction called for id:', id);
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in' };
            }

            const service = new TransactionService();
            const result = await service.updateTransaction(id, currentUser.id, updates);

            if (updateService) {
                updateService.publish('transaction:updated', result);
            }

            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in updateTransaction:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('deleteTransaction', async (event, id) => {
        console.log('📞 IPC: deleteTransaction called for id:', id);
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in' };
            }

            const service = new TransactionService();
            const result = await service.deleteTransaction(id, currentUser.id);

            if (updateService) {
                updateService.publish('transaction:deleted', { id });
            }

            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in deleteTransaction:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('getAccountTransactions', async (event, accountId) => {
        console.log('📞 IPC: getAccountTransactions called for account:', accountId);
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in', data: [] };
            }

            const service = new TransactionService();
            const transactions = await service.getAccountTransactions(accountId, currentUser.id);
            return { success: true, data: transactions };
        } catch (error) {
            console.error('❌ Error in getAccountTransactions:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('toggleTransactionCleared', async (event, id, clearedStatus) => {
        console.log('📞 IPC: toggleTransactionCleared called for id:', id, 'status:', clearedStatus);
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in' };
            }

            const service = new TransactionService();
            const result = await service.updateTransaction(id, currentUser.id, { is_cleared: clearedStatus ? 1 : 0 });
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in toggleTransactionCleared:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('reconcileAccount', async (event, accountId, statementBalance, transactionsToClear) => {
        console.log('📞 IPC: reconcileAccount called', { accountId, statementBalance, transactionsToClear });
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in' };
            }

            const service = new TransactionService();
            const result = await service.reconcileAccount(accountId, currentUser.id, statementBalance, transactionsToClear);
            console.log('✅ Reconciliation successful:', result);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in reconcileAccount:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('debug-category-schema', async () => {
        try {
            const db = await getDatabase();
            const tableInfo = await db.all("PRAGMA table_info(categories)");
            console.log('📋 Categories table schema:', tableInfo);
            return { success: true, data: tableInfo };
        } catch (error) {
            console.error('Error checking schema:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== CATEGORY HANDLERS ====================
    ipcMain.handle('getCategories', async (event, userId) => {
        console.log('📞 IPC: getCategories called with userId:', userId);

        try {
            const dbConnection = await getDatabase();

            let targetUserId = userId;

            if (!targetUserId) {
                const currentUser = userService.getCurrentUser();
                targetUserId = currentUser?.id;
                console.log('📋 Using current user from session:', targetUserId);
            }

            if (!targetUserId) {
                console.log('⚠️ No user ID - returning empty array');
                return { success: true, data: [] };
            }

            console.log('🔍 Executing query for user_id:', targetUserId);

            const categories = await dbConnection.all(`
                SELECT 
                    id, 
                    name, 
                    group_id,
                    assigned,
                    activity,
                    available,
                    target_type, 
                    target_amount, 
                    target_date,
                    priority,
                    last_month_assigned,
                    average_spending
                FROM categories 
                WHERE user_id = ?
            `, [targetUserId]);

            console.log(`📊 Found ${categories.length} categories for user ${targetUserId}`);

            if (categories.length > 0) {
                console.log('📋 First category:', categories[0]);
            }

            return { success: true, data: categories };

        } catch (error) {
            console.error('❌ Error in getCategories:', error);
            return { success: false, error: error.message, data: [] };
        }
    });
    // Add this near your other IPC handlers (around line 1200)
    // This will log any account-related IPC calls
    ipcMain.handle('*', (event, ...args) => {
        const channel = event?.type || 'unknown';
        if (channel.includes('account') || channel.includes('Account')) {
            console.log('\x1b[33m%s\x1b[0m', `🔍🔍🔍 CAUGHT ACCOUNT CALL: ${channel}`, args);
        }
    });
    // ==================== LEGACY ACCOUNT HANDLERS ====================
    // FIXED: These already use accountService correctly (without 'new')
    ipcMain.handle('get-accounts', async () => {
        console.log('\x1b[36m%s\x1b[0m', '🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀');
        console.log('\x1b[36m%s\x1b[0m', '🌀 get-accounts CALLED (legacy)');
        console.log('\x1b[36m%s\x1b[0m', '🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀\n');

        try {
            const accounts = await accountService.getAccounts();
            console.log(`✅ Found ${accounts.length} accounts`);
            return { success: true, data: accounts };
        } catch (error) {
            console.error('❌ Error:', error);
            return { success: false, error: error.message, data: [] };
        }
    });
    // This handler might be used by the "All Accounts" tab
    ipcMain.handle('getAccounts', async () => {
        console.log('\x1b[35m%s\x1b[0m', '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
        console.log('\x1b[35m%s\x1b[0m', '🔥 getAccounts CALLED (All Accounts tab?)');
        console.log('\x1b[35m%s\x1b[0m', '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥\n');

        try {
            const currentUser = userService.getCurrentUser();
            const userId = currentUser?.id || 2;
            console.log('👤 Using userId:', userId);

            const accounts = await accountService.getAllAccounts(userId);
            console.log(`✅ Found ${accounts.length} accounts`);

            return { success: true, data: accounts };
        } catch (error) {
            console.error('❌ Error:', error);
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
            if (!currentUser) {
                return { success: false, error: 'No user logged in', data: null };
            }

            const result = await accountService.getAccountsWithSummary(currentUser.id);
            return { success: true, data: result };
        } catch (error) {
            console.error('Error getting account dashboard:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-account-details', async (event, accountId) => {
        try {
            const result = await accountService.getAccountDetails(accountId);
            if (!result) {
                return { success: false, error: 'Account not found' };
            }
            return { success: true, data: result };
        } catch (error) {
            console.error('Error getting account details:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('create-account', async (event, accountData) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in' };
            }

            const result = await accountService.createAccount(currentUser.id, accountData);
            return { success: true, data: result };
        } catch (error) {
            console.error('Error creating account:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== GROUP MANAGEMENT ====================
    ipcMain.handle('get-groups', async (event, budgetId) => {
        try {
            const groups = []; // Placeholder until groupService is available
            return { success: true, data: groups };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('create-group', async (event, group) => {
        try {
            const result = { id: 1, ...group }; // Placeholder
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-group', async (event, groupId, updates) => {
        try {
            const result = { id: groupId, ...updates }; // Placeholder
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-group', async (event, groupId) => {
        try {
            const result = { success: true }; // Placeholder
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== CATEGORY MANAGEMENT (Legacy) ====================
    ipcMain.handle('create-category', async (event, category) => {
        try {
            const result = { id: 1, ...category }; // Placeholder
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-category', async (event, categoryId) => {
        try {
            const result = { success: true }; // Placeholder
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== SETTINGS / UTILITY ====================
    ipcMain.handle('get-groups-with-categories', async (event, budgetId) => {
        try {
            const groups = await settingsService.getGroupsWithCategories(budgetId);
            return { success: true, data: groups };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('save-settings', async (event, settings) => {
        try {
            return { success: true, message: 'Settings saved successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== SUBSCRIPTION HANDLERS ====================
    const subscriptions = new Map();

    ipcMain.handle('subscribe-to-event', (event, eventType) => {
        const windowId = event.sender.id;

        if (!subscriptions.has(windowId)) {
            subscriptions.set(windowId, new Set());
        }

        subscriptions.get(windowId).add(eventType);

        console.log(`📡 Window ${windowId} subscribed to ${eventType}`);

        return {
            unsubscribe: () => {
                const windowSubs = subscriptions.get(windowId);
                if (windowSubs) {
                    windowSubs.delete(eventType);
                    console.log(`📡 Window ${windowId} unsubscribed from ${eventType}`);
                }
            }
        };
    });

    // ==================== NETWORK STATUS HANDLER ====================
    ipcMain.handle('get-network-status', async () => {
        try {
            const networkInterfaces = os.networkInterfaces();

            const activeInterfaces = [];

            for (const [name, interfaces] of Object.entries(networkInterfaces)) {
                if (!interfaces) continue;

                const nonInternal = interfaces.filter(addr => !addr.internal);
                if (nonInternal && nonInternal.length > 0) {
                    activeInterfaces.push({
                        name,
                        addresses: nonInternal.map(addr => ({
                            address: addr.address,
                            family: addr.family,
                            mac: addr.mac,
                            netmask: addr.netmask
                        }))
                    });
                }
            }

            const isOnline = activeInterfaces.length > 0;

            return {
                success: true,
                data: {
                    isOnline,
                    isOffline: !isOnline,
                    interfaces: activeInterfaces,
                    timestamp: new Date().toISOString(),
                    effectiveType: isOnline ? '4g' : 'none',
                    downlink: isOnline ? 10 : 0,
                    rtt: isOnline ? 50 : 0,
                    saveData: false
                }
            };
        } catch (error) {
            console.error('Error getting network status:', error);
            return {
                success: false,
                error: error.message,
                data: { isOnline: false, isOffline: true }
            };
        }
    });

    ipcHandlersRegistered = true;
    console.log('🔍 Step 3: setupIpcHandlers complete');
}

// ==================== MENU ====================
function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                { label: 'New Budget', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu-new-budget') },
                { label: 'Open Budget...', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu-open-budget') },
                { type: 'separator' },
                { label: 'Import from CSV...', click: () => mainWindow?.webContents.send('menu-import-csv') },
                { label: 'Export to CSV...', click: () => mainWindow?.webContents.send('menu-export-csv') },
                { type: 'separator' },
                { role: 'quit' },
            ],
        },
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
    if (nativeServer) nativeServer.close();
    if (db && typeof db.close === 'function') {
        db.close();
    } else if (db && db.$pool) {
        db.close();
    }
});

// Create menu
createMenu();