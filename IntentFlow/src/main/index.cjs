// src/main/index.cjs
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os'); // Added for network status

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

// ==================== DATABASE PATH HELPER ====================
function getDatabasePath() {
    // Production: use userData directory (~/Library/Application Support/intentflow/money-manager.db)
    if (app.isPackaged || !isDev) {
        const userDataPath = app.getPath('userData');
        const dbPath = path.join(userDataPath, 'money-manager.db');
        console.log('📦 Production - using userData path:', dbPath);
        return dbPath;
    }

    // Development: use project database (./src/db/data/app.db)
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

        // Ensure the directory exists (especially for production)
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
    if ((app.isPackaged || !isDev) && !dbExists) {
        console.log('📦 First run in production - creating new database...');

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
            webSecurity: !isDev,  // Keep disabled in dev, enable in prod
            allowRunningInsecureContent: isDev, // Only in dev
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
        const indexPath = path.join(__dirname, '../../out/index.html');
        console.log('📄 Loading production file:', indexPath);

        if (fs.existsSync(indexPath)) {
            win.loadFile(indexPath).catch(err => {
                console.error('❌ Failed to load index.html:', err);
            });
        } else {
            console.error('❌ Production file not found at:', indexPath);
            console.log('📂 Directory contents:', fs.existsSync(path.dirname(indexPath)) ? fs.readdirSync(path.dirname(indexPath)) : 'Directory does not exist');

            // Show error page
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

    // First, remove any existing handlers to be safe
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
        'subscribe-to-event', 'validation:trackAccuracy', 'validation:getTrends',
        'validation:getCategoryAccuracy', 'validation:getConfidence', 'debug-db-path',
        'debug-category-schema', 'deleteCategory', 'debug-account-creation'
    ];

    handlersToRemove.forEach(handler => {
        try {
            ipcMain.removeHandler(handler);
        } catch (e) {
            // Ignore errors if handler doesn't exist
        }
    });

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
                isDev: isDev,
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
            await db.run(query, values);

            // Fetch and return the updated category
            const updatedCategory = await db.get('SELECT * FROM categories WHERE id = ?', [categoryId]);

            return { success: true, data: updatedCategory };
        } catch (error) {
            console.error('❌ Error updating category:', error);
            return { success: false, error: error.message };
        }
    });

    console.log('✅ Category update handler registered');

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
        console.log('📞 IPC: categoryGroups:getAll called for userId:', userId);
        try {
            const db = await getDatabase();

            // Simple query to get all groups
            const groups = await db.all(
                'SELECT * FROM category_groups WHERE user_id = ? ORDER BY sort_order',
                [userId]
            );

            console.log(`📞 Found ${groups.length} groups in database`);

            if (groups.length > 0) {
                console.log('📞 First group:', groups[0]);
            } else {
                console.log('📞 No groups found for user:', userId);
            }

            return { success: true, data: groups };
        } catch (error) {
            console.error('❌ Error in categoryGroups:getAll:', error);
            return { success: false, error: error.message, data: [] };
        }
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
            const db = await getDatabase();

            // First, check if the user exists
            const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
            console.log('👤 User exists:', user ? 'YES' : 'NO');

            if (!user) {
                console.log('❌ User not found with ID:', userId);
                // Try to create a default user if not exists
                await db.run(`
                INSERT OR IGNORE INTO users (id, username, email, full_name) 
                VALUES (?, ?, ?, ?)
            `, [userId, `user_${userId}`, `user${userId}@example.com`, `User ${userId}`]);
                console.log('✅ Created default user with ID:', userId);
            }

            // Generate a UUID for the group
            const { v4: uuidv4 } = require('uuid');
            const id = uuidv4();

            await db.run(`
            INSERT INTO category_groups (id, user_id, name, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [id, userId, name, sortOrder || 0]);

            // Return the created group
            const newGroup = await db.get('SELECT * FROM category_groups WHERE id = ?', [id]);

            console.log('✅ Group created successfully:', newGroup);
            return { success: true, data: newGroup };
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

    ipcMain.handle('categoryGroups:delete', async (event, groupId, userId) => {
        console.log('📞 IPC: categoryGroups:delete called', { groupId, userId });
        try {
            const db = await getDatabase();

            // First, check if there are any categories in this group
            const categoriesInGroup = await db.get(
                'SELECT COUNT(*) as count FROM categories WHERE group_id = ?',
                [groupId]
            );

            if (categoriesInGroup.count > 0) {
                console.log(`⚠️ Group has ${categoriesInGroup.count} categories, cannot delete`);
                return {
                    success: false,
                    error: 'Cannot delete group that contains categories. Move or delete the categories first.'
                };
            }

            // Delete the group
            await db.run('DELETE FROM category_groups WHERE id = ? AND user_id = ?', [groupId, userId]);

            console.log('✅ Group deleted successfully');
            return { success: true, data: { id: groupId } };
        } catch (error) {
            console.error('❌ Error in categoryGroups:delete:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== ACCOUNT SERVICE IPC HANDLERS ====================
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
        console.log('📞 IPC: accounts:getById called with:', id, userId);
        try {
            const db = await getDatabase();
            console.log('📞 Database connected');

            // Try with userId first
            let account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [id, userId || 2]);
            console.log('📞 Account found with userId:', account ? 'YES' : 'NO');

            // If not found, try without userId
            if (!account) {
                console.log('📞 Trying without userId');
                account = await db.get('SELECT * FROM accounts WHERE id = ?', [id]);
                console.log('📞 Account found without userId:', account ? 'YES' : 'NO');
            }

            return { success: true, data: account || null };
        } catch (error) {
            console.error('❌ Error in accounts:getById:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== UNIFIED ACCOUNT CREATION HANDLER ====================
    // This is the ONLY account creation handler - it handles ALL account types
    ipcMain.handle('create-account', async (event, accountData) => {
        console.log('🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷');
        console.log('🔷 UNIFIED ACCOUNT CREATION');
        console.log('🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷\n');

        console.log('\x1b[33m%s\x1b[0m', '📞 IPC: create-account called');
        console.log('\x1b[33m%s\x1b[0m', '📦 Account data received:');
        console.log('\x1b[32m%s\x1b[0m', JSON.stringify(accountData, null, 2));

        try {
            const db = await getDatabase();

            // Get current user if not provided
            let userId = accountData.user_id;
            if (!userId) {
                const currentUser = userService.getCurrentUser();
                userId = currentUser?.id || 2; // Default to demo user
                console.log(`👤 Using user_id: ${userId}`);
            }

            // Generate a UUID for the account
            const { v4: uuidv4 } = require('uuid');
            const accountId = uuidv4();
            const now = new Date().toISOString();

            // Handle balance based on account type
            let balance = accountData.balance || 0;
            if (accountData.type === 'credit' || accountData.type === 'loan') {
                // Credit cards and loans: negative balance means you owe money
                balance = -Math.abs(balance);
            } else {
                // Checking, savings, etc.: positive balance is money you have
                balance = Math.abs(balance);
            }

            // Map common fields to database columns
            const accountToInsert = {
                id: accountId,
                user_id: userId,
                name: accountData.name || 'New Account',
                type: accountData.type || 'checking',
                balance: balance,
                cleared_balance: balance,
                working_balance: balance,
                account_type_category: accountData.account_type_category || 'budget',
                currency: accountData.currency || 'USD',
                institution: accountData.institution || null,
                // Credit card specific fields
                credit_limit: accountData.credit_limit || accountData.limit || null,
                interest_rate: accountData.interest_rate || accountData.apr || null,
                due_date: accountData.due_date || accountData.dueDate || null,
                // Loan specific fields
                original_balance: accountData.original_balance || null,
                term_months: accountData.term_months || null,
                payment_amount: accountData.payment_amount || null,
                payment_frequency: accountData.payment_frequency || 'monthly',
                // Common fields
                minimum_payment: accountData.minimum_payment || null,
                is_active: 1,
                created_at: now
            };

            console.log('\x1b[34m%s\x1b[0m', '📝 Inserting account:');
            console.log('\x1b[34m%s\x1b[0m', JSON.stringify(accountToInsert, null, 2));

            // First check which columns exist in the accounts table
            const tableInfo = await db.all("PRAGMA table_info(accounts)");
            const existingColumns = tableInfo.map(col => col.name);

            // Build the INSERT query dynamically based on existing columns
            const columns = ['id', 'user_id', 'name', 'type', 'balance', 'cleared_balance',
                'working_balance', 'account_type_category', 'currency', 'institution',
                'credit_limit', 'interest_rate', 'due_date', 'minimum_payment',
                'is_active', 'created_at'];

            const values = [
                accountToInsert.id, accountToInsert.user_id, accountToInsert.name,
                accountToInsert.type, accountToInsert.balance, accountToInsert.cleared_balance,
                accountToInsert.working_balance, accountToInsert.account_type_category,
                accountToInsert.currency, accountToInsert.institution, accountToInsert.credit_limit,
                accountToInsert.interest_rate, accountToInsert.due_date, accountToInsert.minimum_payment,
                accountToInsert.is_active, accountToInsert.created_at
            ];

            // Add loan columns only if they exist in the table
            if (existingColumns.includes('original_balance')) {
                columns.push('original_balance');
                values.push(accountToInsert.original_balance);
            }
            if (existingColumns.includes('term_months')) {
                columns.push('term_months');
                values.push(accountToInsert.term_months);
            }
            if (existingColumns.includes('payment_amount')) {
                columns.push('payment_amount');
                values.push(accountToInsert.payment_amount);
            }
            if (existingColumns.includes('payment_frequency')) {
                columns.push('payment_frequency');
                values.push(accountToInsert.payment_frequency);
            }

            const placeholders = values.map(() => '?').join(', ');
            const query = `INSERT INTO accounts (${columns.join(', ')}) VALUES (${placeholders})`;

            await db.run(query, values);

            console.log('✅ Account created with ID:', accountId);

            // Fetch and return the created account
            const newAccount = await db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);

            console.log('\x1b[32m%s\x1b[0m', '✅ Create account result:');
            console.log('\x1b[32m%s\x1b[0m', JSON.stringify(newAccount, null, 2));
            console.log('🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷🔷\n');

            return { success: true, data: newAccount };
        } catch (error) {
            console.log('\x1b[31m%s\x1b[0m', '❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
            console.log('\x1b[31m%s\x1b[0m', '❌ ERROR in create-account:');
            console.log('\x1b[31m%s\x1b[0m', error);
            console.log('\x1b[31m%s\x1b[0m', error.stack);
            console.log('\x1b[31m%s\x1b[0m', '❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌\n');
            return { success: false, error: error.message };
        }
    });

    // Keep accounts:create for backward compatibility, but it just forwards to create-account
    ipcMain.handle('accounts:create', async (event, accountData) => {
        console.log('🔄 Forwarding accounts:create to unified create-account handler');

        // Instead of using ipcMain._handlers, we'll duplicate the core logic
        // This avoids the undefined _handlers issue
        try {
            const db = await getDatabase();

            // Get current user if not provided
            let userId = accountData.user_id;
            if (!userId) {
                const currentUser = userService.getCurrentUser();
                userId = currentUser?.id || 2;
                console.log(`👤 Using user_id: ${userId}`);
            }

            // Generate a UUID for the account
            const { v4: uuidv4 } = require('uuid');
            const accountId = uuidv4();
            const now = new Date().toISOString();

            // Handle balance based on account type
            let balance = accountData.balance || 0;
            if (accountData.type === 'credit' || accountData.type === 'loan') {
                balance = -Math.abs(balance);
            } else {
                balance = Math.abs(balance);
            }

            // Map common fields to database columns
            const accountToInsert = {
                id: accountId,
                user_id: userId,
                name: accountData.name || 'New Account',
                type: accountData.type || 'checking',
                balance: balance,
                cleared_balance: balance,
                working_balance: balance,
                account_type_category: accountData.account_type_category || 'budget',
                currency: accountData.currency || 'USD',
                institution: accountData.institution || null,
                credit_limit: accountData.credit_limit || accountData.limit || null,
                interest_rate: accountData.interest_rate || accountData.apr || null,
                due_date: accountData.due_date || accountData.dueDate || null,
                original_balance: accountData.original_balance || null,
                term_months: accountData.term_months || null,
                payment_amount: accountData.payment_amount || null,
                payment_frequency: accountData.payment_frequency || 'monthly',
                minimum_payment: accountData.minimum_payment || null,
                is_active: 1,
                created_at: now
            };

            // First check which columns exist in the accounts table
            const tableInfo = await db.all("PRAGMA table_info(accounts)");
            const existingColumns = tableInfo.map(col => col.name);

            // Build the INSERT query dynamically based on existing columns
            const columns = ['id', 'user_id', 'name', 'type', 'balance', 'cleared_balance',
                'working_balance', 'account_type_category', 'currency', 'institution',
                'credit_limit', 'interest_rate', 'due_date', 'minimum_payment',
                'is_active', 'created_at'];

            const values = [
                accountToInsert.id, accountToInsert.user_id, accountToInsert.name,
                accountToInsert.type, accountToInsert.balance, accountToInsert.cleared_balance,
                accountToInsert.working_balance, accountToInsert.account_type_category,
                accountToInsert.currency, accountToInsert.institution, accountToInsert.credit_limit,
                accountToInsert.interest_rate, accountToInsert.due_date, accountToInsert.minimum_payment,
                accountToInsert.is_active, accountToInsert.created_at
            ];

            // Add loan columns only if they exist in the table
            if (existingColumns.includes('original_balance')) {
                columns.push('original_balance');
                values.push(accountToInsert.original_balance);
            }
            if (existingColumns.includes('term_months')) {
                columns.push('term_months');
                values.push(accountToInsert.term_months);
            }
            if (existingColumns.includes('payment_amount')) {
                columns.push('payment_amount');
                values.push(accountToInsert.payment_amount);
            }
            if (existingColumns.includes('payment_frequency')) {
                columns.push('payment_frequency');
                values.push(accountToInsert.payment_frequency);
            }

            const placeholders = values.map(() => '?').join(', ');
            const query = `INSERT INTO accounts (${columns.join(', ')}) VALUES (${placeholders})`;

            await db.run(query, values);

            console.log('✅ Account created with ID:', accountId);

            // Fetch and return the created account
            const newAccount = await db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);

            return { success: true, data: newAccount };
        } catch (error) {
            console.error('❌ ERROR in accounts:create forwarder:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:update', async (event, id, userId, updates) => {
        console.log('📞 IPC: accounts:update called');
        console.log('📝 Account ID:', id);
        console.log('👤 User ID:', userId);
        console.log('📦 Updates:', JSON.stringify(updates, null, 2));

        try {
            if (!id) {
                return { success: false, error: 'Account ID is required' };
            }
            if (!userId) {
                return { success: false, error: 'User ID is required' };
            }
            if (!updates || Object.keys(updates).length === 0) {
                return { success: false, error: 'No updates provided' };
            }

            const result = await accountService.updateAccount(id, userId, updates);
            console.log('✅ Update successful:', result);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:update:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:delete', async (event, id, userId) => {
        console.log('📞 IPC: accounts:delete called');
        console.log('📝 Account ID:', id);
        console.log('👤 User ID:', userId);

        try {
            if (!id) {
                return { success: false, error: 'Account ID is required' };
            }
            if (!userId) {
                return { success: false, error: 'User ID is required' };
            }

            const result = await accountService.deleteAccount(id, userId);
            console.log('✅ Delete successful:', result);
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
            console.log(`🔍 Effective user_id for query: ${effectiveUserId}`);

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

            // If service returned empty, try direct database query
            if (!result || result.length === 0) {
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

    ipcMain.handle('debug-account-creation', async (event, accountData) => {
        console.log('🔍 DEBUG: Testing account creation with data:');
        console.log(JSON.stringify(accountData, null, 2));

        return {
            success: true,
            data: {
                message: 'Debug handler - no actual account created',
                receivedData: accountData,
                timestamp: new Date().toISOString()
            }
        };
    });

    // ==================== CATEGORY HANDLERS ====================
    ipcMain.handle('createCategory', async (event, categoryData) => {
        console.log('📞 IPC: createCategory called with:', JSON.stringify(categoryData, null, 2));
        try {
            const db = await getDatabase();

            // Log all available groups for debugging
            const allGroups = await db.all('SELECT id, name FROM category_groups');
            console.log('📋 Available groups in database:', allGroups);

            // Handle group_id - if it's provided, make sure it exists
            let groupId = categoryData.group_id;

            if (groupId) {
                console.log('🔍 Checking if group exists with ID:', groupId);

                // Check if the group exists (case-sensitive comparison)
                const groupExists = await db.get('SELECT id FROM category_groups WHERE id = ?', [groupId]);

                if (groupExists) {
                    console.log('✅ Group found with ID:', groupId);
                } else {
                    console.log('❌ Group NOT found with ID:', groupId);
                    console.log('⚠️ Setting group_id to NULL');
                    groupId = null;
                }
            } else {
                console.log('ℹ️ No group_id provided, setting to NULL');
            }

            // Generate a unique ID for the category
            const id = categoryData.id || `cat_${Date.now()}`;

            console.log('📝 Inserting category with group_id:', groupId);

            await db.run(`
            INSERT INTO categories (
                id, user_id, name, group_id, assigned, 
                target_type, target_amount, target_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
                id,
                categoryData.user_id,
                categoryData.name,
                groupId,
                categoryData.assigned || 0,
                categoryData.target_type || 'monthly',
                categoryData.target_amount || 0,
                categoryData.target_date || null
            ]);

            // Fetch and return the created category
            const newCategory = await db.get('SELECT * FROM categories WHERE id = ?', [id]);

            console.log('✅ Category created successfully:', newCategory);
            return { success: true, data: newCategory };
        } catch (error) {
            console.error('❌ Error in createCategory:', error);
            return { success: false, error: error.message };
        }
    });

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

    ipcMain.handle('delete-category', async (event, categoryId) => {
        console.log('📞 IPC: delete-category called:', categoryId);
        try {
            const db = await getDatabase();
            await db.run('DELETE FROM categories WHERE id = ?', [categoryId]);
            return { success: true, data: { id: categoryId } };
        } catch (error) {
            console.error('❌ Error in delete-category:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== LEGACY ACCOUNT HANDLERS ====================
    ipcMain.handle('get-accounts', async () => {
        console.log('🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀');
        console.log('🌀 get-accounts CALLED (legacy)');
        console.log('🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀🌀\n');

        try {
            const accounts = await accountService.getAccounts();
            console.log(`✅ Found ${accounts.length} accounts`);
            return { success: true, data: accounts };
        } catch (error) {
            console.error('❌ Error:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

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

    ipcMain.handle('deleteCategory', async (event, categoryId) => {
        console.log('🗑️ deleteCategory called with ID:', categoryId);
        try {
            const db = await getDatabase();

            // Check if category has transactions
            const transactions = await db.get(
                'SELECT COUNT(*) as count FROM transactions WHERE category_id = ?',
                categoryId
            );

            if (transactions.count > 0) {
                // Option: delete transactions first or return error
                await db.run('DELETE FROM transactions WHERE category_id = ?', categoryId);
            }

            const result = await db.run('DELETE FROM categories WHERE id = ?', categoryId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error deleting category:', error);
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