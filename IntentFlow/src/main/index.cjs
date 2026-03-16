// src/main/index.cjs
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os'); // Added for network status
const CategoryGroupService = require('../services/categories/categoryGroupService.cjs');
// Add this with other requires at the top
const ForecastService = require('../services/forecast/forecastService.cjs');
const MoneyMap = require('../services/forecast/moneyMap.cjs');
const ProsperityOptimizer = require('../services/prosperity/prosperityOptimizer.cjs');
// Add with other requires at the top
const ValidationService = require('../services/forecast/validationService.cjs');

const updateService = require('../services/realtime/updateService.cjs');

// Windows
const { createSplashWindow, closeSplashWindow } = require('./splash.cjs');

// Services
const accountService = require('../services/accounts/accountService.cjs');
const userService = require('../services/userService.cjs');
// const groupService = require('../services/groupService.cjs');
// const categoryService = require('../services/categoryService.cjs');
const settingsService = require('../services/settingsService.cjs');
const TransactionService = require('../services/transactions/transactionService.cjs');

let mainWindow;
let splashWindow;
let db;
let nativeServer = null;
let ipcHandlersRegistered = false; // Flag to prevent duplicate registration

// ==================== DATABASE PATH HELPER ====================
function getDatabasePath() {
    // In production, use the userData directory
    if (app.isPackaged) {
        const userDataPath = app.getPath('userData');
        const dbDir = path.join(userDataPath, 'database');
        
        // Ensure directory exists
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log('📁 Created database directory at:', dbDir);
        }
        
        return path.join(dbDir, 'app.db');
    } else {
        // In development, use the local db/data directory
        return path.join(__dirname, '../db/data/app.db');
    }
}

// ==================== DATABASE INITIALIZATION ====================
async function initDatabase() {
    console.log('📦 Initializing database...');

    const sqlite3 = require('sqlite3');
    const { open } = require('sqlite');
    
    const dbPath = getDatabasePath();
    console.log('📂 Database path:', dbPath);

    // Check if database file exists (only in development)
    if (!app.isPackaged) {
        const fs = require('fs');
        if (!fs.existsSync(dbPath)) {
            console.error('❌ Database file does not exist at:', dbPath);
            throw new Error(`Database file not found at ${dbPath}. Please run migrations first.`);
        }
    }

    // Actually open the database connection
    const database = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Enable foreign keys
    await database.exec('PRAGMA foreign_keys = ON');

    console.log('✅ Database initialized successfully');
    console.log('✅ Available methods:', Object.keys(database));

    // Check if we need to run migrations (for production new installs)
    if (app.isPackaged) {
        const migrationsTable = await database.get(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'"
        );
        
        if (!migrationsTable) {
            console.log('🔄 New database detected, running migrations...');
            try {
                const { runMigrations } = require('../db/migrations/index.cjs');
                await runMigrations(database);
                console.log('✅ Migrations completed successfully');
            } catch (migrationError) {
                console.error('❌ Migrations failed:', migrationError);
                throw migrationError;
            }
        }
    }

    return database;
}

// ==================== APP INITIALIZATION ====================
app.whenReady().then(async () => {
    console.log('🚀 Starting Money Manager...');
    console.log('🔍 app.isPackaged:', app.isPackaged);
    console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
    console.log('🔍 Current directory:', __dirname);

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
async function createWindow() {
    const preloadPath = path.join(__dirname, '../preload/preload.cjs');
    console.log('🔍 Preload path:', preloadPath);
    console.log('🔍 Preload exists:', fs.existsSync(preloadPath));

    mainWindow = new BrowserWindow({
        width: 1300,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: preloadPath,
            // 🚀 ADD THIS FOR DEBUGGING
            devTools: true,
        },
        titleBarStyle: 'default',
        backgroundColor: '#0f2e1c',
        show: false,
        icon: process.platform === 'darwin'
            ? path.join(__dirname, '../../assets/icon.icns')
            : path.join(__dirname, '../../assets/icon.png'),
    });

    // 🚀 ADD THIS - Log all webContents events
    mainWindow.webContents.on('did-start-loading', () => {
        console.log('🔵 WebContents: did-start-loading');
    });

    mainWindow.webContents.on('did-stop-loading', () => {
        console.log('🔵 WebContents: did-stop-loading');
    });

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('🔵 WebContents: did-finish-load');
        // 🚀 Check what was loaded
        mainWindow.webContents.executeJavaScript(`
            console.log('🔵 Window location:', window.location.href);
            console.log('🔵 Document title:', document.title);
            console.log('🔵 Body content length:', document.body?.innerHTML?.length || 0);
            console.log('🔵 Is React mounted?', !!document.getElementById('__next'));
        `).catch(err => console.error('Failed to execute JS:', err));
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('🔴 WebContents: did-fail-load', { errorCode, errorDescription });
    });

    mainWindow.webContents.on('crashed', () => {
        console.error('🔴 WebContents: crashed');
    });

    mainWindow.webContents.on('unresponsive', () => {
        console.error('🔴 WebContents: unresponsive');
    });

    mainWindow.webContents.on('responsive', () => {
        console.log('🔵 WebContents: responsive');
    });

    // 🚀 ADD THIS - Catch console messages from renderer
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        const levels = ['debug', 'info', 'warning', 'error'];
        console.log(`🔵 [Renderer ${levels[level] || 'log'}]: ${message} (${sourceId}:${line})`);
    });

    const isDev = !app.isPackaged;

    if (isDev) {
        console.log('🔧 Running in development mode');
        await mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        const indexPath = path.join(__dirname, '../../out/index.html');
        console.log('🔍 Index path:', indexPath);
        console.log('🔍 Index exists:', fs.existsSync(indexPath));
        
        // 🚀 Check what files are actually in the out directory
        try {
            const outDir = path.join(__dirname, '../../out');
            console.log('🔍 Out directory contents:', fs.readdirSync(outDir).slice(0, 10));
            
            const nextDir = path.join(outDir, '_next');
            if (fs.existsSync(nextDir)) {
                console.log('🔍 _next directory exists');
                console.log('🔍 _next contents:', fs.readdirSync(nextDir).slice(0, 10));
            } else {
                console.error('🔴 _next directory MISSING!');
            }
        } catch (e) {
            console.error('🔴 Error reading out directory:', e);
        }

        if (fs.existsSync(indexPath)) {
            // 🚀 Read the index.html to verify it has content
            const indexContent = fs.readFileSync(indexPath, 'utf8');
            console.log('🔍 index.html length:', indexContent.length);
            console.log('🔍 index.html first 200 chars:', indexContent.substring(0, 200));
            
            await mainWindow.loadFile(indexPath).catch(err => {
                console.error('🔴 Failed to load index.html:', err);
            });
        } else {
            dialog.showErrorBox('Build Files Missing', 'Application files not found. Please reinstall.');
            app.quit();
        }
    }

    mainWindow.once('ready-to-show', () => {
        console.log('🔵 Main window ready-to-show');
        setTimeout(() => {
            if (splashWindow) closeSplashWindow();
            mainWindow.show();
            console.log('🔵 Main window shown');
            
            // 🚀 Force DevTools open for debugging
            mainWindow.webContents.openDevTools();
        }, 500);
    });

    createMenu();

    return mainWindow;
}

// ==================== DATABASE HELPER ====================
async function getDatabase() {
    console.log('🔍 getDatabase called, current db state:', db ? 'exists' : 'null');
    if (!db) {
        console.log('📦 Creating new database connection...');
        
        const dbPath = getDatabasePath(); // Use the same helper function
        console.log('📂 Database path:', dbPath);

        try {
            const sqlite3 = require('sqlite3');
            const { open } = require('sqlite');

            db = await open({
                filename: dbPath,
                driver: sqlite3.Database
            });

            // Enable foreign keys
            await db.exec('PRAGMA foreign_keys = ON');

            console.log('✅ Database connection established');
        } catch (error) {
            console.error('❌ Failed to create database connection:', error);
            throw error;
        }
    }
    return db;
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
        console.log('📝 MAIN PROCESS: updateCategory called');
        console.log('📝 MAIN PROCESS - categoryId:', categoryId);
        console.log('📝 MAIN PROCESS - updates:', updates);
        console.log('📝 MAIN PROCESS - updates type:', typeof updates);
        console.log('📝 MAIN PROCESS - updates keys:', Object.keys(updates || {}));
        console.log('📝 MAIN PROCESS - updates.assigned:', updates?.assigned);
        console.log('📝 MAIN PROCESS - updates.assigned type:', typeof updates?.assigned);
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
        try {
            const service = new CategoryGroupService();
            const result = await service.getCategoryGroups(userId);
            return { success: true, data: result };
        } catch (error) {
            console.error('❌ Error in categoryGroups:getAll:', error);
            return { success: false, error: error.message };
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
            return { success: false, error: error.message };
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
            return { success: false, error: error.message };
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
            return { success: false, error: error.message };
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
                return { success: false, error: 'No user logged in' };
            }

            const service = new TransactionService();
            const transactions = await service.getAllTransactions(currentUser.id);
            return { success: true, data: transactions };
        } catch (error) {
            console.error('❌ Error in getTransactions:', error);
            return { success: false, error: error.message };
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
                return { success: false, error: 'No user logged in' };
            }

            const service = new TransactionService();
            const transactions = await service.getAccountTransactions(accountId, currentUser.id);
            return { success: true, data: transactions };
        } catch (error) {
            console.error('❌ Error in getAccountTransactions:', error);
            return { success: false, error: error.message };
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
            const result = await service.updateTransaction(id, currentUser.id, { is_cleared: clearedStatus });
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
            return { success: false, error: error.message };
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
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-accounts-dashboard', async (event) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in' };
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
            return { success: false, error: error.message };
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
            return { success: false, error: error.message };
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