// src/main/index.cjs
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os'); // Added for network status

// ==================== CONSTANTS ====================
const PRELOAD_PATH = path.join(__dirname, '../preload/preload.cjs');
const isDev = process.env.NODE_ENV === 'development' && !app.isPackaged;

// ==================== SERVICES ====================
const CategoryGroupService = require('../services/categories/categoryGroupService.cjs');
const ForecastService = require('../services/forecast/forecastService.cjs');
const MoneyMap = require('../services/forecast/moneyMap.cjs');
const ProsperityOptimizer = require('../services/prosperity/prosperityOptimizer.cjs');
const ValidationService = require('../services/forecast/validationService.cjs');
const updateService = require('../services/realtime/updateService.cjs');

// Windows
const { createSplashWindow, closeSplashWindow } = require('./splash.cjs');

// Services
const accountService = require('../services/accounts/accountService.cjs');
const userService = require('../services/userService.cjs');
const settingsService = require('../services/settingsService.cjs');
const TransactionService = require('../services/transactions/transactionService.cjs');

// ==================== GLOBAL VARIABLES ====================
let mainWindow;
let splashWindow;
let db;
let nativeServer = null;
let ipcHandlersRegistered = false; // Flag to prevent duplicate registration

// ==================== DATABASE PATH HELPER ====================
function getDatabasePath() {
    // Use the database that has all your tables
    const projectRoot = path.resolve(__dirname, '../..');
    const dbPath = path.join(projectRoot, 'src/db/data/app.db');

    console.log('📂 Database path:', dbPath);
    console.log('📂 Database exists:', fs.existsSync(dbPath));

    return dbPath;
}

// ==================== DATABASE HELPER ====================
async function getDatabase() {
    console.log('🔍 getDatabase called, current db state:', db ? 'exists' : 'null');

    // If we already have a connection, return it
    if (db) {
        try {
            // Test the connection with a simple query
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

        // Ensure directory exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log('📁 Created database directory at:', dbDir);
        }

        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        // Enable foreign keys
        await db.exec('PRAGMA foreign_keys = ON');

        // Test the connection
        await db.get('SELECT 1');

        console.log('✅ Database connection established');

        // Check if we need to run migrations (for production new installs)
        if (app.isPackaged) {
            const migrationsTable = await db.get(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'"
            );

            if (!migrationsTable) {
                console.log('🔄 New database detected, running migrations...');
                try {
                    const { runMigrations } = require('../db/migrations/index.cjs');
                    await runMigrations(db);
                    console.log('✅ Migrations completed successfully');
                } catch (migrationError) {
                    console.error('❌ Migrations failed:', migrationError);
                }
            }
        }
    } catch (error) {
        console.error('❌ Failed to create database connection:', error);
        throw error;
    }

    return db;
}

// ==================== DATABASE INITIALIZATION ====================
async function initDatabase() {
    console.log('📦 Initializing database...');
    const dbPath = getDatabasePath();
    const dbDir = path.dirname(dbPath);

    // Ensure the directory exists
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log('📂 Created database directory:', dbDir);
    }

    // Check if database file exists (only in development)
    if (!app.isPackaged) {
        if (!fs.existsSync(dbPath)) {
            console.log('📁 Creating development database...');
        }
    }

    try {
        // Actually open the database connection
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

    // Create and show splash screen
    splashWindow = createSplashWindow();

    try {
        // Initialize database for real this time
        db = await initDatabase();
        console.log('✅ Database initialized successfully');

        // Set up all IPC handlers (only once)
        setupIpcHandlers();
        console.log('✅ All IPC handlers registered');

        // Then create the main window
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
            webSecurity: !isDev,
            allowRunningInsecureContent: isDev
        },
        icon: path.join(__dirname, '../renderer/public/favicon.ico'),
        backgroundColor: '#111827'
    });

    mainWindow = win;

    // Load the app
    if (isDev) {
        console.log('🔍 Loading dev URL: http://localhost:3000');
        win.loadURL('http://localhost:3000');
        win.webContents.openDevTools();
    } else {
        const indexPath = path.join(__dirname, '../../out/index.html');
        console.log('📄 Loading production file:', indexPath);

        // Check if file exists
        if (!fs.existsSync(indexPath)) {
            console.error('❌ Production file not found at:', indexPath);
            console.log('📂 Directory contents:', fs.readdirSync(path.dirname(indexPath)));
        }

        win.loadFile(indexPath).catch(err => {
            console.error('❌ Failed to load index.html:', err);
        });
    }

    // Handle navigation for static exports
    win.webContents.on('will-navigate', (event, url) => {
        console.log('🔀 Navigation attempt to:', url);

        // For static exports, we need to handle client-side routing
        if (!isDev && url.startsWith('file://')) {
            event.preventDefault();

            // Convert the URL to a file path
            const parsedUrl = new URL(url);
            let filePath = parsedUrl.pathname;

            // Remove leading slash
            if (filePath.startsWith('/')) {
                filePath = filePath.substring(1);
            }

            // If it's a dynamic route, try to load the appropriate HTML file
            if (filePath.startsWith('accounts/')) {
                const accountId = filePath.replace('accounts/', '').replace('/', '');
                const accountPagePath = path.join(__dirname, '../../out/accounts/[id].html');

                if (fs.existsSync(accountPagePath)) {
                    console.log('📄 Loading account page:', accountPagePath);
                    win.loadFile(accountPagePath).catch(err => {
                        console.error('❌ Failed to load account page:', err);
                        // Fallback to index
                        win.loadFile(path.join(__dirname, '../../out/index.html'));
                    });
                } else {
                    console.log('📄 Account page not found, loading index');
                    win.loadFile(path.join(__dirname, '../../out/index.html'));
                }
            } else {
                // For other routes, try to load the corresponding HTML file
                const routePath = path.join(__dirname, '../../out', filePath, 'index.html');
                if (fs.existsSync(routePath)) {
                    win.loadFile(routePath);
                } else {
                    win.loadFile(path.join(__dirname, '../../out/index.html'));
                }
            }
        }
    });

    // Handle internal navigation
    win.webContents.on('did-finish-load', () => {
        console.log('✅ Page loaded successfully');

        // Close splash screen if it exists
        if (splashWindow) {
            closeSplashWindow(splashWindow);
            splashWindow = null;
        }

        // Inject client-side routing handler for static exports
        if (!isDev) {
            win.webContents.executeJavaScript(`
                // Override pushState to handle navigation
                const originalPushState = history.pushState;
                history.pushState = function() {
                    console.log('🔀 Navigation detected:', arguments);
                    originalPushState.apply(this, arguments);
                    
                    // Notify main process of navigation
                    if (window.electronAPI) {
                        window.electronAPI.send('navigation-changed', window.location.pathname);
                    }
                };
                
                // Handle link clicks
                document.addEventListener('click', (e) => {
                    const link = e.target.closest('a');
                    if (link && link.href && link.href.startsWith(window.location.origin)) {
                        e.preventDefault();
                        const path = link.href.replace(window.location.origin, '');
                        
                        // For account links, load the appropriate file
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

    // Listen for navigation events from renderer
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
    // Prevent duplicate registration
    if (ipcHandlersRegistered) {
        console.log('🔍 IPC handlers already registered, skipping...');
        return;
    }

    console.log('🔍 Starting IPC handler registration...');
    console.log('🔍 Step 1: Inside setupIpcHandlers');

    // Remove any existing handlers to be safe
    try {
        // Basic handlers
        ipcMain.removeHandler('ping');

        // User management
        ipcMain.removeHandler('create-user');
        ipcMain.removeHandler('login-user');
        ipcMain.removeHandler('logout-user');
        ipcMain.removeHandler('get-current-user');
        ipcMain.removeHandler('list-users');

        // Forecast handlers
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

        // MoneyMap handlers
        ipcMain.removeHandler('buildMoneyMap');
        ipcMain.removeHandler('refreshMoneyMap');

        // Prosperity handlers
        ipcMain.removeHandler('optimizeProsperityMap');

        // Category group handlers
        ipcMain.removeHandler('categoryGroups:getAll');
        ipcMain.removeHandler('categoryGroups:getWithCategories');
        ipcMain.removeHandler('categoryGroups:create');
        ipcMain.removeHandler('categoryGroups:update');
        ipcMain.removeHandler('categoryGroups:delete');

        // Account handlers
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

        // Transaction handlers
        ipcMain.removeHandler('getTransactions');
        ipcMain.removeHandler('addTransaction');
        ipcMain.removeHandler('updateTransaction');
        ipcMain.removeHandler('deleteTransaction');
        ipcMain.removeHandler('getAccountTransactions');
        ipcMain.removeHandler('toggleTransactionCleared');
        ipcMain.removeHandler('reconcileAccount');

        // Legacy account handlers
        ipcMain.removeHandler('get-accounts');
        ipcMain.removeHandler('getAccounts');
        ipcMain.removeHandler('get-account');
        ipcMain.removeHandler('update-account');
        ipcMain.removeHandler('delete-account');
        ipcMain.removeHandler('get-account-transactions');
        ipcMain.removeHandler('get-accounts-dashboard');
        ipcMain.removeHandler('get-account-details');
        ipcMain.removeHandler('create-account');

        // Category handlers
        ipcMain.removeHandler('getCategories');
        ipcMain.removeHandler('get-categories');
        ipcMain.removeHandler('create-category');
        ipcMain.removeHandler('delete-category');
        ipcMain.removeHandler('update-category');
        ipcMain.removeHandler('updateCategory');

        // Group handlers
        ipcMain.removeHandler('get-groups');
        ipcMain.removeHandler('create-group');
        ipcMain.removeHandler('update-group');
        ipcMain.removeHandler('delete-group');

        // Settings and utility
        ipcMain.removeHandler('get-groups-with-categories');
        ipcMain.removeHandler('save-settings');
        ipcMain.removeHandler('get-network-status');

        // Subscription handlers
        ipcMain.removeHandler('subscribe-to-event');

    } catch (e) {
        // Ignore errors if handlers don't exist
        console.log('Some handlers didn\'t exist, that\'s fine');
    }

    // ==================== PING HANDLER (TEST) ====================
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

    // Add this debug handler
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
    // Inside your categoryGroups:getAll handler, add a retry mechanism
    ipcMain.handle('categoryGroups:getAll', async (event, userId) => {
        console.log('📞 IPC: categoryGroups:getAll called');

        // Add retry logic
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
                // Wait 500ms before retrying
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
    ipcMain.handle('accounts:getAll', async (event, userId) => {
        console.log('📞 IPC: accounts:getAll called');
        try {
            const service = new accountService();
            const result = await service.getAllAccounts(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:getAll:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('accounts:getById', async (event, id, userId) => {
        console.log('📞 IPC: accounts:getById called');
        try {
            const service = new accountService();
            const result = await service.getAccountById(id, userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:getById:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:create', async (event, accountData) => {
        console.log('📞 IPC: accounts:create called');
        try {
            const service = new accountService();
            const result = await service.createAccount(accountData);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:create:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:update', async (event, id, userId, updates) => {
        console.log('📞 IPC: accounts:update called');
        try {
            const service = new accountService();
            const result = await service.updateAccount(id, userId, updates);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:update:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:delete', async (event, id, userId) => {
        console.log('📞 IPC: accounts:delete called');
        try {
            const service = new accountService();
            const result = await service.deleteAccount(id, userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:delete:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:getBalances', async (event, accountId, userId) => {
        console.log('📞 IPC: accounts:getBalances called');
        try {
            const service = new accountService();
            const result = await service.getAccountBalances(accountId, userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:getBalances:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:getSummary', async (event, userId) => {
        console.log('📞 IPC: accounts:getSummary called with userId:', userId);
        try {
            const service = new accountService();
            const result = await service.getAccountsSummary(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:getSummary:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('accounts:getTotals', async (event, userId) => {
        console.log('📞 IPC: accounts:getTotals called');
        try {
            const service = new accountService();
            const result = await service.getTotalsByType(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:getTotals:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:startReconciliation', async (event, accountId, userId, statementBalance, statementDate) => {
        console.log('📞 IPC: accounts:startReconciliation called');
        try {
            const service = new accountService();
            const result = await service.startReconciliation(accountId, userId, statementBalance, statementDate);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in accounts:startReconciliation:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:getCreditCardDetails', async (event, accountId, userId) => {
        console.log('📞 IPC: accounts:getCreditCardDetails called');
        try {
            const service = new accountService();
            const result = await service.getCreditCardDetails(accountId, userId);
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
            // Get current user
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

            // FIX: Ensure amount is a valid number
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

            // After successful creation, publish update
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

            // After successful update, publish update
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

            // After successful deletion, publish update
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

    // Add this temporarily to your IPC handlers
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
        console.log('🔍 [getAccounts] called');
        try {
            const db = await getDatabase();
            const accounts = await db.all('SELECT * FROM accounts WHERE user_id = 2');
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
            // const groups = await groupService.getGroups(budgetId);
            const groups = []; // Placeholder until groupService is available
            return { success: true, data: groups };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('create-group', async (event, group) => {
        try {
            // const result = await groupService.createGroup(group);
            const result = { id: 1, ...group }; // Placeholder
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-group', async (event, groupId, updates) => {
        try {
            // const result = await groupService.updateGroup(groupId, updates);
            const result = { id: groupId, ...updates }; // Placeholder
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-group', async (event, groupId) => {
        try {
            // const result = await groupService.deleteGroup(groupId);
            const result = { success: true }; // Placeholder
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== CATEGORY MANAGEMENT (Legacy) ====================
    ipcMain.handle('create-category', async (event, category) => {
        try {
            // const result = await categoryService.createCategory(category);
            const result = { id: 1, ...category }; // Placeholder
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-category', async (event, categoryId) => {
        try {
            // const result = await categoryService.deleteCategory(categoryId);
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
            // Save settings logic here
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

        // Return unsubscribe function
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

            // Process interfaces to find active connections
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
                    // Browser-compatible properties
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
    // FIX: Check if db exists and has close method
    if (db && typeof db.close === 'function') {
        db.close();
    } else if (db && db.$pool) {
        // For sqlite3 database connections
        db.close();
    }
});