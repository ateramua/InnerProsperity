// src/main/index.cjs
require('dotenv').config();
const { loadPlaidEnvFromUserData } = require('../services/plaid/loadPlaidEnv.cjs');
const {
  PLAID_OAUTH_SCHEME,
  isPlaidOAuthDeepLink,
  findPlaidOAuthArgv,
} = require('../services/plaid/plaidOAuth.cjs');
const plaidRelayClient = require('../services/plaid/plaidRelayClient.cjs') || {};
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, safeStorage } = require('electron');
const { getEditMenuTemplate, attachEditableContextMenu } = require('./textInputClipboard.cjs');
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
function resolvePreloadPath() {
    const devPath = path.join(__dirname, '../preload/preload.cjs');
    const packagedPaths = [
        path.join(process.resourcesPath, 'app.asar', 'src', 'preload', 'preload.cjs'),
        path.join(process.resourcesPath, 'app.asar', 'preload', 'preload.cjs'),
        path.join(process.resourcesPath, 'app', 'src', 'preload', 'preload.cjs'),
        path.join(process.resourcesPath, 'app', 'preload', 'preload.cjs'),
    ];

    if (!app.isPackaged) {
        return devPath;
    }

    const foundPath = packagedPaths.find((candidate) => fs.existsSync(candidate));
    if (foundPath) {
        return foundPath;
    }

    console.warn('⚠️ Preload script not found in packaged paths. Falling back to dev path:', devPath);
    return devPath;
}

// Packaged apps must always load the static export from disk (never localhost), even if
// NODE_ENV was left as "development" when launching the .app from a terminal.
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

if (!app.isPackaged) {
    const debugPort =
        process.env.INTENTFLOW_REMOTE_DEBUGGING_PORT ||
        process.env.ELECTRON_REMOTE_DEBUGGING_PORT ||
        '9222';
    app.commandLine.appendSwitch('remote-debugging-port', String(debugPort));
    app.commandLine.appendSwitch('remote-allow-origins', '*');
}

// ==================== HELPER FUNCTIONS FOR PACKAGED APP ====================
function getAppPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'app.asar');
    }
    return path.resolve(__dirname, '../..');
}

function getOutRootDir() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'out');
    }
    return path.join(__dirname, '../../out');
}

function getProductionFilePath(relativePath) {
    return path.join(getOutRootDir(), relativePath);
}

function fileUrlToFilesystemPath(urlString) {
    try {
        const u = new URL(urlString);
        let p = decodeURIComponent(u.pathname.replace(/\+/g, ' '));
        if (process.platform === 'win32') {
            if (/^\/[A-Za-z]:/.test(p)) {
                p = p.substring(1);
            }
            p = p.replace(/\//g, path.sep);
        }
        return path.normalize(p);
    } catch {
        return null;
    }
}

function isPathInsideDir(dir, candidate) {
    const base = path.normalize(dir);
    const abs = path.normalize(candidate);
    const rel = path.relative(base, abs);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Map a file:// navigation target to an existing Next static-export HTML file under out/.
 */
function resolveStaticHtmlFromFileUrl(urlString) {
    const fsPath = fileUrlToFilesystemPath(urlString);
    if (!fsPath) {
        return getProductionFilePath('index.html');
    }
    const outRoot = getOutRootDir();
    if (!isPathInsideDir(outRoot, fsPath)) {
        return getProductionFilePath('index.html');
    }
    const rel = path.relative(outRoot, fsPath);
    const segs = rel.split(path.sep).filter(Boolean);

    if (segs[0] === 'accounts') {
        if (segs.length === 1 || (segs.length === 2 && segs[1] === 'index.html')) {
            return getProductionFilePath(path.join('accounts', 'index.html'));
        }
        const second = segs[1];
        if (second === '[id]') {
            const deep = path.join(outRoot, 'accounts', '[id]', ...segs.slice(2));
            if (fs.existsSync(deep) && deep.endsWith('.html')) {
                return deep;
            }
            const idx = path.join(outRoot, 'accounts', '[id]', ...segs.slice(2, -1), 'index.html');
            if (fs.existsSync(idx)) {
                return idx;
            }
            return path.join(outRoot, 'accounts', '[id]', 'index.html');
        }
        if (second !== 'index.html') {
            if (segs[2] === 'edit') {
                return path.join(outRoot, 'accounts', '[id]', 'edit', 'index.html');
            }
            if (segs[2] === 'reconcile') {
                return path.join(outRoot, 'accounts', '[id]', 'reconcile', 'index.html');
            }
            return path.join(outRoot, 'accounts', '[id]', 'index.html');
        }
    }

    if (fs.existsSync(fsPath) && fsPath.endsWith('.html')) {
        return fsPath;
    }
    if (fs.existsSync(path.join(fsPath, 'index.html'))) {
        return path.join(fsPath, 'index.html');
    }
    if (segs.length && !fsPath.endsWith('.html')) {
        const idx = path.join(outRoot, rel, 'index.html');
        if (fs.existsSync(idx)) {
            return idx;
        }
    }
    return getProductionFilePath('index.html');
}

/**
 * Map an in-app route (e.g. /accounts/uuid) to a static export HTML file for file:// mode.
 */
function routePathToStaticHtml(routePath) {
    const raw = String(routePath || '').split('?')[0];
    const trimmed = raw.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!trimmed) {
        return getProductionFilePath('index.html');
    }
    const parts = trimmed.split('/').filter(Boolean);
    if (parts[0] === 'accounts') {
        if (parts.length === 1) {
            return getProductionFilePath(path.join('accounts', 'index.html'));
        }
        if (parts[1] === 'edit' || parts[1] === 'reconcile') {
            return getProductionFilePath('index.html');
        }
        if (parts.length >= 3 && parts[2] === 'edit') {
            return path.join(getOutRootDir(), 'accounts', '[id]', 'edit', 'index.html');
        }
        if (parts.length >= 3 && parts[2] === 'reconcile') {
            return path.join(getOutRootDir(), 'accounts', '[id]', 'reconcile', 'index.html');
        }
        return path.join(getOutRootDir(), 'accounts', '[id]', 'index.html');
    }
    const candidate = path.join(getOutRootDir(), ...parts, 'index.html');
    if (fs.existsSync(candidate)) {
        return candidate;
    }
    return getProductionFilePath('index.html');
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

        // Try alternate extensions when the requested file uses .cjs or .js
        const extensionFallbacks = ['.cjs', '.js'];
        const basePath = modulePath.replace(/\.(cjs|js)$/, '');
        for (const ext of extensionFallbacks) {
            const fallbackModulePath = `${basePath}${ext}`;
            const cleanFallbackPath = fallbackModulePath.replace(/^\.\.\//, '');
            const devFallbackPath = path.join(__dirname, '..', cleanFallbackPath);
            if (fs.existsSync(devFallbackPath)) {
                return require(devFallbackPath);
            }
            const altFallbackPath = path.join(__dirname, '..', '..', 'src', cleanFallbackPath);
            if (fs.existsSync(altFallbackPath)) {
                return require(altFallbackPath);
            }
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

const CashForecastService = requireModule('../services/forecast/cashForecastService.cjs') || class CashForecastService {
    constructor(dbProvider) { this.dbProvider = dbProvider; }
    async createShare() { return null; }
    async getShare() { return null; }
    async getRecurringPrefs() { return []; }
    async setRecurringPref() { return {}; }
    async getScheduledTransactionsForUser() { return []; }
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

const updateService = requireModule('../services/realtime/updateService.cjs') || { publish: () => { }, subscribe: () => () => {} };

/** Forward updateService events to renderer windows (preload listens on `update:${eventType}`). */
(function bridgeUpdateServiceEventsToRenderer() {
    if (!updateService || typeof updateService.subscribe !== 'function') {
        console.warn('⚠️ updateService.subscribe missing; real-time budget refresh bridge disabled');
        return;
    }
    const forward = (eventType) => (data) => {
        try {
            for (const win of BrowserWindow.getAllWindows()) {
                if (win.isDestroyed()) continue;
                const wc = win.webContents;
                if (wc && !wc.isDestroyed()) {
                    wc.send(`update:${eventType}`, data);
                }
            }
        } catch (e) {
            console.warn(`bridgeUpdateServiceEventsToRenderer(${eventType}):`, e?.message || e);
        }
    };
    [
        'prosperity:updated',
        'forecast:updated',
        'transaction:added',
        'transaction:updated',
        'transaction:patched',
        'transaction:deleted',
        'budget:assigned',
        'budget:bulkAssigned',
        'budget:repaired',
        'budget:consolidated',
        'budget:moved',
        'category:updated',
        'category:created',
        'category:deleted',
        'categoryGroups:changed'
    ].forEach((evt) => {
        updateService.subscribe(evt, forward(evt), `main-ipc-bridge:${evt}`);
    });
})();
/** Publish domain events so updateService + renderer bridge refresh budget UI. */
function notifyBudgetStateChanged(eventName, data) {
    try {
        if (updateService && typeof updateService.publish === 'function') {
            updateService.publish(eventName, data);
        }
    } catch (e) {
        console.warn('notifyBudgetStateChanged:', e?.message || e);
    }
}
const fileEncryption = requireModule('../services/fileEncryption.cjs') || require(path.join(__dirname, '../services/fileEncryption.cjs'));
const { registerBackupIpcHandlers } =
    requireModule('./backup/backupIpc.cjs') || require(path.join(__dirname, './backup/backupIpc.cjs'));

const splashModule = requireModule('./splash.cjs') || {
    createSplashWindow: () => null,
    closeSplashWindow: () => { }
};
const { createSplashWindow, closeSplashWindow } = splashModule;

const AccountService = requireModule('../services/accounts/accountService.cjs');
const accountDeleteService = requireModule('../services/accounts/accountDeleteService.cjs') || {};
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

/** Align renderer user id with main-process session for category CRUD. */
function resolveCategoryOwnerId(explicitUserId) {
    if (explicitUserId !== undefined && explicitUserId !== null && String(explicitUserId).trim() !== '') {
        return explicitUserId;
    }
    return userService.getCurrentUser()?.id ?? null;
}

const { isCategoryArchivedFlag, sqlCategoryNotArchived, sqlCategoryIsArchived } = require('../shared/categoryArchiveFlags.cjs');

async function findCategoryRowById(db, categoryId, userId = null) {
    if (categoryId === undefined || categoryId === null || String(categoryId).trim() === '') {
        return null;
    }
    if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
        return db.get(
            'SELECT * FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
            [categoryId, userId]
        );
    }
    return db.get(
        'SELECT * FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT)',
        [categoryId]
    );
}

/**
 * Resolve a category's group id and display name (for archive snapshot / restore).
 * @param {object} [hints] - Optional { groupId, groupName } from the budget UI.
 * @returns {Promise<{ groupId: string|null, groupName: string|null }>}
 */
async function resolveCategoryGroupSnapshot(db, category, ownerId, hints = {}) {
    const seen = new Set();
    const idCandidates = [];
    for (const raw of [
        category.group_id,
        hints.groupId,
        category.original_group_id,
        hints.originalGroupId,
    ]) {
        if (raw === undefined || raw === null) continue;
        const key = String(raw).trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        idCandidates.push(key);
    }

    let groupId = null;
    let groupName =
        hints.groupName != null && String(hints.groupName).trim() !== ''
            ? String(hints.groupName).trim()
            : category.original_group_name != null && String(category.original_group_name).trim() !== ''
              ? String(category.original_group_name).trim()
              : null;

    for (const candidate of idCandidates) {
        const group = await db.get(
            `SELECT id, name FROM category_groups
             WHERE CAST(user_id AS TEXT) = CAST(? AS TEXT)
               AND CAST(id AS TEXT) = CAST(? AS TEXT)`,
            [ownerId, candidate]
        );
        if (group?.id != null && String(group.id).trim() !== '') {
            groupId = String(group.id);
            groupName = group.name || groupName;
            return { groupId, groupName };
        }
    }

    if (groupName) {
        const byName = await db.get(
            `SELECT id, name FROM category_groups
             WHERE CAST(user_id AS TEXT) = CAST(? AS TEXT)
               AND lower(trim(name)) = lower(trim(?))`,
            [ownerId, groupName]
        );
        if (byName?.id != null && String(byName.id).trim() !== '') {
            return { groupId: String(byName.id), groupName: byName.name || groupName };
        }
    }

    return { groupId: null, groupName };
}

/**
 * Group id to use when restoring an archived category (CAST-safe id match).
 * @returns {Promise<string|null>}
 */
async function resolveCategoryRestoreGroupId(db, category, ownerId) {
    const nameHint =
        category.original_group_name != null && String(category.original_group_name).trim() !== ''
            ? String(category.original_group_name).trim()
            : null;
    if (nameHint) {
        const byName = await db.get(
            `SELECT id FROM category_groups
             WHERE CAST(user_id AS TEXT) = CAST(? AS TEXT)
               AND lower(trim(name)) = lower(trim(?))`,
            [ownerId, nameHint]
        );
        if (byName?.id != null && String(byName.id).trim() !== '') {
            return String(byName.id);
        }
    }

    const seen = new Set();
    const candidates = [];
    for (const raw of [category.original_group_id, category.group_id]) {
        if (raw === undefined || raw === null) continue;
        const key = String(raw).trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        candidates.push(key);
    }

    for (const candidate of candidates) {
        const group = await db.get(
            `SELECT id FROM category_groups
             WHERE CAST(user_id AS TEXT) = CAST(? AS TEXT)
               AND CAST(id AS TEXT) = CAST(? AS TEXT)`,
            [ownerId, candidate]
        );
        if (group?.id != null && String(group.id).trim() !== '') {
            return String(group.id);
        }
    }

    let defaultGroup = await db.get(
        `SELECT id FROM category_groups
         WHERE CAST(user_id AS TEXT) = CAST(? AS TEXT)
           AND lower(name) = lower(?)`,
        [ownerId, 'Uncategorized']
    );
    if (!defaultGroup) {
        const result = await db.run(
            `INSERT INTO category_groups (user_id, name, sort_order, created_at, updated_at)
             VALUES (?, 'Uncategorized', 999, datetime('now'), datetime('now'))`,
            [ownerId]
        );
        defaultGroup = await db.get(
            `SELECT id FROM category_groups
             WHERE CAST(id AS TEXT) = CAST(? AS TEXT)
               AND CAST(user_id AS TEXT) = CAST(? AS TEXT)`,
            [String(result.lastID), ownerId]
        );
    }
    return defaultGroup?.id != null ? String(defaultGroup.id) : null;
}

/**
 * @param {object} [restoreHints] - Optional { groupId, groupName } from archived list UI.
 */
async function resolveCategoryRestoreTarget(db, category, ownerId, restoreHints = {}) {
    const snapshot = await resolveCategoryGroupSnapshot(db, category, ownerId, restoreHints);
    if (snapshot.groupId) {
        return snapshot.groupId;
    }
    return resolveCategoryRestoreGroupId(db, category, ownerId);
}

function resolveBudgetOwnerId(_db, requestedUserId) {
    const currentUserId = userService.getCurrentUser()?.id;
    if (!currentUserId) return null;
    if (
        requestedUserId !== undefined &&
        requestedUserId !== null &&
        String(requestedUserId).trim() !== '' &&
        String(requestedUserId) !== String(currentUserId)
    ) {
        return '__AUTH_MISMATCH__';
    }
    return currentUserId;
}

async function getCategoryMonthEnvelope(db, userId, categoryId, monthKey) {
    const normalizedMonth = monthlyBudgetService.toLocalMonthKey(monthKey || new Date());
    await monthlyBudgetService.getBudgetMonthSnapshot(db, userId, normalizedMonth);
    const row = await db.get(
        `SELECT budgeted_amount, available_amount
         FROM monthly_budgets
         WHERE category_id = ? AND month = ?`,
        [categoryId, normalizedMonth]
    );
    if (row) {
        return {
            monthKey: normalizedMonth,
            assigned: Number(row.budgeted_amount) || 0,
            available: Number(row.available_amount) || 0
        };
    }
    const cat = await db.get(
        'SELECT assigned, available FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
        [categoryId, userId]
    );
    return {
        monthKey: normalizedMonth,
        assigned: Number(cat?.assigned) || 0,
        available: Number(cat?.available) || 0
    };
}

const {
    applyCreditCardPaymentReserveDelta: applyCreditCardPaymentReserveDeltaUtil,
    refreshCreditCardPaymentCategoryEnvelope,
    releaseReserveForDeletedTransaction,
} = require('../services/transactions/creditCardReserveUtils.cjs');

async function applyCreditCardPaymentReserveDelta(db, opts) {
    return applyCreditCardPaymentReserveDeltaUtil(db, {
        ...opts,
        userIntentAssignment: opts?.userIntentAssignment !== false,
    });
}

const settingsService = requireModule('../services/settingsService.cjs') || {
    getGroupsWithCategories: async (budgetId) => []
};

const budgetTableImportExport =
    requireModule('../services/budget/budgetTableImportExport.cjs') ||
    require(path.join(__dirname, '../services/budget/budgetTableImportExport.cjs'));

const monthlyBudgetService = requireModule('../services/budget/monthlyBudgetService.cjs') || {
    toLocalMonthKey: (d) => {
        const x = d instanceof Date ? d : new Date();
        return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`;
    },
    getBudgetMonthSnapshot: async () => ({
        monthKey: '',
        prevMonthKey: '',
        isCurrentCalendarMonth: false,
        categories: []
    }),
    refreshBudgetMonthsForward: async () => {},
    applyMonthBudgetedAmount: async () => ({}),
    applyMonthAssignedAndAvailable: async () => ({}),
    applyMonthBudgetBulk: async () => ({ monthKey: '', mode: 'delta', assignments: [] }),
    applyMonthBudgetDelta: async () => ({}),
    repairImplicitAssignmentsForMonth: async () => ({ monthKey: '', repairs: [] }),
    repairAndRefreshBudgetMonths: async () => ({ monthKey: '', repairs: [], snapshot: {} }),
    consolidateAvailableIntoMonthAssignments: async () => ({ monthKey: '', conversions: [] }),
    resetEnvelopesFromMonth: async () => ({ monthKey: '', categoriesReset: 0 }),
    unassignAllForMonth: async () => ({
        monthKey: '',
        totalReleased: 0,
        categoriesUpdated: 0,
        breakdown: [],
    }),
    auditBudgetMonthIntegrity: async () => ({ monthKey: '', categories: [], totals: {} }),
    getGlobalBudgetSummary: async () => ({
        currentMonthKey: '',
        totalCash: 0,
        totalAssigned: 0,
        futureAssigned: 0,
        readyToAssign: 0,
        futureBreakdown: [],
    }),
    assertSufficientReadyToAssign: async () => {},
    readMonthBudgeted: async () => 0,
};

const { sumTotalBudgetCashFromSummary } = require('../utils/cashAccountUtils.cjs');

/** On-budget checking + savings cash total for global Ready to Assign. */
async function resolveBudgetCashTotal(userId) {
    try {
        const summary = await accountService.getAccountsSummary(userId);
        return sumTotalBudgetCashFromSummary(summary);
    } catch (e) {
        console.warn('resolveBudgetCashTotal:', e?.message || e);
        return 0;
    }
}

const creditCardPaymentCategoryService =
    requireModule('../services/accounts/creditCardPaymentCategoryService.cjs') ||
    require(path.join(__dirname, '../services/accounts/creditCardPaymentCategoryService.cjs'));

const {
    CREDIT_CARD_PAYMENTS_GROUP_NAME,
    isEligibleBudgetCreditCardAccount,
    ensureCreditCardPaymentCategoryForAccount,
    archiveCreditCardPaymentCategoryForAccount,
    syncCreditCardPaymentCategoriesForUser,
    ensureAllCreditCardPaymentCategoriesForUser,
} = creditCardPaymentCategoryService;

async function runCreditCardPaymentCategorySync(userId, reason = 'sync') {
    if (!userId || !syncCreditCardPaymentCategoriesForUser) return null;
    try {
        const db = await getDatabase();
        return await syncCreditCardPaymentCategoriesForUser(db, userId, { reason });
    } catch (err) {
        console.warn('[cc-payment-category] sync failed:', err.message);
        return null;
    }
}

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

const transactionLifecycle = requireModule('../services/transactions/transactionLifecycle.cjs') || {
    runPostTransactionEffects: async () => {}
};
const transactionCategorizationModule =
    requireModule('../services/transactions/transactionCategorizationService.cjs') ||
    require(path.join(__dirname, '../services/transactions/transactionCategorizationService.cjs'));
const transactionCategorizationService =
    transactionCategorizationModule?.transactionCategorizationService ||
    transactionCategorizationModule;
const transactionImportService = requireModule('../services/transactions/transactionImportService.cjs');
const importCategoryMapping = requireModule('../services/transactions/importCategoryMapping.cjs');
const accountAdjustmentService =
    requireModule('../services/accounts/accountAdjustmentService.cjs') || {};
const scheduledTransactionService =
    requireModule('../services/accounts/scheduledTransactionService.cjs') || {};

console.log('   - transactionImportService loaded:', !!transactionImportService, transactionImportService?.readImportFile ? '(readImportFile ok)' : '(MISSING — check main log above)');

console.log('   - accountService loaded:', !!accountService, '📦📦📦 SERVICE LOADING STATUS 📦📦📦');
console.log('   - accountService.getAccountsSummary exists:', !!(accountService && typeof accountService.getAccountsSummary === 'function'));
console.log('   - userService loaded:', !!userService);
console.log('   - settingsService loaded:', !!settingsService);
console.log('   - TransactionService loaded:', !!TransactionService);

const {
    getPlaidConfig,
    createPlaidClient,
    sanitizeLinkedItemRow,
    buildLinkTokenCreatePayload,
    formatPlaidApiError,
    redactPlaidLogMessage,
    getLinkTokenProducts,
} = requireModule('../services/plaid/plaidService.cjs') || {};
const plaidSync = requireModule('../services/plaid/plaidSync.cjs') || {};
const plaidAccountMatch = requireModule('../services/plaid/plaidAccountMatch.cjs') || {};
const extensionBridgeModule = requireModule('../services/extension/extensionBridge.cjs') || {};
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
let extensionBridge = null;
let ipcHandlersRegistered = false;
let backgroundSyncInterval = null;
let focusSyncTimeout = null;
let lastFocusPlaidSyncAt = 0;
const FOCUS_SYNC_COOLDOWN_MS = 60_000;
let pendingPlaidOAuthUrl = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.quit();
}

function logPlaidError(context, error) {
    const message = formatPlaidApiError ? formatPlaidApiError(error) : error?.message || String(error);
    const safe = redactPlaidLogMessage ? redactPlaidLogMessage(message) : message;
    console.error(`[Plaid] ${context}:`, safe);
    return safe;
}

function sendPlaidOAuthRedirectToRenderer(url) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('plaid-oauth-redirect', { url });
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    } else {
        pendingPlaidOAuthUrl = url;
    }
}

function handlePlaidOAuthDeepLink(url) {
    if (!isPlaidOAuthDeepLink(url)) return;
    sendPlaidOAuthRedirectToRenderer(url);
}

if (gotSingleInstanceLock) {
    app.on('second-instance', (_event, argv) => {
        const url = findPlaidOAuthArgv(argv);
        if (url) handlePlaidOAuthDeepLink(url);
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.on('open-url', (event, url) => {
        event.preventDefault();
        handlePlaidOAuthDeepLink(url);
    });
}

async function registerPlaidItemsWithRelayForUser(userId) {
    if (!plaidRelayClient.registerAllPlaidItemsWithRelay) return;
    const db = await getDatabase();
    const rows = await db.all(`SELECT id, user_id FROM plaid_items WHERE user_id = ?`, [userId]);
    await plaidRelayClient.registerAllPlaidItemsWithRelay(() =>
        rows.map((row) => ({ itemId: row.id, userId: row.user_id }))
    );
}

// ==================== DATABASE PATH HELPER (UPDATED) ====================
// This function now delegates to the centralized database configuration
function getDatabasePath() {
    const dbPath = getConfiguredDatabasePath();
    console.log(`📂 Database path resolved: ${dbPath}`);
    return dbPath;
}

async function createDatabaseSnapshot() {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        throw new Error('Database file does not exist');
    }
    const snapshotPath = path.join(app.getPath('temp'), `intentflow-db-snapshot-${Date.now()}.db`);
    if (fs.existsSync(snapshotPath)) {
        fs.unlinkSync(snapshotPath);
    }

    const snapshotTimeoutMs = 60000;
    const sqlite3 = require('sqlite3');

    const copySnapshotFiles = () => {
        fs.copyFileSync(dbPath, snapshotPath);
        for (const suffix of ['-wal', '-shm']) {
            const sidecar = `${dbPath}${suffix}`;
            if (fs.existsSync(sidecar)) {
                try {
                    fs.copyFileSync(sidecar, `${snapshotPath}${suffix}`);
                } catch (sidecarErr) {
                    console.warn(`⚠️ Could not copy ${suffix} for snapshot:`, sidecarErr.message);
                }
            }
        }
    };

    if (typeof sqlite3.Database.prototype.backup === 'function') {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Database snapshot timed out'));
            }, snapshotTimeoutMs);
            const source = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (openErr) => {
                if (openErr) {
                    clearTimeout(timer);
                    reject(openErr);
                    return;
                }
                source.backup(snapshotPath, (backupErr) => {
                    clearTimeout(timer);
                    source.close(() => {
                        if (backupErr) {
                            reject(backupErr);
                        } else {
                            resolve();
                        }
                    });
                });
            });
        });
        return snapshotPath;
    }

    if (db && typeof db.exec === 'function') {
        try {
            await Promise.race([
                db.exec('PRAGMA wal_checkpoint(PASSIVE)'),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('WAL checkpoint timed out')), 8000);
                }),
            ]);
        } catch (checkpointError) {
            console.warn('⚠️ WAL checkpoint skipped before snapshot:', checkpointError.message);
        }
    }

    copySnapshotFiles();
    return snapshotPath;
}

async function restoreEncryptedBackup({ password, backupFilePath, mode = 'in-place' }) {
    const dbPath = getDatabasePath();
    const rollbackTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rollbackPath = path.join(path.dirname(dbPath), `${path.basename(dbPath)}.rollback-${rollbackTimestamp}`);
    const sideBySidePath = path.join(path.dirname(dbPath), `${path.basename(dbPath)}.restored-${rollbackTimestamp}`);
    let rollbackCreated = false;
    const destinationPath = mode === 'side-by-side' ? sideBySidePath : dbPath;

    try {
        if (mode === 'in-place' && fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, rollbackPath);
            rollbackCreated = true;
        }

        if (mode === 'in-place' && db && typeof db.close === 'function') {
            try {
                await db.close();
            } catch (closeError) {
                console.warn('⚠️ Failed closing DB before restore:', closeError.message);
            }
            db = null;
        }

        const result = await fileEncryption.decryptFile(backupFilePath, password, destinationPath);
        if (!result.success) {
            if (rollbackCreated && fs.existsSync(rollbackPath)) {
                try {
                    fs.copyFileSync(rollbackPath, dbPath);
                } catch (restoreError) {
                    console.error('❌ Failed rollback after restore failure:', restoreError.message);
                }
            }
            return result;
        }

        if (mode === 'in-place') {
            setTimeout(() => {
                app.relaunch();
                app.exit(0);
            }, 600);
        }

        return {
            success: true,
            message: mode === 'in-place'
                ? 'Backup restored successfully. Restarting the application now.'
                : `Backup restored to side-by-side copy at ${destinationPath}`,
            rollbackBackup: rollbackCreated ? rollbackPath : null,
            restoredPath: destinationPath
        };
    } catch (error) {
        console.error('❌ Restore encrypted backup failed:', error);
        if (rollbackCreated && fs.existsSync(rollbackPath)) {
            try {
                fs.copyFileSync(rollbackPath, dbPath);
            } catch (restoreError) {
                console.error('❌ Failed rollback after exception:', restoreError.message);
            }
        }
        return { success: false, error: error.message };
    }
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
        path.join(process.resourcesPath, 'db', 'data', 'app.db'),
        path.join(process.resourcesPath, 'db', 'data', 'production-seed.db'),
        path.join(process.resourcesPath, 'db', 'production-seed.db'),
        path.join(__dirname, '../../src/db/data/production-seed.db'),
        path.join(__dirname, '../../src/db/data/app.db'),
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
            if (!db.__intentflowPragmasApplied) {
                const { applySqlitePragmas } = require(path.join(__dirname, '../db/sqlitePragmas.cjs'));
                await applySqlitePragmas(db);
                db.__intentflowPragmasApplied = true;
            }
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
        const { applySqlitePragmas } = require(path.join(__dirname, '../db/sqlitePragmas.cjs'));
        await applySqlitePragmas(db);
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

const { setGetDatabaseProvider } = require(path.join(__dirname, '../db/database.cjs'));
setGetDatabaseProvider(() => getDatabase());

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
function getPlaidSyncDeps() {
    return {
        getDatabase,
        decryptToken,
        updateAccountBalances,
        ensureCreditCardPaymentCategoriesForUser: async (userId) => {
            return runCreditCardPaymentCategorySync(userId, 'plaid_sync');
        },
        refreshBudgetAfterTransactions: async (userId, dates) => {
            if (!userId || !transactionLifecycle?.runPostTransactionEffects) return;
            await transactionLifecycle.runPostTransactionEffects(userId, {
                dates: dates || [],
                forwardMonths: 6,
            });
            notifyBudgetStateChanged('prosperity:updated', {
                userId,
                reason: 'plaid:transactions',
            });
        },
        applyCreditCardPaymentReserveDelta: async ({ userId, accountId, date, delta }) => {
            const { applyCreditCardPaymentReserveDelta: applyReserve } = require('../services/transactions/creditCardReserveUtils.cjs');
            const db = await getDatabase();
            await applyReserve(db, { userId, accountId, date, delta });
        },
    };
}

function notifyAccountsUpdated(source = 'plaid') {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('accounts-updated', { source });
    }
}

async function updateAccountBalances(accountId) {
    const dbPath = getConfiguredDatabasePath();
    const ts = new TransactionService(dbPath);
    try {
        await ts.updateAccountBalances(accountId);
    } catch (error) {
        console.error(`❌ Failed to update balance for account ${accountId}:`, error);
    }
}

async function syncTransactionsForItem(itemId) {
    if (!plaidSync.syncTransactionsForItem) {
        throw new Error('Plaid sync module not loaded');
    }
    return plaidSync.syncTransactionsForItem(itemId, getPlaidSyncDeps());
}

async function syncPlaidAccounts(itemId) {
    if (!plaidSync.syncPlaidAccounts) {
        throw new Error('Plaid sync module not loaded');
    }
    try {
        return await plaidSync.syncPlaidAccounts(itemId, getPlaidSyncDeps());
    } catch (error) {
        if (error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') {
            return { success: false, error: 'ITEM_LOGIN_REQUIRED', itemId };
        }
        throw error;
    }
}

async function runPlaidBackgroundSync(source = 'background') {
    if (!plaidSync.syncPlaidAccounts) return;
    const currentUser = userService.getCurrentUser();
    if (!currentUser) return;

    const db = await getDatabase();
    const row = await db.get(
        `SELECT value FROM user_settings WHERE user_id = ? AND key = ?`,
        [currentUser.id, 'autoSyncEnabled']
    );
    const autoSyncEnabled = row ? row.value !== 'false' : true;
    if (!autoSyncEnabled) return;

    const cfg = getPlaidConfig ? getPlaidConfig() : { configured: false };
    if (!cfg.configured) return;

    console.log(`🔄 Running Plaid sync (${source})...`);
    try {
        await registerPlaidItemsWithRelayForUser(currentUser.id);

        if (plaidSync.pollPlaidWebhookRelay && process.env.PLAID_WEBHOOK_RELAY_URL) {
            const relayResult = await plaidSync.pollPlaidWebhookRelay(
                currentUser.id,
                async (itemId) => {
                    await verifyPlaidItemOwnership(itemId);
                    await syncPlaidAccounts(itemId);
                    await syncTransactionsForItem(itemId);
                },
                {
                    handlePendingExpiration: (itemId, uid) =>
                        plaidSync.handlePendingExpiration(itemId, uid, getPlaidSyncDeps()),
                }
            );
            if (relayResult?.synced?.length) {
                console.log(`📡 Webhook relay triggered sync for ${relayResult.synced.length} item(s)`);
            }
            if (relayResult?.error) {
                logPlaidError(`webhook relay poll (${source})`, new Error(relayResult.error));
            }
        }

        const items = await getLinkedItemsSafe();
        for (const item of items) {
            try {
                await syncPlaidAccounts(item.id);
                const result = await syncTransactionsForItem(item.id);
                if (result.success && result.transactionsAdded > 0) {
                    console.log(
                        `✅ Plaid sync (${source}) ${item.institution_name || item.id}: ${result.transactionsAdded} new txns`
                    );
                }
            } catch (err) {
                logPlaidError(`sync item ${item.id} (${source})`, err);
            }
        }
        notifyAccountsUpdated(`plaid-${source}`);
    } catch (error) {
        logPlaidError(`sync (${source})`, error);
    }
}

function scheduleFocusPlaidSync() {
    if (focusSyncTimeout) clearTimeout(focusSyncTimeout);
    focusSyncTimeout = setTimeout(async () => {
        const now = Date.now();
        if (now - lastFocusPlaidSyncAt < FOCUS_SYNC_COOLDOWN_MS) return;
        lastFocusPlaidSyncAt = now;
        await runPlaidBackgroundSync('focus');
    }, 2000);
}

async function getLinkedItemsSafe() {
    const currentUser = userService.getCurrentUser();
    if (!currentUser) return [];
    const db = await getDatabase();
    const rows = await db.all(
        `SELECT id, user_id, institution_id, institution_name, created_at, updated_at, last_sync, status, last_error, consent_expires_at
         FROM plaid_items WHERE user_id = ? ORDER BY created_at DESC`,
        [currentUser.id]
    );
    return rows.map((row) => (sanitizeLinkedItemRow ? sanitizeLinkedItemRow(row) : row));
}

async function verifyPlaidItemOwnership(itemId) {
    const currentUser = userService.getCurrentUser();
    if (!currentUser) throw new Error('Not logged in');
    const db = await getDatabase();
    if (plaidSync.assertItemOwnedByUser) {
        return plaidSync.assertItemOwnedByUser(db, itemId, currentUser.id);
    }
    const item = await db.get('SELECT * FROM plaid_items WHERE id = ? AND user_id = ?', [
        itemId,
        currentUser.id,
    ]);
    if (!item) throw new Error('Item not found or not owned by user');
    return item;
}

async function startExtensionBridge() {
    if (extensionBridge || typeof extensionBridgeModule.createExtensionBridge !== 'function') {
        return;
    }

    extensionBridge = extensionBridgeModule.createExtensionBridge({
        appVersion: app.getVersion(),
        getDatabase,
        accountService,
        monthlyBudgetService,
        userService,
        updateService,
        requestPairingApproval: async (payload = {}) => {
            const source = payload.browser || payload.clientName || 'a browser extension';
            const detail = payload.extensionId ? `\n\nExtension ID: ${payload.extensionId}` : '';
            const result = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                buttons: ['Allow', 'Deny'],
                defaultId: 0,
                cancelId: 1,
                title: 'Pair IntentFlow Browser Extension',
                message: 'Allow this browser extension to connect to IntentFlow?',
                detail: `${source} wants to read dashboard summaries and save captured pages to IntentFlow.${detail}`,
                normalizeAccessKeys: true,
            });
            return result.response === 0;
        },
    });

    try {
        await extensionBridge.start();
    } catch (error) {
        console.warn('⚠️ IntentFlow extension bridge disabled:', error.message);
        extensionBridge = null;
    }
}

// ==================== APP INITIALIZATION ====================
if (gotSingleInstanceLock) {
app.whenReady().then(async () => {
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient(PLAID_OAUTH_SCHEME, process.execPath, [
                path.resolve(process.argv[1]),
            ]);
        }
    } else {
        app.setAsDefaultProtocolClient(PLAID_OAUTH_SCHEME);
    }

    const launchOAuthUrl = findPlaidOAuthArgv(process.argv);
    if (launchOAuthUrl) pendingPlaidOAuthUrl = launchOAuthUrl;

    const plaidEnvLoad = loadPlaidEnvFromUserData(() => app.getPath('userData'));
    if (plaidEnvLoad.loaded) {
        console.log(`✅ Plaid env loaded from userData (${plaidEnvLoad.keysSet} keys)`);
    }

    console.log('🚀 Starting IntentFlow...');
    console.log('🔍 app.isPackaged:', app.isPackaged);
    console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
    console.log('🔍 isDev:', isDev);
    console.log('🔍 Current directory:', __dirname);
    const preloadResolved = resolvePreloadPath();
    console.log('🔍 Preload path:', preloadResolved);
    console.log('🔍 Preload exists:', fs.existsSync(preloadResolved));

    if (createSplashWindow) {
        splashWindow = createSplashWindow();
    }

    try {
        if (app.isPackaged) {
            await initializeProductionDatabase();
        }
        db = await initDatabase();
        console.log('✅ Database initialized successfully');

        setupIpcHandlers();
        console.log('✅ All IPC handlers registered');

        await startExtensionBridge();

        ipcMain.removeAllListeners('navigate-to');
        ipcMain.on('navigate-to', (_event, routePath) => {
            if (isDev || !mainWindow || mainWindow.isDestroyed()) return;
            try {
                const target = routePathToStaticHtml(routePath);
                console.log('🔀 navigate-to IPC:', routePath, '→', target);
                mainWindow.loadFile(target).catch((err) => console.error('navigate-to load failed:', err));
            } catch (err) {
                console.error('navigate-to error:', err);
            }
        });

        await createWindow();

        if (pendingPlaidOAuthUrl) {
            handlePlaidOAuthDeepLink(pendingPlaidOAuthUrl);
            pendingPlaidOAuthUrl = null;
        }

        const currentUser = userService.getCurrentUser();
        if (currentUser?.id) {
            registerPlaidItemsWithRelayForUser(currentUser.id).catch((err) => {
                logPlaidError('relay registration on startup', err);
            });
            runCreditCardPaymentCategorySync(currentUser.id, 'app_startup').catch(() => {});
        }

        backgroundSyncInterval = setInterval(() => runPlaidBackgroundSync('background'), 3600000);
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        dialog.showErrorBox(
            'Database Error',
            `Failed to initialize database: ${error.message}\n\nThe app will now exit.`
        );
        app.quit();
    }
});
}

// ==================== WINDOW CREATION ====================
function createWindow() {
    console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
    console.log('🔍 isDev:', isDev);

    const win = new BrowserWindow({
        title: 'IntentFlow',
        width: 1200,
        height: 800,
        show: false,
        webPreferences: {
            preload: resolvePreloadPath(),
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

    attachEditableContextMenu(win.webContents);

    win.on('focus', () => scheduleFocusPlaidSync());

    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        const levels = ['log', 'warn', 'error', 'debug'];
        const label = levels[level] || 'log';
        const location = sourceId ? ` (${sourceId}:${line})` : '';
        console[label === 'error' ? 'error' : label === 'warn' ? 'warn' : 'log'](
            `🖥️ Renderer ${label}: ${message}${location}`
        );
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        console.error('❌ Renderer did-fail-load:', { errorCode, errorDescription, validatedURL });
    });

    win.webContents.on('did-start-loading', () => {
        console.log('🌐 Renderer did-start-loading:', win.webContents.getURL());
    });

    win.webContents.on('did-frame-finish-load', (_event, isMainFrame, frameProcessId, frameRoutingId) => {
        if (isMainFrame) {
            console.log('🌐 Renderer main frame finished:', {
                url: win.webContents.getURL(),
                frameProcessId,
                frameRoutingId,
            });
        }
    });

    win.webContents.on('render-process-gone', (_event, details) => {
        console.error('❌ Renderer process gone:', details);
    });

    if (isDev) {
        const devPort = process.env.PORT || 3000;
        const devUrl = `http://127.0.0.1:${devPort}/`;
        console.log('🛠️ Loading development frontend from:', devUrl);
        const requestFilter = { urls: [`http://127.0.0.1:${devPort}/*`, `http://localhost:${devPort}/*`] };
        win.webContents.session.webRequest.onCompleted(requestFilter, (details) => {
            if (details.type === 'mainFrame' || details.url === devUrl) {
                console.log('🌐 Renderer request completed:', {
                    url: details.url,
                    type: details.type,
                    statusCode: details.statusCode,
                    fromCache: details.fromCache,
                    error: details.error,
                });
            }
        });
        win.webContents.session.webRequest.onErrorOccurred(requestFilter, (details) => {
            console.error('❌ Renderer request failed:', {
                url: details.url,
                type: details.type,
                error: details.error,
            });
        });
        mainWindow.loadURL(devUrl).catch((err) => {
            console.error('❌ Failed to load development frontend:', err.message);
        });
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        const indexPath = getProductionFilePath('index.html');
        console.log('📄 Loading production file:', indexPath);

        if (fs.existsSync(indexPath)) {
            win.loadFile(indexPath).catch(err => {
                console.error('❌ Failed to load index.html:', err);
            });
            // Never auto-open DevTools in production.
            if (isDev) {
                win.webContents.openDevTools({ mode: 'right' });
            }
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
            const target = resolveStaticHtmlFromFileUrl(url);
            console.log('📄 Resolved static HTML:', target);
            win.loadFile(target).catch((err) => {
                console.error('❌ Failed to load resolved page:', err);
                win.loadFile(getProductionFilePath('index.html')).catch(() => {});
            });
        }
    });

    win.webContents.on('did-finish-load', () => {
        console.log('✅ Page loaded successfully');

        win.webContents.executeJavaScript(`
            (() => {
                const next = document.getElementById('__next');
                const bodyStyle = window.getComputedStyle(document.body);
                const nextStyle = next ? window.getComputedStyle(next) : null;
                const snapshot = {
                    href: window.location.href,
                    title: document.title,
                    readyState: document.readyState,
                    bodyDisplay: bodyStyle.display,
                    bodyVisibility: bodyStyle.visibility,
                    bodyBg: bodyStyle.backgroundColor,
                    bodyTextLength: document.body.innerText.length,
                    bodyHtmlLength: document.body.innerHTML.length,
                    nextExists: !!next,
                    nextChildCount: next ? next.children.length : 0,
                    nextDisplay: nextStyle ? nextStyle.display : null,
                    nextHtmlLength: next ? next.innerHTML.length : 0,
                    bootEvents: window.__INTENTFLOW_BOOT_EVENTS__ || [],
                    electronApiKeys: window.electronAPI ? Object.keys(window.electronAPI).slice(0, 12) : []
                };
                document.body.style.display = 'block';
                document.body.style.visibility = 'visible';
                if (next) {
                    next.style.display = 'block';
                    next.style.visibility = 'visible';
                    next.style.minHeight = '100vh';
                }
                console.log('[IntentFlow DOM snapshot] ' + JSON.stringify(snapshot));
                return snapshot;
            })();
        `).then((snapshot) => {
            console.log('🧭 Renderer DOM snapshot:', snapshot);
        }).catch((err) => {
            console.error('❌ Renderer DOM snapshot failed:', err.message);
        });

        if (!isDev) {
            win.webContents
                .executeJavaScript(
                    `window.dispatchEvent(new CustomEvent('electronAPI-ready')); true;`
                )
                .catch((err) => console.warn('⚠️ electronAPI-ready dispatch:', err.message));
        }

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
                if (!link) return;
                const raw = link.getAttribute('href');
                if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return;
                e.preventDefault();
                const path = raw.split('#')[0];
                if (window.electronAPI && window.electronAPI.send) {
                    window.electronAPI.send('navigate-to', path);
                }
            });
            
            console.log('✅ Client-side routing handler installed');
        `).catch(err => console.error('Failed to inject routing handler:', err));
        }
    });

    win.once('ready-to-show', () => {
        win.show();
        console.log('🔵 Main window ready-to-show');
        if (isDev) {
            win.webContents.openDevTools({ mode: 'right' });
        }
        win.focus();
    });

    return win;
}

/**
 * Normalize UI / IPC account payloads into a single row shape for INSERT.
 * Aligns checking/savings/credit/loan modals with the `accounts` table.
 */
function _emptyToNull(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    return v;
}

function _parseOptNumber(v) {
    if (v === '' || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function _parseOptInt(v) {
    if (v === '' || v === undefined || v === null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
}

async function finalizeManualAccountWithStartingBalance(db, accountId, userId) {
    const account = await db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
    if (!account) return null;

    const initialBalance = Math.abs(Number(account.initial_balance) || 0);
    if (initialBalance === 0) return account;

    const existingSystem = await db.get(
        `SELECT id FROM transactions WHERE account_id = ? AND IFNULL(is_system, 0) = 1 LIMIT 1`,
        [accountId]
    );
    if (existingSystem) return account;

    const dbPath = getDatabasePath();
    const txService = new TransactionService(dbPath);
    await txService.createStartingBalanceTransaction(db, account, userId);
    await txService.updateAccountBalances(accountId);
    return db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
}

function buildAccountInsertFromPayload(accountData, accountId, userId) {
    const type = accountData.type || 'checking';
    let balance = Number(accountData.balance);
    if (!Number.isFinite(balance)) balance = 0;
    if (type === 'credit' || type === 'loan') {
        balance = -Math.abs(balance);
    } else {
        balance = Math.abs(balance);
    }

    const paymentRaw =
        accountData.payment_amount ??
        accountData.monthly_payment ??
        accountData.monthlyPayment ??
        accountData.paymentAmount;
    const payment_amount = _parseOptNumber(paymentRaw);

    const interestRaw = accountData.interest_rate ?? accountData.apr ?? null;
    const interest_rate = _parseOptNumber(interestRaw);

    const cleared =
        accountData.cleared_balance !== undefined && Number.isFinite(Number(accountData.cleared_balance))
            ? Number(accountData.cleared_balance)
            : balance;
    const working =
        accountData.working_balance !== undefined && Number.isFinite(Number(accountData.working_balance))
            ? Number(accountData.working_balance)
            : balance;

    const initialBalanceRaw =
        accountData.initial_balance !== undefined && Number.isFinite(Number(accountData.initial_balance))
            ? Math.abs(Number(accountData.initial_balance))
            : Math.abs(balance);

    const now = new Date().toISOString();

    return {
        id: accountId,
        user_id: userId,
        name: (accountData.name || 'New Account').toString().trim() || 'New Account',
        type,
        balance,
        initial_balance: initialBalanceRaw,
        cleared_balance: cleared,
        working_balance: working,
        account_type_category: accountData.account_type_category || (type === 'loan' ? 'loan' : type === 'credit' ? 'credit' : 'budget'),
        currency: accountData.currency || 'USD',
        institution: _emptyToNull(accountData.institution),
        credit_limit: _parseOptNumber(accountData.credit_limit ?? accountData.limit),
        interest_rate,
        due_date: _emptyToNull(accountData.due_date || accountData.dueDate),
        minimum_payment: _parseOptNumber(accountData.minimum_payment ?? accountData.minimumPayment),
        original_balance: _parseOptNumber(accountData.original_balance),
        term_months: _parseOptInt(accountData.term_months ?? accountData.term),
        payment_amount,
        payment_frequency: _emptyToNull(accountData.payment_frequency) || 'monthly',
        next_payment_date: _emptyToNull(accountData.next_payment_date || accountData.nextPaymentDate),
        is_active: 1,
        created_at: now,
        updated_at: now,
        account_number: _emptyToNull(accountData.account_number),
        routing_number: _emptyToNull(accountData.routing_number),
        debit_card_number: _emptyToNull(accountData.debit_card_number),
        daily_withdrawal_limit: _parseOptNumber(accountData.daily_withdrawal_limit),
        overdraft_protection: accountData.overdraft_protection ? 1 : 0,
        notes: _emptyToNull(accountData.notes),
        account_holder_name: _emptyToNull(accountData.account_holder_name),
        loan_type: _emptyToNull(accountData.loan_type),
        paired_category_id: _emptyToNull(accountData.paired_category_id),
        rewards_program: _emptyToNull(accountData.rewards_program),
        transfer_limit: _parseOptNumber(accountData.transfer_limit),
        linked_savings_account: _emptyToNull(accountData.linked_savings_account)
    };
}

function getDialogParentWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
    const focused = BrowserWindow.getFocusedWindow();
    if (focused && !focused.isDestroyed()) return focused;
    return null;
}

function resolveTransactionImportContent(payload = {}) {
    const { content, filePath, fileName } = payload;
    if (content) {
        return { ok: true, content: String(content), fileName: fileName || '' };
    }
    if (!filePath) {
        return { ok: false, error: 'Import file path or content is required' };
    }
    if (!transactionImportService?.readImportFile) {
        return { ok: false, error: 'Transaction import service unavailable' };
    }
    const read = transactionImportService.readImportFile(filePath);
    if (!read.ok) return read;
    return {
        ok: true,
        content: read.content,
        fileName: fileName || read.fileName || path.basename(filePath),
    };
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
        'accounts:delete', 'accounts:permanentDeleteCredit', 'accounts:permanentDeleteLoan', 'accounts:getBalances', 'accounts:getSummary', 'accounts:getTotals',
        'accounts:startReconciliation', 'accounts:getCreditCardDetails', 'getTransactions',
        'addTransaction', 'updateTransaction', 'deleteTransaction', 'getAccountTransactions',
        'toggleTransactionCleared', 'reconcileAccount', 'get-accounts', 'getAccounts',
        'get-account', 'update-account', 'delete-account', 'get-account-transactions',
        'get-accounts-dashboard', 'get-account-details', 'create-account', 'getCategories',
        'get-categories', 'create-category', 'delete-category', 'update-category',
        'updateCategory', 'budget:getMonthSnapshot', 'budget:getCategoryActivityTransactionIds', 'budget:listTimelineMonths', 'get-groups', 'create-group', 'update-group', 'delete-group',
        'get-groups-with-categories', 'save-settings', 'get-network-status',
        'subscribe-to-event', 'publish-event', 'validation:trackAccuracy', 'validation:getTrends',
        'validation:getCategoryAccuracy', 'validation:getConfidence', 'debug-db-path',
        'debug-category-schema', 'deleteCategory', 'debug-account-creation',
        'category:archive', 'category:restore', 'category:getArchived', 'category:toggleHide',
        'debug:test-database-write', 'debug:get-database-info', 'debug:test-group-delete',
        'debug:check-permissions',
        'transactions:pickImportFile', 'transactions:previewImport', 'transactions:executeImport',
        'import-get-category-mappings', 'import-list-category-mappings',
        'import-delete-category-mapping', 'import-save-category-mappings'
    ];

    handlersToRemove.forEach(handler => {
        try { ipcMain.removeHandler(handler); } catch (e) { }
    });

    // ==================== PING HANDLER ====================
    ipcMain.handle('ping', () => {
        console.log('🔍 ping received');
        return { success: true, message: 'pong' };
    });

    ipcMain.handle('window:maximize', () => {
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
        if (win && !win.isMaximized()) {
            win.maximize();
        }
        return { success: true, maximized: win ? win.isMaximized() : false };
    });

    ipcMain.handle('window:is-maximized', () => {
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
        return { success: true, maximized: win ? win.isMaximized() : false };
    });

    ipcMain.handle('app:quit', () => {
        app.quit();
        return { success: true };
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

    ipcMain.handle('scheduled-transactions:post', async (event, scheduledId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            if (!scheduledTransactionService?.postScheduledTransaction) {
                return { success: false, error: 'Scheduled post service unavailable' };
            }
            const db = await getDatabase();
            const dbPath = getDatabasePath();
            const data = await scheduledTransactionService.postScheduledTransaction(
                db,
                dbPath,
                currentUser.id,
                scheduledId
            );
            notifyBudgetStateChanged('prosperity:updated', {
                userId: currentUser.id,
                reason: 'scheduled:posted',
            });
            notifyAccountsUpdated('scheduled-post');
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
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
            if (user?.id) {
                registerPlaidItemsWithRelayForUser(user.id).catch((err) => {
                    logPlaidError('relay registration on login', err);
                });
                runCreditCardPaymentCategorySync(user.id, 'login').catch(() => {});
            }
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

    registerBackupIpcHandlers(ipcMain, {
        fileEncryption,
        getDatabasePath,
        createDbSnapshot: createDatabaseSnapshot,
        restoreFromEncrypted: restoreEncryptedBackup
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

    // ==================== PROSPERITY MAP TABLE IMPORT / EXPORT ====================
    ipcMain.handle('budget:exportProsperityTable', async (event, { userId, monthKey, format }) => {
        try {
            if (!budgetTableImportExport) {
                return { success: false, error: 'Budget table export service unavailable' };
            }
            const db = await getDatabase();
            const currentUser = userService.getCurrentUser();
            const ownerId = userId || currentUser?.id;
            if (!ownerId) return { success: false, error: 'No user logged in' };

            const mKey = monthlyBudgetService.toLocalMonthKey(monthKey || new Date());
            const snapshot = await monthlyBudgetService.getBudgetMonthSnapshot(db, ownerId, mKey);
            const fmt = String(format || 'csv').toLowerCase() === 'json' ? 'json' : 'csv';
            const defaultName = `prosperity-map-${mKey.slice(0, 7)}.${fmt === 'json' ? 'json' : 'csv'}`;

            const saveResult = await dialog.showSaveDialog({
                title: 'Export Prosperity Map',
                defaultPath: path.join(os.homedir(), 'Desktop', defaultName),
                filters: [
                    fmt === 'json'
                        ? { name: 'JSON', extensions: ['json'] }
                        : { name: 'CSV', extensions: ['csv'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
            });
            if (saveResult.canceled || !saveResult.filePath) {
                return { success: false, canceled: true };
            }

            let content;
            if (fmt === 'json') {
                const payload = budgetTableImportExport.buildExportPayload(snapshot);
                content = JSON.stringify(payload, null, 2);
            } else {
                const rows = budgetTableImportExport.buildExportRows(snapshot);
                content = budgetTableImportExport.buildCsvFromRows(
                    rows.map((r) => ({
                        group: r.group,
                        category: r.category,
                        assigned: r.assigned,
                        activity: r.activity,
                        available: r.available,
                        progress: r.progress,
                        goalTarget: r.goalTarget,
                        goalType: r.goalType,
                        month: r.month,
                      }))
                );
            }
            fs.writeFileSync(saveResult.filePath, content, 'utf8');
            return {
                success: true,
                filePath: saveResult.filePath,
                rowCount: (snapshot.categories || []).length,
                monthKey: mKey,
                format: fmt,
            };
        } catch (error) {
            console.error('budget:exportProsperityTable error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:pickProsperityImportFile', async () => {
        try {
            const openResult = await dialog.showOpenDialog({
                title: 'Import Prosperity Map',
                filters: [
                    { name: 'Spreadsheet', extensions: ['csv', 'xlsx', 'xls'] },
                    { name: 'JSON', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
                properties: ['openFile'],
            });
            if (openResult.canceled || !openResult.filePaths?.length) {
                return { success: false, canceled: true };
            }
            const filePath = openResult.filePaths[0];
            const format = budgetTableImportExport.detectFormat(path.basename(filePath), '');
            return {
                success: true,
                format,
                fileName: path.basename(filePath),
                filePath,
            };
        } catch (error) {
            console.error('budget:pickProsperityImportFile error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:previewProsperityImport', async (event, { userId, monthKey, content, format, filePath, fileName }) => {
        try {
            if (!budgetTableImportExport) {
                return { success: false, error: 'Budget table import service unavailable' };
            }
            const db = await getDatabase();
            const currentUser = userService.getCurrentUser();
            const ownerId = userId || currentUser?.id;
            if (!ownerId) return { success: false, error: 'No user logged in' };

            const mKey = monthlyBudgetService.toLocalMonthKey(monthKey || new Date());
            const snapshot = await monthlyBudgetService.getBudgetMonthSnapshot(db, ownerId, mKey);
            let importContent = content;
            let detectedName = fileName || '';
            if (filePath) {
                detectedName = detectedName || path.basename(filePath);
                const fmt = budgetTableImportExport.detectFormat(detectedName, '');
                importContent =
                    fmt === 'xlsx' || fmt === 'xls'
                        ? fs.readFileSync(filePath)
                        : fs.readFileSync(filePath, 'utf8');
            }
            const parsed = budgetTableImportExport.parseImportContent(importContent, format, detectedName);
            const preview = budgetTableImportExport.previewImport(
                snapshot,
                parsed.rows,
                mKey,
                monthlyBudgetService.toLocalMonthKey.bind(monthlyBudgetService)
            );
            return { success: true, data: preview };
        } catch (error) {
            console.error('budget:previewProsperityImport error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:applyProsperityImport', async (event, { userId, monthKey, items, options }) => {
        try {
            if (!budgetTableImportExport) {
                return { success: false, error: 'Budget table import service unavailable' };
            }
            const db = await getDatabase();
            const currentUser = userService.getCurrentUser();
            const ownerId = userId || currentUser?.id;
            if (!ownerId) return { success: false, error: 'No user logged in' };

            const mKey = monthlyBudgetService.toLocalMonthKey(monthKey || new Date());
            const applyResult = await budgetTableImportExport.applyImport(
                db,
                ownerId,
                mKey,
                items || [],
                options,
                { monthlyBudgetService, notifyBudgetStateChanged }
            );
            return { success: true, data: applyResult };
        } catch (error) {
            console.error('budget:applyProsperityImport error:', error);
            return { success: false, error: error.message };
        }
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
                return { success: false, error: 'No user ID provided', data: { paymentPayees: [], transferPayees: [], regularPayees: [] } };
            }
            const result = await payeeService.getPayeesForForm(effectiveUserId, currentAccountId);
            return { success: true, data: result };
        } catch (error) {
            console.error('Error in get-payees-for-form:', error);
            return { success: false, error: error.message, data: { paymentPayees: [], transferPayees: [], regularPayees: [] } };
        }
    });

    // Create a linked transfer transaction (two-sided)
    ipcMain.handle('create-linked-transfer', async (event, transferData) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'No user logged in' };
            }
            const db = await getDatabase();

            const result = await payeeService.createLinkedTransfer({
                ...transferData,
                userId: currentUser.id
            });

            if (result?.success && transactionLifecycle?.runPostTransactionEffects) {
                try {
                    const txDate = transferData.date || new Date().toISOString().split('T')[0];
                    await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                        accountIds: [transferData.sourceAccountId, transferData.destinationAccountId],
                        dates: [txDate],
                        skipLedgerSync: true,
                        db,
                        poolTransferPair: {
                            sourceAccountId: transferData.sourceAccountId,
                            destinationAccountId: transferData.destinationAccountId,
                            amount: transferData.amount,
                        },
                    });
                } catch (e) {
                    console.warn('post-transaction budget refresh (create-linked-transfer):', e?.message || e);
                }
            }
            const destinationAccount = await db.get(
                'SELECT id, type FROM accounts WHERE id = ? AND user_id = ?',
                [transferData.destinationAccountId, currentUser.id]
            );
            const sourceAccount = await db.get(
                'SELECT id, type FROM accounts WHERE id = ? AND user_id = ?',
                [transferData.sourceAccountId, currentUser.id]
            );
            if (destinationAccount?.type === 'credit' && sourceAccount?.type !== 'credit') {
                await refreshCreditCardPaymentCategoryEnvelope(db, {
                    userId: currentUser.id,
                    accountId: destinationAccount.id,
                    date: transferData.date || new Date().toISOString().split('T')[0],
                    userIntentAssignment: true,
                });
            }
            notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:added' });

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

            const database = await getDatabase();
            const pre = await database.get(
                `SELECT id, account_id, date, linked_transaction_id
                 FROM transactions WHERE id = ? AND user_id = ?`,
                [transactionId, currentUser.id]
            );
            if (!pre) return { success: false, error: 'Transaction not found' };

            const result = await payeeService.updateLinkedTransfer(transactionId, currentUser.id, updates);

            const dates = [pre.date];
            if (updates.date !== undefined && updates.date !== pre.date) {
                dates.push(updates.date);
            }
            const accountIds = [pre.account_id];
            if (pre.linked_transaction_id) {
                const peer = await database.get(
                    'SELECT account_id FROM transactions WHERE id = ?',
                    [pre.linked_transaction_id]
                );
                if (peer?.account_id) accountIds.push(peer.account_id);
            }
            if (transactionLifecycle?.runPostTransactionEffects) {
                try {
                    await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                        accountIds,
                        dates,
                        skipLedgerSync: true
                    });
                } catch (e) {
                    console.warn('post-transaction budget refresh (update-linked-transfer):', e?.message || e);
                }
            }
            notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:updated' });

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

            const database = await getDatabase();
            const pre = await database.get(
                `SELECT account_id, date, linked_transaction_id, amount, counterparty_account_id, is_transfer
                 FROM transactions WHERE id = ? AND user_id = ?`,
                [transactionId, currentUser.id]
            );
            if (!pre) return { success: false, error: 'Transaction not found' };

            let peerAccountId = null;
            if (pre.linked_transaction_id) {
                const peer = await database.get(
                    'SELECT account_id FROM transactions WHERE id = ?',
                    [pre.linked_transaction_id]
                );
                if (peer) peerAccountId = peer.account_id;
            }

            const readyToAssignPoolService =
                require(path.join(__dirname, '../services/budget/readyToAssignPoolService.cjs'));
            const poolReverseTransferPair =
                readyToAssignPoolService.buildTransferPairFromTransaction(pre);

            const result = await payeeService.deleteLinkedTransfer(transactionId, currentUser.id);

            if (transactionLifecycle?.runPostTransactionEffects) {
                try {
                    await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                        accountIds: [pre.account_id, peerAccountId].filter(Boolean),
                        dates: [pre.date],
                        skipLedgerSync: true,
                        db: database,
                        poolReverseTransferPair,
                    });
                } catch (e) {
                    console.warn('post-transaction budget refresh (delete-linked-transfer):', e?.message || e);
                }
            }
            if (result?.success) {
                const creditAccountId = Number(pre.amount) > 0 ? pre.account_id : peerAccountId;
                const otherAccountId = Number(pre.amount) > 0 ? peerAccountId : pre.account_id;
                if (creditAccountId && otherAccountId) {
                    const destinationAccount = await database.get(
                        'SELECT id, type FROM accounts WHERE id = ? AND user_id = ?',
                        [creditAccountId, currentUser.id]
                    );
                    const sourceAccount = await database.get(
                        'SELECT id, type FROM accounts WHERE id = ? AND user_id = ?',
                        [otherAccountId, currentUser.id]
                    );
                    if (destinationAccount?.type === 'credit' && sourceAccount?.type !== 'credit') {
                        await refreshCreditCardPaymentCategoryEnvelope(database, {
                            userId: currentUser.id,
                            accountId: destinationAccount.id,
                            date: pre.date,
                            userIntentAssignment: true,
                        });
                    }
                }
            }
            notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:deleted' });

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
            const patch = { ...updates };
            delete patch.user_id;

            const categoryRow = await findCategoryRowById(db, categoryId);
            if (!categoryRow) {
                console.warn('updateCategory: no row for id', categoryId);
                return { success: false, error: 'Category not found' };
            }
            if (
                categoryRow.is_credit_card_payment_category === 1 &&
                patch.name !== undefined &&
                String(patch.name).trim() !== String(categoryRow.name || '').trim()
            ) {
                return { success: false, error: 'Credit card payment category names are system-managed.' };
            }

            const ownerId = categoryRow.user_id;
            const canonicalCategoryId = categoryRow.id;
            let budgetMonth = patch.budget_month;
            delete patch.budget_month;

            const moneyPatchTouchesMonthRows = patch.assigned !== undefined;
            if (
                moneyPatchTouchesMonthRows &&
                (budgetMonth === undefined || budgetMonth === null || String(budgetMonth).trim() === '')
            ) {
                budgetMonth = monthlyBudgetService.toLocalMonthKey(new Date());
                console.warn('updateCategory: budget_month missing for assigned; defaulting to', budgetMonth);
            }

            let didMonthMutation = false;
            let envelopeResult = null;
            if (budgetMonth !== undefined && budgetMonth !== null && String(budgetMonth).trim() !== '') {
                const mKey = monthlyBudgetService.toLocalMonthKey(budgetMonth);
                if (patch.assigned !== undefined) {
                    const budgetCash = await resolveBudgetCashTotal(ownerId);
                    const currentBudgeted = await monthlyBudgetService.readMonthBudgeted(
                        db,
                        ownerId,
                        canonicalCategoryId,
                        mKey
                    );
                    const assignDelta = Number(patch.assigned) - currentBudgeted;
                    if (assignDelta > 0) {
                        await monthlyBudgetService.assertSufficientReadyToAssign(
                            db,
                            ownerId,
                            assignDelta,
                            budgetCash
                        );
                    }
                    envelopeResult = await monthlyBudgetService.applyMonthBudgetedAmount(
                        db,
                        ownerId,
                        canonicalCategoryId,
                        mKey,
                        patch.assigned,
                        { auditSource: 'assign', userIntentAssignment: true }
                    );
                    delete patch.assigned;
                    didMonthMutation = true;
                } else if (patch.available !== undefined) {
                    await monthlyBudgetService.getBudgetMonthSnapshot(db, ownerId, mKey);
                    didMonthMutation = true;
                }
            }

            if (patch.available !== undefined) {
                delete patch.available;
            }
            if (patch.activity !== undefined) {
                delete patch.activity;
            }

            const setClauses = [];
            const values = [];

            if (patch.name !== undefined) {
                setClauses.push('name = ?');
                values.push(patch.name);
            }
            if (patch.assigned !== undefined) {
                setClauses.push('assigned = ?');
                values.push(patch.assigned);
            }
            if (patch.available !== undefined) {
                setClauses.push('available = ?');
                values.push(patch.available);
            }
            if (patch.activity !== undefined) {
                setClauses.push('activity = ?');
                values.push(patch.activity);
            }
            if (patch.target_amount !== undefined) {
                setClauses.push('target_amount = ?');
                values.push(patch.target_amount);
            }
            if (patch.target_type !== undefined) {
                setClauses.push('target_type = ?');
                values.push(patch.target_type);
            }
            if (patch.target_date !== undefined) {
                setClauses.push('target_date = ?');
                values.push(patch.target_date);
            }
            if (patch.target_frequency !== undefined) {
                setClauses.push('target_frequency = ?');
                values.push(patch.target_frequency);
            }

            const hadGoalPatch =
                updates.target_amount !== undefined ||
                updates.target_type !== undefined ||
                updates.target_date !== undefined ||
                updates.target_frequency !== undefined;

            if (setClauses.length > 0) {
                setClauses.push('updated_at = datetime("now")');
                values.push(canonicalCategoryId);
                const query = `UPDATE categories SET ${setClauses.join(', ')} WHERE CAST(id AS TEXT) = CAST(? AS TEXT)`;
                const result = await db.run(query, values);
                if (result.changes === 0 && !didMonthMutation) {
                    console.warn('updateCategory: UPDATE matched 0 rows', { categoryId: canonicalCategoryId, ownerId });
                    if (hadGoalPatch) {
                        return { success: false, error: 'Failed to save category goal target. Category may have been removed.' };
                    }
                }
            } else if (!didMonthMutation && Object.keys(patch).length === 0) {
                return { success: false, error: 'No updates provided' };
            } else if (!didMonthMutation) {
                return { success: false, error: 'No valid fields to update' };
            }

            const updatedCategory = await findCategoryRowById(db, canonicalCategoryId);
            if (!updatedCategory) {
                return { success: false, error: 'Category not found' };
            }
            const envelopeResultForResponse = envelopeResult;
            let responseData = envelopeResultForResponse
                ? {
                    ...updatedCategory,
                    assigned: envelopeResultForResponse.assigned,
                    available: envelopeResultForResponse.available,
                    activity: envelopeResultForResponse.activity,
                    previous_available: envelopeResultForResponse.previous_available,
                }
                : updatedCategory;
            const responseMonthKey =
                budgetMonth !== undefined && budgetMonth !== null && String(budgetMonth).trim() !== ''
                    ? monthlyBudgetService.toLocalMonthKey(budgetMonth)
                    : monthlyBudgetService.toLocalMonthKey(new Date());
            const [enrichedRow] = await monthlyBudgetService.enrichCategoriesWithUnderfunded(
                db,
                ownerId,
                [responseData],
                responseMonthKey
            );
            if (enrichedRow) responseData = enrichedRow;
            const moneyRelated =
                didMonthMutation ||
                updates.assigned !== undefined ||
                updates.available !== undefined ||
                updates.activity !== undefined;
            if (moneyRelated) {
                notifyBudgetStateChanged('budget:assigned', { categoryId: canonicalCategoryId, userId: ownerId });
                notifyBudgetStateChanged('prosperity:updated', { userId: ownerId, reason: 'category:assigned' });
            } else if (hadGoalPatch) {
                notifyBudgetStateChanged('category:updated', { categoryId: canonicalCategoryId, userId: ownerId });
                notifyBudgetStateChanged('prosperity:updated', { userId: ownerId, reason: 'category:goal' });
            } else {
                notifyBudgetStateChanged('category:updated', { categoryId: canonicalCategoryId, userId: ownerId });
            }
            return { success: true, data: responseData };

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

    ipcMain.handle('cash-forecast:share:create', async (event, payload) => {
        try {
            const user = await getUserFromSession(event);
            if (!user) return { success: false, error: 'Not authenticated' };
            const service = new CashForecastService(getDatabase);
            await service.deleteExpiredShares();
            const id = await service.createShare(user.id, payload);
            return { success: true, data: { id } };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cash-forecast:share:get', async (event, shareId) => {
        try {
            const service = new CashForecastService(getDatabase);
            const data = await service.getShare(shareId);
            if (!data) return { success: false, error: 'Share not found or expired' };
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cash-forecast:recurring-prefs:get', async (event) => {
        try {
            const user = await getUserFromSession(event);
            if (!user) return { success: false, error: 'Not authenticated' };
            const service = new CashForecastService(getDatabase);
            const data = await service.getRecurringPrefs(user.id);
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cash-forecast:recurring-prefs:set', async (event, recurringId, status, override) => {
        try {
            const user = await getUserFromSession(event);
            if (!user) return { success: false, error: 'Not authenticated' };
            const service = new CashForecastService(getDatabase);
            const data = await service.setRecurringPref(user.id, recurringId, status, override);
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cash-forecast:scheduled:list', async (event) => {
        try {
            const user = await getUserFromSession(event);
            if (!user) return { success: false, error: 'Not authenticated' };
            const service = new CashForecastService(getDatabase);
            const today = new Date().toISOString().slice(0, 10);
            const data = await service.getScheduledTransactionsForUser(user.id, { fromDate: today });
            return { success: true, data };
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
            const ownerId = await resolveBudgetOwnerId(db, userId);
            if (ownerId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session', data: [] };
            if (!ownerId) return { success: true, data: [] };
            const groups = await db.all('SELECT * FROM category_groups WHERE user_id = ? ORDER BY sort_order ASC', [ownerId]);
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
            const db = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(db, userId);
            if (targetUserId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session', data: [] };
            if (!targetUserId) return { success: true, data: [] };

            const groups = await db.all(
                `SELECT * FROM category_groups WHERE user_id = ? ORDER BY sort_order ASC, name ASC`,
                [targetUserId]
            );

            const groupsWithCategories = await Promise.all((groups || []).map(async (group) => {
                const categories = await db.all(
                    `SELECT * FROM categories 
                     WHERE user_id = ? 
                       AND (archived IS NULL OR archived = 0) 
                       AND CAST(COALESCE(group_id, '') AS TEXT) = CAST(? AS TEXT)
                     ORDER BY name ASC`,
                    [targetUserId, group.id]
                );
                return { ...group, categories: categories || [] };
            }));

            const uncategorized = await db.all(
                `SELECT * FROM categories 
                 WHERE user_id = ? 
                   AND (archived IS NULL OR archived = 0) 
                   AND (group_id IS NULL OR TRIM(CAST(group_id AS TEXT)) = '')
                 ORDER BY name ASC`,
                [targetUserId]
            );

            if (uncategorized.length > 0) {
                groupsWithCategories.unshift({
                    id: 'uncategorized',
                    name: 'Uncategorized',
                    is_hidden: 0,
                    categories: uncategorized
                });
            }

            return { success: true, data: groupsWithCategories };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('categoryGroups:create', async (event, userId, name, sortOrder) => {
        console.log('📞 IPC: categoryGroups:create called', { userId, name, sortOrder });
        try {
            const db = await getDatabase();
            const ownerId = resolveBudgetOwnerId(null, userId);
            if (ownerId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session' };
            if (!ownerId) return { success: false, error: 'No user logged in' };
            const user = await db.get('SELECT id FROM users WHERE id = ?', [ownerId]);
            if (!user) {
                await db.run(`INSERT OR IGNORE INTO users (id, username, email, full_name) VALUES (?, ?, ?, ?)`, [ownerId, `user_${ownerId}`, `user${ownerId}@example.com`, `User ${ownerId}`]);
            }
            const result = await db.run(`INSERT INTO category_groups (user_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`, [ownerId, name, sortOrder || 0]);
            const id = result.lastID;
            const newGroup = await db.get('SELECT * FROM category_groups WHERE id = ?', [id]);
            notifyBudgetStateChanged('categoryGroups:changed', { userId: ownerId, action: 'create', groupId: id });
            return { success: true, data: newGroup };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('categoryGroups:update', async (event, id, userId, updates) => {
        console.log('📞 IPC: categoryGroups:update called', { id, userId, updates });
        try {
            const db = await getDatabase();
            const ownerId = resolveBudgetOwnerId(null, userId);
            if (ownerId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session' };
            if (!ownerId) return { success: false, error: 'No user logged in' };
            const existing = await db.get('SELECT * FROM category_groups WHERE id = ? AND user_id = ?', [id, ownerId]);
            if (!existing) return { success: false, error: 'Category group not found' };
            if (existing.system_managed === 1 || String(existing.name || '').toLowerCase() === CREDIT_CARD_PAYMENTS_GROUP_NAME.toLowerCase()) {
                return { success: false, error: `"${existing.name}" is system-managed and cannot be renamed.` };
            }
            const result = await db.run('UPDATE category_groups SET name = ?, updated_at = datetime("now") WHERE id = ? AND user_id = ?', [updates.name, id, ownerId]);
            if (result.changes === 0) return { success: false, error: 'Failed to update group' };
            const updatedGroup = await db.get('SELECT * FROM category_groups WHERE id = ? AND user_id = ?', [id, ownerId]);
            notifyBudgetStateChanged('categoryGroups:changed', { userId: ownerId, action: 'update', groupId: id });
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
            const ownerId = resolveBudgetOwnerId(null, userId);
            if (ownerId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session' };
            if (!ownerId) return { success: false, error: 'No user logged in' };
            const group = await db.get('SELECT * FROM category_groups WHERE id = ? AND user_id = ?', [groupId, ownerId]);
            if (!group) return { success: false, error: `Category group with ID ${groupId} not found` };
            if (group.system_managed === 1 || String(group.name || '').toLowerCase() === CREDIT_CARD_PAYMENTS_GROUP_NAME.toLowerCase()) {
                return { success: false, error: `"${group.name}" is system-managed and cannot be deleted.` };
            }
            const categoriesInGroup = await db.get('SELECT COUNT(*) as count FROM categories WHERE group_id = ? AND archived = 0', [String(groupId)]);
            if (categoriesInGroup.count > 0) {
                return { success: false, error: `Cannot delete "${group.name}" because it contains ${categoriesInGroup.count} categories. Please delete or move all categories from this group first.` };
            }
            const result = await db.run('DELETE FROM category_groups WHERE id = ? AND user_id = ?', [groupId, ownerId]);
            if (result.changes === 0) return { success: false, error: `Failed to delete category group ${groupId}` };
            notifyBudgetStateChanged('categoryGroups:changed', { userId: ownerId, action: 'delete', groupId });
            return { success: true, data: { id: groupId, name: group.name } };
        } catch (error) {
            console.error('❌ Error in categoryGroups:delete:', error);
            return { success: false, error: error.message };
        }
    });

    // ==================== ACCOUNT SERVICE IPC HANDLERS ====================
    ipcMain.handle('accounts:getAll', async (event, userId) => {
        try {
            const effectiveUserId = resolveBudgetOwnerId(null, userId);
            if (effectiveUserId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session', data: [] };
            if (!effectiveUserId) return { success: true, data: [] };
            const result = await accountService.getAllAccounts(effectiveUserId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('accounts:getById', async (event, id, userId) => {
        try {
            const effectiveUserId = resolveBudgetOwnerId(null, userId);
            if (effectiveUserId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session' };
            if (!effectiveUserId) return { success: false, error: 'No user logged in' };
            const db = await getDatabase();
            const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [id, effectiveUserId]);
            return { success: true, data: account || null };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('create-account', async (event, accountData) => {
        console.log('🔵🔵🔵 BACKEND RECEIVED:', JSON.stringify(accountData, null, 2));
        try {
            const db = await getDatabase();
            const id = uuidv4();
            const currentUser = userService.getCurrentUser();
            const userId = currentUser?.id;
            if (!userId) return { success: false, error: 'No user logged in' };

            const row = buildAccountInsertFromPayload(accountData, id, userId);
            const columns = Object.keys(row);
            const values = Object.values(row);
            const placeholders = values.map(() => '?').join(', ');
            await db.run(`INSERT INTO accounts (${columns.join(', ')}) VALUES (${placeholders})`, values);

            if (row.type === 'credit') {
                const createdAccount = await db.get('SELECT * FROM accounts WHERE id = ?', [id]);
                if (isEligibleBudgetCreditCardAccount(createdAccount)) {
                    await ensureCreditCardPaymentCategoryForAccount(db, createdAccount, {
                        reason: 'create_account',
                    });
                }
            }
            const newAccount = await finalizeManualAccountWithStartingBalance(db, id, userId);
            return { success: true, data: newAccount };
        } catch (error) {
            console.error('❌ Error creating account:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:create', async (event, accountData) => {
        try {
            const db = await getDatabase();
            const currentUser = userService.getCurrentUser();
            const userId = currentUser?.id;
            if (!userId) return { success: false, error: 'No user logged in' };

            if (!accountData.forceCreate && plaidAccountMatch.checkManualAccountDuplicate) {
                const mask =
                    accountData.external_mask ||
                    (accountData.account_number
                        ? String(accountData.account_number).replace(/\D/g, '').slice(-4)
                        : null);
                const duplicates = await plaidAccountMatch.checkManualAccountDuplicate(
                    db,
                    userId,
                    {
                        type: accountData.type,
                        mask: mask || null,
                        name: accountData.name,
                        institution: accountData.institution,
                    }
                );
                if (duplicates.length) {
                    return {
                        success: false,
                        error: 'DUPLICATE_ACCOUNT',
                        duplicates,
                    };
                }
            }

            const accountId = uuidv4();
            const row = buildAccountInsertFromPayload(accountData, accountId, userId);
            const columns = Object.keys(row);
            const values = Object.values(row);
            const placeholders = values.map(() => '?').join(', ');
            await db.run(`INSERT INTO accounts (${columns.join(', ')}) VALUES (${placeholders})`, values);

            if (row.type === 'credit') {
                const createdAccount = await db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
                if (isEligibleBudgetCreditCardAccount(createdAccount)) {
                    await ensureCreditCardPaymentCategoryForAccount(db, createdAccount, {
                        reason: 'accounts_create',
                    });
                }
            }
            const newAccount = await finalizeManualAccountWithStartingBalance(db, accountId, userId);
            notifyAccountsUpdated('manual');
            return { success: true, data: newAccount };
        } catch (error) {
            console.error('❌ Error in accounts:create:', error);
            return { success: false, error: error.message };
        }
    });


    ipcMain.handle('accounts:update', async (event, id, userId, updates) => {
        try {
            if (!id) return { success: false, error: 'Account ID is required' };
            const ownerId = resolveBudgetOwnerId(null, userId);
            if (ownerId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session' };
            if (!ownerId) return { success: false, error: 'No user logged in' };
            const result = await accountService.updateAccount(id, ownerId, updates);
            const db = await getDatabase();
            const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [id, ownerId]);
            if (account) {
                const deactivating =
                    updates.is_active === 0 ||
                    updates.is_active === false ||
                    (updates.account_status &&
                        String(updates.account_status).toLowerCase() !== 'active');
                if (deactivating || !isEligibleBudgetCreditCardAccount(account)) {
                    await archiveCreditCardPaymentCategoryForAccount(db, account, {
                        reason: 'accounts_update_inactive',
                    });
                } else if (String(account.type || '').toLowerCase() === 'credit') {
                    await ensureCreditCardPaymentCategoryForAccount(db, account, {
                        reason: 'accounts_update',
                    });
                }
            }
            notifyAccountsUpdated('manual');
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:ensureCreditCardPaymentCategories', async (event, userId) => {
        try {
            const ownerId = resolveBudgetOwnerId(null, userId);
            if (ownerId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session' };
            if (!ownerId) return { success: false, error: 'No user logged in' };
            const data = await runCreditCardPaymentCategorySync(ownerId, 'ipc_manual');
            if (!data) {
                return { success: false, error: 'Credit card payment category service not loaded' };
            }
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:delete', async (event, id, userId, opts = {}) => {
        try {
            if (!id) return { success: false, error: 'ID and userId required' };
            const ownerId = resolveBudgetOwnerId(null, userId);
            if (ownerId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session' };
            if (!ownerId) return { success: false, error: 'No user logged in' };
            const db = await getDatabase();
            const account = await db.get(
                'SELECT * FROM accounts WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
                [id, ownerId]
            );
            if (!account) {
                return { success: false, error: 'Account not found or already deleted' };
            }

            if (String(account.type || '').toLowerCase() === 'credit') {
                if (!accountDeleteService.permanentlyDeleteCreditAccount) {
                    return { success: false, error: 'Account delete service not loaded' };
                }
                const result = await accountDeleteService.permanentlyDeleteCreditAccount(
                    db,
                    id,
                    ownerId
                );
                if (result.success) {
                    notifyAccountsUpdated('credit-permanent-delete');
                    notifyBudgetStateChanged('category:deleted', { source: 'credit-account-delete' });
                }
                return result;
            }

            if (String(account.type || '').toLowerCase() === 'loan') {
                if (!accountDeleteService.permanentlyDeleteLoanAccount) {
                    return { success: false, error: 'Account delete service not loaded' };
                }
                const result = await accountDeleteService.permanentlyDeleteLoanAccount(
                    db,
                    id,
                    ownerId
                );
                if (result.success) {
                    notifyAccountsUpdated('loan-permanent-delete');
                    notifyBudgetStateChanged('category:deleted', { source: 'loan-account-delete' });
                }
                return result;
            }

            if (String(account.type || '').toLowerCase() === 'credit') {
                await archiveCreditCardPaymentCategoryForAccount(db, account, {
                    reason: 'accounts_soft_delete',
                });
            }

            const deleted = await accountService.deleteAccount(id, ownerId, opts);
            if (deleted) {
                notifyAccountsUpdated('manual');
                return { success: true };
            }
            return { success: false, error: 'Account not found or already deleted' };
        } catch (error) {
            return { success: false, error: error.message, code: error.code };
        }
    });

    ipcMain.handle('accounts:applyManualAdjustment', async (event, payload) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            if (!accountAdjustmentService?.applyManualBalanceAdjustment) {
                return { success: false, error: 'Manual adjustment service unavailable' };
            }
            const { accountId, delta, memo } = payload || {};
            const db = await getDatabase();
            const dbPath = getDatabasePath();
            const data = await accountAdjustmentService.applyManualBalanceAdjustment(db, dbPath, {
                accountId,
                userId: currentUser.id,
                delta,
                memo,
            });
            notifyBudgetStateChanged('prosperity:updated', {
                userId: currentUser.id,
                reason: 'account:manual-adjustment',
            });
            notifyAccountsUpdated('manual-adjustment');
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:permanentDeleteCredit', async (event, id, userId) => {
        try {
            if (!id) return { success: false, error: 'Account id required' };
            const ownerId = resolveBudgetOwnerId(null, userId);
            if (ownerId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!ownerId) return { success: false, error: 'No user logged in' };
            if (!accountDeleteService.permanentlyDeleteCreditAccount) {
                return { success: false, error: 'Account delete service not loaded' };
            }
            const db = await getDatabase();
            const result = await accountDeleteService.permanentlyDeleteCreditAccount(
                db,
                id,
                ownerId
            );
            if (result.success) {
                notifyAccountsUpdated('credit-permanent-delete');
                notifyBudgetStateChanged('category:deleted', { source: 'credit-account-delete' });
            }
            return result;
        } catch (error) {
            return { success: false, error: error.message, code: error.code };
        }
    });

    ipcMain.handle('accounts:permanentDeleteLoan', async (event, id, userId) => {
        try {
            if (!id) return { success: false, error: 'Account id required' };
            const ownerId = resolveBudgetOwnerId(null, userId);
            if (ownerId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!ownerId) return { success: false, error: 'No user logged in' };
            if (!accountDeleteService.permanentlyDeleteLoanAccount) {
                return { success: false, error: 'Account delete service not loaded' };
            }
            const db = await getDatabase();
            const result = await accountDeleteService.permanentlyDeleteLoanAccount(
                db,
                id,
                ownerId
            );
            if (result.success) {
                notifyAccountsUpdated('loan-permanent-delete');
                notifyBudgetStateChanged('category:deleted', { source: 'loan-account-delete' });
            }
            return result;
        } catch (error) {
            return { success: false, error: error.message, code: error.code };
        }
    });

    ipcMain.handle('accounts:getBalances', async (event, accountId, userId) => {
        try {
            const effectiveUserId = resolveBudgetOwnerId(null, userId);
            if (effectiveUserId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session' };
            if (!effectiveUserId) return { success: false, error: 'No user logged in' };
            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const result = await service.getAccountBalanceDetails(accountId, effectiveUserId);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('accounts:getSummary', async (event, userId) => {
        try {
            const effectiveUserId = resolveBudgetOwnerId(null, userId);
            if (effectiveUserId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session', data: [] };
            if (!effectiveUserId) {
                return { success: true, data: [] };
            }
            let result;
            let summaryFailed = false;
            try {
                result = await accountService.getAccountsSummary(effectiveUserId);
            } catch (serviceError) {
                console.error('accounts:getSummary service error:', serviceError);
                summaryFailed = true;
                result = [];
            }
            // Only use DB fallback when the service threw — not when the user truly has zero accounts
            if (summaryFailed) {
                const db = await getDatabase();
                const directAccounts = await db.all(
                    'SELECT * FROM accounts WHERE user_id = ? AND IFNULL(is_active, 1) = 1',
                    [effectiveUserId]
                );
                result = directAccounts.map(account => ({ id: account.id, name: account.name, type: account.type, balance: account.balance || 0, institution: account.institution || '', account_type_category: account.account_type_category || 'budget', cleared_balance: account.cleared_balance || account.balance || 0, working_balance: account.working_balance || account.balance || 0, currency: account.currency || 'USD', is_active: account.is_active !== 0, source: account.source || 'manual' }));
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
    ipcMain.handle('plaid-get-config-status', async () => {
        const cfg = getPlaidConfig ? getPlaidConfig() : { configured: false, env: process.env.PLAID_ENV || 'sandbox' };
        return {
            success: true,
            data: {
                ...cfg,
                linkProducts: getLinkTokenProducts ? getLinkTokenProducts() : ['transactions'],
                redirectUriConfigured: Boolean(process.env.PLAID_REDIRECT_URI),
                redirectUri: process.env.PLAID_REDIRECT_URI || null,
                webhookRelayConfigured: Boolean(process.env.PLAID_WEBHOOK_RELAY_URL),
                oauthDeepLinkScheme: `${PLAID_OAUTH_SCHEME}://`,
            },
        };
    });

    ipcMain.handle('plaid-create-link-token', async () => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            const plaidClient = createPlaidClient();
            const payload = buildLinkTokenCreatePayload
                ? buildLinkTokenCreatePayload(currentUser.id)
                : {
                      user: { client_user_id: currentUser.id.toString() },
                      client_name: 'IntentFlow',
                      products: ['transactions'],
                      country_codes: ['US'],
                      language: 'en',
                  };
            const response = await plaidClient.linkTokenCreate(payload);
            return { success: true, link_token: response.data.link_token };
        } catch (error) {
            const message = logPlaidError('create link token', error);
            return { success: false, error: message };
        }
    });

    ipcMain.handle('plaid-create-update-link-token', async (event, itemId) => {
        try {
            const item = await verifyPlaidItemOwnership(itemId);
            const accessToken = decryptToken(item.access_token);
            if (!accessToken) throw new Error('Failed to decrypt token');
            const currentUser = userService.getCurrentUser();
            const plaidClient = createPlaidClient();
            const payload = buildLinkTokenCreatePayload
                ? buildLinkTokenCreatePayload(currentUser.id, { accessToken })
                : {
                      user: { client_user_id: currentUser.id.toString() },
                      client_name: 'IntentFlow',
                      products: ['transactions'],
                      country_codes: ['US'],
                      language: 'en',
                      access_token: accessToken,
                  };
            const response = await plaidClient.linkTokenCreate(payload);
            return { success: true, link_token: response.data.link_token };
        } catch (error) {
            const message = logPlaidError('create update link token', error);
            return { success: false, error: message };
        }
    });

    ipcMain.handle('plaid-exchange-public-token', async (event, publicToken) => {
        try {
            const plaidClient = createPlaidClient();
            const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
            const accessToken = response.data.access_token;
            const itemId = response.data.item_id;
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            const encryptedToken = encryptToken(accessToken);
            const db = await getDatabase();
            const existingItem = await db.get('SELECT * FROM plaid_items WHERE id = ?', [itemId]);
            if (existingItem) {
                await db.run(
                    `UPDATE plaid_items SET access_token = ?, user_id = ?, status = 'active', last_error = NULL, updated_at = datetime('now') WHERE id = ?`,
                    [encryptedToken, currentUser.id, itemId]
                );
            } else {
                await db.run(
                    `INSERT INTO plaid_items (id, user_id, access_token, status, created_at, updated_at) VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))`,
                    [itemId, currentUser.id, encryptedToken]
                );
            }
            const instResponse = await plaidClient.itemGet({ access_token: accessToken });
            const institutionId = instResponse.data.item.institution_id;
            if (institutionId) {
                const instData = await plaidClient.institutionsGetById({
                    institution_id: institutionId,
                    country_codes: ['US'],
                });
                await db.run(
                    `UPDATE plaid_items SET institution_id = ?, institution_name = ? WHERE id = ?`,
                    [institutionId, instData.data.institution.name, itemId]
                );
            }
            const accountSync = await syncPlaidAccounts(itemId);
            if (!accountSync?.success) {
                const message =
                    accountSync?.error === 'ITEM_LOGIN_REQUIRED'
                        ? 'Bank connected, but login is required before accounts can sync. Use Reconnect on Linked Banks.'
                        : accountSync?.error || 'Connected to Plaid, but account sync failed.';
                return { success: false, error: message, item_id: itemId, mergeOffers: [] };
            }
            const txResult = await syncTransactionsForItem(itemId);
            if (plaidRelayClient.registerPlaidItemWithRelay) {
                await plaidRelayClient.registerPlaidItemWithRelay(itemId, currentUser.id);
            }
            notifyAccountsUpdated('plaid-connect');
            return {
                success: true,
                item_id: itemId,
                sync: txResult,
                mergeOffers: accountSync?.mergeOffers || [],
            };
        } catch (error) {
            const message = logPlaidError('exchange public token', error);
            return { success: false, error: message };
        }
    });

    ipcMain.handle('plaid-get-linked-items', async () => {
        try {
            const items = await getLinkedItemsSafe();
            return { success: true, data: items };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-get-item-accounts', async (event, itemId) => {
        try {
            await verifyPlaidItemOwnership(itemId);
            const db = await getDatabase();
            const rows = await db.all(
                `SELECT pa.plaid_account_id, pa.mask, pa.name, pa.type, pa.subtype,
                        a.id AS account_id, a.name AS account_name, a.type AS account_type, a.balance, a.source
                 FROM plaid_accounts pa
                 LEFT JOIN accounts a ON pa.account_id = a.id
                 WHERE pa.item_id = ?
                 ORDER BY pa.name`,
                [itemId]
            );
            return { success: true, data: rows };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-sync-item', async (event, itemId) => {
        try {
            await verifyPlaidItemOwnership(itemId);
            const accountResult = await syncPlaidAccounts(itemId);
            if (!accountResult.success) {
                if (plaidSync.logSyncError) {
                    const db = await getDatabase();
                    await plaidSync.logSyncError(db, itemId, 'accounts', accountResult.error);
                }
                return accountResult;
            }
            const db = await getDatabase();
            await db.run(
                `UPDATE plaid_items SET last_sync = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
                [itemId]
            );
            notifyAccountsUpdated('plaid-sync-accounts');
            return {
                success: true,
                mergeOffers: accountResult?.mergeOffers || [],
            };
        } catch (error) {
            if (plaidSync.logSyncError) {
                const db = await getDatabase();
                await plaidSync.logSyncError(db, itemId, 'accounts', error.message);
            }
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-link-account-to-plaid', async (event, plaidAccountId, targetAccountId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            if (!plaidAccountMatch.mergePlaidAccountToManual) {
                throw new Error('Plaid merge module not loaded');
            }
            const result = await plaidAccountMatch.executePlaidToManualMerge(
                await getDatabase(),
                currentUser.id,
                plaidAccountId,
                targetAccountId,
                {
                    ...getPlaidSyncDeps(),
                    createPlaidClient,
                }
            );
            notifyAccountsUpdated('plaid-link-account');
            if (result?.success && currentUser?.id) {
                await runCreditCardPaymentCategorySync(currentUser.id, 'plaid_merge');
            }
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-merge-account', async (event, plaidAccountId, targetAccountId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            if (!plaidAccountMatch.executePlaidToManualMerge) {
                throw new Error('Plaid merge module not loaded');
            }
            const result = await plaidAccountMatch.executePlaidToManualMerge(
                await getDatabase(),
                currentUser.id,
                plaidAccountId,
                targetAccountId,
                {
                    ...getPlaidSyncDeps(),
                    createPlaidClient,
                }
            );
            notifyAccountsUpdated('plaid-merge');
            if (result?.success && currentUser?.id) {
                await runCreditCardPaymentCategorySync(currentUser.id, 'plaid_merge');
            }
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-get-merge-preview', async (event, plaidAccountId, targetAccountId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            const data = await plaidAccountMatch.getMergePreview(
                await getDatabase(),
                currentUser.id,
                plaidAccountId,
                targetAccountId
            );
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-execute-merge', async (event, plaidAccountId, targetAccountId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            const result = await plaidAccountMatch.executePlaidToManualMerge(
                await getDatabase(),
                currentUser.id,
                plaidAccountId,
                targetAccountId,
                {
                    ...getPlaidSyncDeps(),
                    createPlaidClient,
                }
            );
            notifyAccountsUpdated('plaid-merge');
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-keep-account-separate', async (event, plaidAccountId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            const result = await plaidAccountMatch.keepPlaidAccountSeparate(
                await getDatabase(),
                currentUser.id,
                plaidAccountId
            );
            notifyAccountsUpdated('plaid-keep-separate');
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-rollback-merge', async (event, sessionId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            const result = await plaidAccountMatch.rollbackMergeSession(
                await getDatabase(),
                currentUser.id,
                sessionId
            );
            notifyAccountsUpdated('plaid-merge-rollback');
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-check-duplicate-account', async (event, payload) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: true, duplicates: [] };
            if (!plaidAccountMatch.checkManualAccountDuplicate) {
                return { success: true, duplicates: [] };
            }
            const db = await getDatabase();
            const duplicates = await plaidAccountMatch.checkManualAccountDuplicate(
                db,
                currentUser.id,
                payload || {}
            );
            return { success: true, duplicates };
        } catch (error) {
            return { success: false, error: error.message, duplicates: [] };
        }
    });

    ipcMain.handle('plaid-sync-transactions', async (event, itemId) => {
        try {
            await verifyPlaidItemOwnership(itemId);
            const result = await syncTransactionsForItem(itemId);
            if (!result.success && plaidSync.logSyncError) {
                const db = await getDatabase();
                await plaidSync.logSyncError(db, itemId, 'transactions', result.error);
            }
            if (result.success) notifyAccountsUpdated('plaid-sync-transactions');
            return result;
        } catch (error) {
            if (plaidSync.logSyncError) {
                const db = await getDatabase();
                await plaidSync.logSyncError(db, itemId, 'transactions', error.message);
            }
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-get-account-link-status', async (event, accountId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'Not logged in' };
            const db = await getDatabase();
            const row = await db.get(
                `SELECT a.source, a.last_balance_sync_at, pi.id AS item_id, pi.status AS item_status,
                        pi.institution_name, pi.last_sync AS item_last_sync, pi.last_error,
                        pa.plaid_account_id, pa.mask
                 FROM accounts a
                 LEFT JOIN plaid_accounts pa ON pa.account_id = a.id
                 LEFT JOIN plaid_items pi ON pa.item_id = pi.id
                 WHERE a.id = ? AND a.user_id = ?`,
                [accountId, currentUser.id]
            );
            return { success: true, data: row || null };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-sync-account', async (event, accountId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            const db = await getDatabase();
            const link = await db.get(
                `SELECT pa.item_id FROM plaid_accounts pa
                 JOIN plaid_items pi ON pa.item_id = pi.id
                 WHERE pa.account_id = ? AND pi.user_id = ?`,
                [accountId, currentUser.id]
            );
            if (!link?.item_id) throw new Error('Account is not linked to Plaid');
            await verifyPlaidItemOwnership(link.item_id);
            const accountResult = await syncPlaidAccounts(link.item_id);
            if (!accountResult.success) {
                if (plaidSync.logSyncError) {
                    await plaidSync.logSyncError(db, link.item_id, 'accounts', accountResult.error);
                }
                return accountResult;
            }
            const txResult = await syncTransactionsForItem(link.item_id);
            if (!txResult.success && plaidSync.logSyncError) {
                await plaidSync.logSyncError(db, link.item_id, 'transactions', txResult.error);
            }
            await db.run(
                `UPDATE plaid_items SET last_sync = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
                [link.item_id]
            );
            notifyAccountsUpdated('plaid-sync-account');
            return { success: true, transactions: txResult };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-unlink-account', async (event, accountId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            if (!plaidSync.unlinkPlaidAccount) throw new Error('Plaid sync module not loaded');
            const result = await plaidSync.unlinkPlaidAccount(
                accountId,
                currentUser.id,
                getPlaidSyncDeps()
            );
            notifyAccountsUpdated('plaid-unlink-account');
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-remove-item', async (event, itemId, options = {}) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            if (!plaidSync.removePlaidItem) throw new Error('Plaid sync module not loaded');
            const result = await plaidSync.removePlaidItem(
                itemId,
                currentUser.id,
                getPlaidSyncDeps(),
                options
            );
            if (plaidRelayClient.unregisterPlaidItemFromRelay) {
                await plaidRelayClient.unregisterPlaidItemFromRelay(itemId);
            }
            notifyAccountsUpdated('plaid-remove');
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-get-sync-history', async (event, limit = 15) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: true, data: [] };
            const db = await getDatabase();
            const table = await db.get(
                `SELECT name FROM sqlite_master WHERE type='table' AND name='plaid_sync_runs'`
            );
            if (!table) return { success: true, data: [] };
            const rows = await db.all(
                `SELECT r.*, i.institution_name
                 FROM plaid_sync_runs r
                 LEFT JOIN plaid_items i ON r.item_id = i.id
                 WHERE r.user_id = ?
                 ORDER BY r.started_at DESC
                 LIMIT ?`,
                [currentUser.id, limit]
            );
            return { success: true, data: rows };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('plaid-get-category-mappings', async () => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: true, data: [] };
            const db = await getDatabase();
            const rows = await db.all(
                `SELECT plaid_category, category_id FROM plaid_category_mappings WHERE user_id = ? ORDER BY plaid_category`,
                [currentUser.id]
            );
            return { success: true, data: rows };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-save-category-mapping', async (event, plaidCategory, categoryId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            const db = await getDatabase();
            await db.run(
                `INSERT INTO plaid_category_mappings (user_id, plaid_category, category_id, updated_at)
                 VALUES (?, ?, ?, datetime('now'))
                 ON CONFLICT(user_id, plaid_category) DO UPDATE SET category_id = ?, updated_at = datetime('now')`,
                [currentUser.id, plaidCategory, categoryId, categoryId]
            );
            let transactionsUpdated = 0;
            if (plaidSync.reapplyPlaidCategoryMapping) {
                const r = await plaidSync.reapplyPlaidCategoryMapping(
                    db,
                    currentUser.id,
                    plaidCategory,
                    categoryId
                );
                transactionsUpdated = r.updated || 0;
            }
            return { success: true, transactionsUpdated };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('plaid-reapply-all-category-mappings', async () => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            const db = await getDatabase();
            if (!plaidSync.reapplyAllPlaidCategoryMappings) {
                return { success: false, error: 'Plaid sync module not loaded' };
            }
            const r = await plaidSync.reapplyAllPlaidCategoryMappings(db, currentUser.id);
            return { success: true, transactionsUpdated: r.updated || 0 };
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

    ipcMain.handle('get-auto-sync-setting', async () => {
        const currentUser = userService.getCurrentUser();
        if (!currentUser) return { success: true, enabled: true };
        const db = await getDatabase();
        const row = await db.get(
            `SELECT value FROM user_settings WHERE user_id = ? AND key = ?`,
            [currentUser.id, 'autoSyncEnabled']
        );
        const enabled = row ? row.value !== 'false' : true;
        return { success: true, enabled };
    });

    ipcMain.handle('set-auto-sync-setting', async (event, enabled) => {
        const currentUser = userService.getCurrentUser();
        if (!currentUser) return { success: false, error: 'Not logged in' };
        const db = await getDatabase();
        await db.run(
            `INSERT OR REPLACE INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))`,
            [currentUser.id, 'autoSyncEnabled', enabled ? 'true' : 'false']
        );
        return { success: true, enabled: !!enabled };
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

    ipcMain.handle('getTransactions', async (event, filters = {}) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in', data: [] };
            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const transactions = await service.getAllTransactions(currentUser.id, filters || {});
            return { success: true, data: transactions };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('createTransaction', async (event, transaction) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            const db = await getDatabase();
            const amount = parseFloat(transaction.amount);
            if (isNaN(amount)) return { success: false, error: 'Invalid amount' };

            let categoryId = transaction.categoryId;
            if (categoryId === 'inflow_ready_to_assign' || categoryId === '') {
                categoryId = null;
            }

            const txDate = transaction.date || new Date().toISOString().split('T')[0];
            const transactionData = {
                accountId: transaction.accountId,
                userId: currentUser.id,
                date: txDate,
                description: transaction.description || transaction.payee || 'Transaction',
                amount,
                categoryId: null,
                payee: transaction.payee || null,
                memo: transaction.memo || null,
                isCleared: transaction.cleared ? 1 : 0,
                isTransfer: transaction.isTransfer || 0,
                transferGroupId: transaction.transferGroupId || null,
                linkedTransactionId: transaction.linkedTransactionId || null,
                counterpartyAccountId: transaction.counterpartyAccountId || null
            };

            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const result = await service.createTransaction(transactionData);

            let creditReserveDelta = 0;
            const insertedRow = await db.get(
                `SELECT id FROM transactions
                 WHERE account_id = ? AND user_id = ? AND date = ? AND amount = ?
                 ORDER BY created_at DESC LIMIT 1`,
                [transaction.accountId, currentUser.id, txDate, amount]
            );
            if (insertedRow?.id && transactionCategorizationService?.processImportedTransaction) {
                const processed = await transactionCategorizationService.processImportedTransaction(
                    db,
                    currentUser.id,
                    insertedRow.id,
                    {
                        merchantName: transaction.payee || transaction.description,
                        description: transactionData.description,
                        importSource: 'manual',
                        plaidCategoryId: categoryId,
                        isTransfer: Boolean(transaction.isTransfer),
                    }
                );
                creditReserveDelta = processed.creditReserveDelta || 0;
            } else if (transaction.payee && !transaction.isTransfer) {
                try {
                    await payeeService.createOrUpdatePayee(transaction.payee, currentUser.id);
                } catch (payeeError) {
                    console.warn('Failed to save payee:', payeeError);
                }
            }

            const poolTx = insertedRow?.id
                ? await db.get(
                    'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
                    [insertedRow.id, currentUser.id]
                )
                : null;
            if (transactionLifecycle?.runPostTransactionEffects) {
                try {
                    await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                        accountIds: [transaction.accountId],
                        dates: [txDate],
                        skipLedgerSync: true,
                        db,
                        poolTransaction: poolTx,
                    });
                } catch (e) {
                    console.warn('post-transaction budget refresh (createTransaction):', e?.message || e);
                }
            }
            if (creditReserveDelta !== 0) {
                await applyCreditCardPaymentReserveDelta(db, {
                    userId: currentUser.id,
                    accountId: transaction.accountId,
                    date: txDate,
                    delta: creditReserveDelta
                });
            }
            notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:added' });
            if (updateService) updateService.publish('transaction:added', result);
            return { success: true, data: result };
        } catch (error) {
            console.error('Error in createTransaction:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('getCategoryHistory', async (event, categoryId, period) => {
        try {
            const db = await getDatabase();
            const currentUser = userService.getCurrentUser();
            const ownerId = currentUser?.id;
            if (!ownerId) {
                return { success: true, data: { available: 0, assigned: 0, activity: 0 } };
            }
            const monthKey = monthlyBudgetService.toLocalMonthKey(period || new Date());
            const row = await db.get(
                `SELECT available_amount, budgeted_amount, activity_amount
                 FROM monthly_budgets
                 WHERE category_id = ? AND month = ?`,
                [categoryId, monthKey]
            );
            if (!row) {
                return { success: true, data: { available: 0, assigned: 0, activity: 0 } };
            }
            return {
                success: true,
                data: {
                    available: Number(row.available_amount) || 0,
                    assigned: Number(row.budgeted_amount) || 0,
                    activity: Number(row.activity_amount) || 0
                }
            };
        } catch (error) {
            return { success: false, error: error.message, data: { available: 0, assigned: 0, activity: 0 } };
        }
    });

    ipcMain.handle('transactions:pickImportFile', async () => {
        try {
            if (!transactionImportService?.readImportFile) {
                return { success: false, error: 'Transaction import service unavailable' };
            }
            const parentWindow = getDialogParentWindow();
            const openResult = await dialog.showOpenDialog(parentWindow, {
                title: 'Import transactions',
                filters: [
                    { name: 'CSV', extensions: ['csv', 'txt'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
                properties: ['openFile'],
            });
            if (openResult.canceled || !openResult.filePaths?.length) {
                return { success: false, canceled: true };
            }
            const filePath = openResult.filePaths[0];
            const read = transactionImportService.readImportFile(filePath);
            if (!read.ok) return { success: false, error: read.error };
            return {
                success: true,
                filePath,
                fileName: read.fileName,
                format: read.format,
            };
        } catch (error) {
            console.error('transactions:pickImportFile error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:previewImport', async (event, payload) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            if (!transactionImportService?.previewImport) {
                return { success: false, error: 'Transaction import service unavailable' };
            }
            const { accountId, content, filePath, columnMap, categoryMappings, fileName } = payload || {};
            if (!accountId) {
                return { success: false, error: 'Account is required' };
            }
            const resolved = resolveTransactionImportContent({ content, filePath, fileName });
            if (!resolved.ok) return { success: false, error: resolved.error };
            const db = await getDatabase();
            const account = await db.get(
                'SELECT id, type, name, institution FROM accounts WHERE id = ? AND user_id = ?',
                [accountId, currentUser.id]
            );
            if (!account) return { success: false, error: 'Account not found' };
            const categories = await db.all(
                'SELECT id, name FROM categories WHERE user_id = ? ORDER BY name',
                [currentUser.id]
            );
            const categoriesByName = transactionImportService.buildCategoryNameMap(categories);
            const preview = transactionImportService.previewImport(
                resolved.content,
                account,
                categories,
                columnMap || null,
                categoryMappings || null,
                resolved.fileName || fileName || ''
            );
            const institutionKey = importCategoryMapping?.resolveInstitutionKey
                ? importCategoryMapping.resolveInstitutionKey({
                      detectedProfile: preview.detectedProfile,
                      account,
                  })
                : '';
            const savedBundle = importCategoryMapping?.getMappingsForImport
                ? await importCategoryMapping.getMappingsForImport(db, currentUser.id, institutionKey)
                : { merged: {}, global: {}, institution: {}, institutionKey: '' };
            const suggestedCategoryMappings = transactionImportService.buildSuggestedCategoryMappings(
                preview.bankCategories,
                categoriesByName,
                savedBundle.merged
            );
            return {
                success: true,
                data: {
                    accountName: account.name,
                    accountInstitution: account.institution || null,
                    institutionKey,
                    institutionLabel: importCategoryMapping?.institutionDisplayName
                        ? importCategoryMapping.institutionDisplayName(institutionKey)
                        : institutionKey,
                    headers: preview.headers,
                    suggestedMapping: preview.suggestedMapping,
                    preview: preview.preview,
                    totalRows: preview.totalRows,
                    validCount: preview.validCount,
                    parseErrors: preview.parseErrors,
                    balancePreview: preview.balancePreview,
                    bankCategories: preview.bankCategories,
                    categories: preview.categories,
                    savedCategoryMappings: savedBundle.merged,
                    suggestedCategoryMappings,
                    detectedProfile: preview.detectedProfile,
                    previewTransactions: preview.previewTransactions,
                },
            };
        } catch (error) {
            console.error('transactions:previewImport error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:executeImport', async (event, payload) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            if (!transactionImportService?.previewImport || !transactionImportService?.importTransactionsForAccount) {
                return { success: false, error: 'Transaction import service unavailable' };
            }
            const {
                accountId,
                content,
                filePath,
                columnMap,
                categoryMappings,
                saveCategoryMappings,
                institutionKey,
                fileName,
            } = payload || {};
            if (!accountId) {
                return { success: false, error: 'Account is required' };
            }
            const resolved = resolveTransactionImportContent({ content, filePath, fileName });
            if (!resolved.ok) return { success: false, error: resolved.error };
            const db = await getDatabase();
            const account = await db.get(
                'SELECT id, type FROM accounts WHERE id = ? AND user_id = ?',
                [accountId, currentUser.id]
            );
            if (!account) return { success: false, error: 'Account not found' };
            const categories = await db.all(
                'SELECT id, name FROM categories WHERE user_id = ?',
                [currentUser.id]
            );
            const built = transactionImportService.previewImport(
                resolved.content,
                account,
                categories,
                columnMap || null,
                categoryMappings || null,
                resolved.fileName || fileName || ''
            );
            if (saveCategoryMappings && categoryMappings && importCategoryMapping?.saveImportCategoryMappings) {
                const accountRow = await db.get(
                    'SELECT institution FROM accounts WHERE id = ? AND user_id = ?',
                    [accountId, currentUser.id]
                );
                const saveKey =
                    institutionKey ||
                    (importCategoryMapping.resolveInstitutionKey
                        ? importCategoryMapping.resolveInstitutionKey({
                              detectedProfile: built.detectedProfile,
                              account: accountRow,
                          })
                        : '');
                await importCategoryMapping.saveImportCategoryMappings(
                    db,
                    currentUser.id,
                    categoryMappings,
                    saveKey
                );
            }
            const dbPath = getDatabasePath();
            const result = await transactionImportService.importTransactionsForAccount(
                db,
                dbPath,
                currentUser.id,
                accountId,
                built.normalized,
                { skipLedgerSync: true }
            );
            notifyBudgetStateChanged('prosperity:updated', {
                userId: currentUser.id,
                reason: 'transaction:imported',
            });
            if (updateService) updateService.publish('transaction:added', { accountId, imported: result.imported });
            return { success: true, data: result };
        } catch (error) {
            console.error('transactions:executeImport error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('import-get-category-mappings', async (event, payload) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: true, data: {} };
            const institutionKey =
                typeof payload === 'string' ? payload : payload?.institutionKey || '';
            const db = await getDatabase();
            const bundle = importCategoryMapping?.getMappingsForImport
                ? await importCategoryMapping.getMappingsForImport(
                      db,
                      currentUser.id,
                      institutionKey
                  )
                : { merged: {} };
            return { success: true, data: bundle.merged };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('import-list-category-mappings', async () => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: true, data: [] };
            const db = await getDatabase();
            const rows = importCategoryMapping?.listImportCategoryMappings
                ? await importCategoryMapping.listImportCategoryMappings(db, currentUser.id)
                : [];
            return { success: true, data: rows };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('import-delete-category-mapping', async (event, payload) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            const { institutionKey = '', bankCategory } = payload || {};
            if (!bankCategory) return { success: false, error: 'bankCategory required' };
            const db = await getDatabase();
            const result = importCategoryMapping?.deleteImportCategoryMapping
                ? await importCategoryMapping.deleteImportCategoryMapping(
                      db,
                      currentUser.id,
                      institutionKey,
                      bankCategory
                  )
                : { deleted: 0 };
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('import-save-category-mappings', async (event, payload) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) throw new Error('Not logged in');
            const mappings =
                payload && typeof payload === 'object' && !Array.isArray(payload) && payload.mappings
                    ? payload.mappings
                    : payload;
            const institutionKey =
                payload && typeof payload === 'object' && !Array.isArray(payload)
                    ? payload.institutionKey || ''
                    : '';
            const db = await getDatabase();
            const result = importCategoryMapping?.saveImportCategoryMappings
                ? await importCategoryMapping.saveImportCategoryMappings(
                      db,
                      currentUser.id,
                      mappings,
                      institutionKey
                  )
                : { saved: 0 };
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    function normalizeTransactionUpdatePayload(updates) {
        if (!updates || typeof updates !== 'object') return updates;
        const normalized = { ...updates };
        if (Object.prototype.hasOwnProperty.call(normalized, 'cleared')) {
            normalized.is_cleared = normalized.cleared;
            delete normalized.cleared;
        }
        if (Object.prototype.hasOwnProperty.call(normalized, 'categoryId')) {
            let cid = normalized.categoryId;
            delete normalized.categoryId;
            if (
                cid === 'inflow_ready_to_assign' ||
                cid === 'ready_to_assign' ||
                cid === ''
            ) {
                cid = null;
            }
            normalized.category_id = cid;
        }
        if (
            normalized.category_id === 'inflow_ready_to_assign' ||
            normalized.category_id === 'ready_to_assign' ||
            normalized.category_id === ''
        ) {
            normalized.category_id = null;
        }
        if (updates.destinationAccountId != null) {
            normalized.destinationAccountId = updates.destinationAccountId;
        }
        if (updates.transferAccountId != null) {
            normalized.destinationAccountId = updates.transferAccountId;
        }
        if (updates.convertToRegular === true) {
            normalized.convertToRegular = true;
        }
        delete normalized.picked;
        return normalized;
    }

    ipcMain.handle('addTransaction', async (event, transaction) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            const db = await getDatabase();

            const amount = parseFloat(transaction.amount);
            if (isNaN(amount)) return { success: false, error: 'Invalid amount' };

            // Check if this is a transfer
            if (transaction.isTransfer === 1 && transaction.transferAccountId) {
                const txDate = transaction.date || new Date().toISOString().split('T')[0];
                const transferResult = await payeeService.createLinkedTransfer({
                    sourceAccountId: transaction.accountId,
                    destinationAccountId: transaction.transferAccountId,
                    amount: Math.abs(amount),
                    date: txDate,
                    sourcePayeeName: transaction.payee || `Transfer`,
                    memo: transaction.memo || null,
                    cleared: transaction.cleared === 1 || transaction.cleared === true,
                    userId: currentUser.id
                });

                if (transferResult?.success && transactionLifecycle?.runPostTransactionEffects) {
                    try {
                        await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                            accountIds: [transaction.accountId, transaction.transferAccountId],
                            dates: [txDate],
                            skipLedgerSync: true,
                            db,
                            poolTransferPair: {
                                sourceAccountId: transaction.accountId,
                                destinationAccountId: transaction.transferAccountId,
                                amount: Math.abs(amount),
                            },
                        });
                    } catch (e) {
                        console.warn('post-transaction budget refresh (transfer):', e?.message || e);
                    }
                }
                const destinationAccount = await db.get(
                    'SELECT id, type FROM accounts WHERE id = ? AND user_id = ?',
                    [transaction.transferAccountId, currentUser.id]
                );
                const sourceAccount = await db.get(
                    'SELECT id, type FROM accounts WHERE id = ? AND user_id = ?',
                    [transaction.accountId, currentUser.id]
                );
                if (destinationAccount?.type === 'credit' && sourceAccount?.type !== 'credit') {
                    await refreshCreditCardPaymentCategoryEnvelope(db, {
                        userId: currentUser.id,
                        accountId: destinationAccount.id,
                        date: txDate,
                        userIntentAssignment: true,
                    });
                }
                notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:added' });
                if (updateService) updateService.publish('transaction:added', transferResult?.data || {});
                return transferResult;
            }

            let categoryId = transaction.categoryId;
            if (categoryId === 'inflow_ready_to_assign' || categoryId === '') {
                categoryId = null;
            }

            // Regular transaction (non-transfer)
            const transactionData = {
                accountId: transaction.accountId,
                userId: currentUser.id,
                date: transaction.date || new Date().toISOString().split('T')[0],
                description: transaction.description || transaction.payee || 'Transaction',
                amount,
                categoryId: categoryId || null,
                payee: transaction.payee || null,
                memo: transaction.memo || null,
                isCleared: transaction.cleared ? 1 : 0
            };

            const service = new TransactionService(() => getDatabase());
            const result = await service.createTransaction(transactionData);

            let creditReserveDelta = 0;
            const insertedRow = result?.id
                ? { id: result.id }
                : await db.get(
                    `SELECT id FROM transactions
                     WHERE account_id = ? AND user_id = ? AND date = ? AND amount = ?
                     ORDER BY created_at DESC LIMIT 1`,
                    [transaction.accountId, currentUser.id, transactionData.date, amount]
                );
            if (insertedRow?.id && transactionCategorizationService?.processImportedTransaction) {
                const processed = await transactionCategorizationService.processImportedTransaction(
                    db,
                    currentUser.id,
                    insertedRow.id,
                    {
                        merchantName: transaction.payee || transaction.description,
                        description: transactionData.description,
                        importSource: 'manual',
                        plaidCategoryId: categoryId,
                        isTransfer: false,
                    }
                );
                creditReserveDelta = processed.creditReserveDelta || 0;
            } else if (transaction.payee && !transaction.isTransfer) {
                try {
                    await payeeService.createOrUpdatePayee(transaction.payee, currentUser.id);
                } catch (payeeError) {
                    console.warn('Failed to save payee:', payeeError);
                }
            }

            const poolTx = insertedRow?.id
                ? await db.get(
                    'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
                    [insertedRow.id, currentUser.id]
                )
                : null;
            if (transactionLifecycle?.runPostTransactionEffects) {
                try {
                    await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                        accountIds: [transaction.accountId],
                        dates: [transactionData.date],
                        skipLedgerSync: true,
                        db,
                        poolTransaction: poolTx,
                    });
                } catch (e) {
                    console.warn('post-transaction budget refresh:', e?.message || e);
                }
            }
            if (creditReserveDelta !== 0) {
                await applyCreditCardPaymentReserveDelta(db, {
                    userId: currentUser.id,
                    accountId: transaction.accountId,
                    date: transactionData.date,
                    delta: creditReserveDelta
                });
            }
            notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:added' });
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

            const database = await getDatabase();
            const pre = await database.get(
                `SELECT id, account_id, date, is_transfer, linked_transaction_id, category_id, amount, direction, payee, description
                 FROM transactions WHERE id = ? AND user_id = ?`,
                [id, currentUser.id]
            );
            if (!pre) return { success: false, error: 'Transaction not found' };

            const normalizedTransfer = normalizeTransactionUpdatePayload(updates);

            if (pre.is_transfer !== 1 && normalizedTransfer.destinationAccountId) {
                const result = await payeeService.convertTransactionToTransfer(
                    id,
                    currentUser.id,
                    normalizedTransfer.destinationAccountId,
                    normalizedTransfer
                );
                const post = await database.get(
                    'SELECT account_id, date FROM transactions WHERE id = ? AND user_id = ?',
                    [id, currentUser.id]
                );
                const accountIds = [pre.account_id];
                if (post?.account_id) accountIds.push(post.account_id);
                if (normalizedTransfer.destinationAccountId) {
                    accountIds.push(normalizedTransfer.destinationAccountId);
                }
                if (transactionLifecycle?.runPostTransactionEffects) {
                    try {
                        await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                            accountIds: [...new Set(accountIds)],
                            dates: [pre.date, post?.date].filter(Boolean),
                            skipLedgerSync: true
                        });
                    } catch (e) {
                        console.warn('post-transaction budget refresh (convert transfer):', e?.message || e);
                    }
                }
                notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:updated' });
                if (updateService) updateService.publish('transaction:updated', result?.data ?? result);
                return result?.success !== false
                    ? { success: true, data: result?.data }
                    : { success: false, error: result?.error || 'Update failed' };
            }

            if (pre.is_transfer === 1) {
                const result = await payeeService.updateLinkedTransfer(
                    id,
                    currentUser.id,
                    normalizedTransfer
                );
                const dates = [pre.date];
                if (updates.date !== undefined && updates.date !== pre.date) {
                    dates.push(updates.date);
                }
                const accountIds = [pre.account_id];
                if (pre.linked_transaction_id) {
                    const peer = await database.get(
                        'SELECT account_id FROM transactions WHERE id = ?',
                        [pre.linked_transaction_id]
                    );
                    if (peer?.account_id) accountIds.push(peer.account_id);
                }
                if (transactionLifecycle?.runPostTransactionEffects) {
                    try {
                        await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                            accountIds,
                            dates,
                            skipLedgerSync: true
                        });
                    } catch (e) {
                        console.warn('post-transaction budget refresh (transfer update):', e?.message || e);
                    }
                }
                notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:updated' });
                if (updateService) updateService.publish('transaction:updated', result?.data ?? result);
                return result?.success !== false
                    ? { success: true, data: result?.data }
                    : { success: false, error: result?.error || 'Update failed' };
            }

            const service = new TransactionService(() => getDatabase());
            const normalizedUpdates = normalizeTransactionUpdatePayload(updates);

            let creditReserveDelta = 0;
            const categoryChanging =
                Object.prototype.hasOwnProperty.call(normalizedUpdates, 'category_id');
            const amountChanging =
                Object.prototype.hasOwnProperty.call(normalizedUpdates, 'amount');

            if (
                categoryChanging &&
                transactionCategorizationService?.assignCategory &&
                pre.is_transfer !== 1
            ) {
                const catResult = await transactionCategorizationService.assignCategory(
                    database,
                    currentUser.id,
                    id,
                    normalizedUpdates.category_id,
                    { source: 'user_action', learnRule: true, applyCreditReserve: true }
                );
                creditReserveDelta = catResult.creditReserveDelta || 0;
                delete normalizedUpdates.category_id;
            }

            let result = null;
            if (Object.keys(normalizedUpdates).length > 0) {
                result = await service.updateTransaction(id, currentUser.id, normalizedUpdates);
            }

            const post = await database.get(
                `SELECT id, account_id, date, category_id, amount, direction, is_transfer, payee, description
                 FROM transactions WHERE id = ? AND user_id = ?`,
                [id, currentUser.id]
            );
            const dates = [pre.date];
            if (post?.date && post.date !== pre.date) dates.push(post.date);

            if (transactionLifecycle?.runPostTransactionEffects) {
                try {
                    await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                        accountIds: [pre.account_id],
                        dates,
                        skipLedgerSync: true,
                        db: database,
                        poolReverseTransaction: pre,
                        poolTransaction: post,
                    });
                } catch (e) {
                    console.warn('post-transaction budget refresh (update):', e?.message || e);
                }
            }
            if (
                (amountChanging || categoryChanging) &&
                monthlyBudgetService?.refreshCategoryEnvelopesForward
            ) {
                const categoryIds = [
                    ...new Set(
                        [pre.category_id, post?.category_id]
                            .filter((cid) => cid != null && String(cid).trim() !== '')
                            .map((cid) => String(cid))
                    ),
                ];
                if (categoryIds.length) {
                    try {
                        await monthlyBudgetService.refreshCategoryEnvelopesForward(
                            database,
                            currentUser.id,
                            pre.date,
                            categoryIds
                        );
                    } catch (e) {
                        console.warn('category envelope refresh (update):', e?.message || e);
                    }
                }
            }
            if (creditReserveDelta !== 0) {
                await applyCreditCardPaymentReserveDelta(database, {
                    userId: currentUser.id,
                    accountId: pre.account_id,
                    date: post?.date || pre.date,
                    delta: creditReserveDelta
                });
            }
            const updatedRow = await database.get(
                `SELECT t.*, a.name AS account_name, c.name AS category_name
                 FROM transactions t
                 JOIN accounts a ON t.account_id = a.id
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.id = ? AND t.user_id = ?`,
                [id, currentUser.id]
            );
            notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:updated' });
            if (updateService) {
                updateService.publish('transaction:updated', updatedRow);
                updateService.publish('transaction:patched', updatedRow);
            }
            return { success: true, data: updatedRow };
        } catch (error) {
            console.error('Error in updateTransaction:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('deleteTransaction', async (event, id) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };

            const database = await getDatabase();
            const pre = await database.get(
                `SELECT t.id, t.is_transfer, t.account_id, t.date, t.linked_transaction_id, t.category_id,
                        t.amount, t.direction, t.payee, t.description, t.cc_payment_reserved,
                        a.type AS account_type
                 FROM transactions t
                 JOIN accounts a ON CAST(a.id AS TEXT) = CAST(t.account_id AS TEXT)
                 WHERE t.id = ? AND t.user_id = ?`,
                [id, currentUser.id]
            );
            if (!pre) return { success: false, error: 'Transaction not found' };

            if (pre.is_transfer === 1) {
                let peerAccountId = null;
                if (pre.linked_transaction_id) {
                    const peer = await database.get(
                        'SELECT account_id FROM transactions WHERE id = ?',
                        [pre.linked_transaction_id]
                    );
                    if (peer) peerAccountId = peer.account_id;
                }
                const readyToAssignPoolService =
                    require(path.join(__dirname, '../services/budget/readyToAssignPoolService.cjs'));
                const poolReverseTransferPair =
                    readyToAssignPoolService.buildTransferPairFromTransaction(pre);
                const result = await payeeService.deleteLinkedTransfer(id, currentUser.id);
                if (transactionLifecycle?.runPostTransactionEffects) {
                    try {
                        await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                            accountIds: [pre.account_id, peerAccountId].filter(Boolean),
                            dates: [pre.date],
                            skipLedgerSync: true,
                            db: database,
                            poolReverseTransferPair,
                        });
                    } catch (e) {
                        console.warn('post-transaction budget refresh (transfer delete):', e?.message || e);
                    }
                }
                notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:deleted' });
                if (updateService) updateService.publish('transaction:deleted', { id });
                return result;
            }

            await releaseReserveForDeletedTransaction(database, {
                userId: currentUser.id,
                transactionRow: pre,
            });

            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const result = await service.deleteTransaction(id, currentUser.id);

            if (transactionLifecycle?.runPostTransactionEffects) {
                try {
                    await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                        accountIds: [pre.account_id],
                        dates: [pre.date],
                        skipLedgerSync: true,
                        db: database,
                        poolReverseTransaction: pre,
                    });
                } catch (e) {
                    console.warn('post-transaction budget refresh (delete):', e?.message || e);
                }
            }
            notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:deleted' });
            if (updateService) updateService.publish('transaction:deleted', { id });
            return { success: true, data: result };
        } catch (error) {
            console.error('Error in deleteTransaction:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:bulkUpdate', async (event, payload) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };

            const ids = Array.isArray(payload) ? null : payload?.ids;
            const updates = Array.isArray(payload) ? null : payload?.updates;
            const idList = Array.isArray(payload) ? payload : ids;

            if (!Array.isArray(idList) || idList.length === 0) {
                return { success: false, error: 'No transaction ids provided' };
            }
            if (!updates || typeof updates !== 'object') {
                return { success: false, error: 'No updates provided' };
            }

            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const normalizedUpdates = normalizeTransactionUpdatePayload(updates);

            let bulkResult = { updated: 0, skipped: 0, accountIds: [], dates: [] };

            if (
                Object.prototype.hasOwnProperty.call(normalizedUpdates, 'category_id') &&
                transactionCategorizationService?.bulkAssignCategory
            ) {
                const db = await getDatabase();
                const catBulk = await transactionCategorizationService.bulkAssignCategory(
                    db,
                    currentUser.id,
                    idList,
                    normalizedUpdates.category_id,
                    { source: 'user_action', learnRule: true, applyCreditReserve: true }
                );
                bulkResult.dates = catBulk.dates || [];
                bulkResult.accountIds = catBulk.accountIds || [];
                bulkResult.updated = catBulk.results.filter((r) => r.success).length;
                for (const r of catBulk.results) {
                    if (r.success && r.creditReserveDelta) {
                        await applyCreditCardPaymentReserveDelta(db, {
                            userId: currentUser.id,
                            accountId: r.accountId,
                            date: (r.dates && r.dates[0]) || bulkResult.dates[0],
                            delta: r.creditReserveDelta,
                        });
                    }
                }
                delete normalizedUpdates.category_id;
            }

            if (Object.keys(normalizedUpdates).length > 0) {
                const result = await service.bulkUpdateTransactions(
                    idList,
                    currentUser.id,
                    normalizedUpdates
                );
                bulkResult = {
                    ...result,
                    updated: (bulkResult.updated || 0) + (result.updated || 0),
                    accountIds: [...new Set([...(bulkResult.accountIds || []), ...(result.accountIds || [])])],
                    dates: [...new Set([...(bulkResult.dates || []), ...(result.dates || [])])],
                };
            }

            const result = bulkResult;

            if (transactionLifecycle?.runPostTransactionEffects && result.dates?.length) {
                try {
                    await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                        accountIds: result.accountIds,
                        dates: result.dates,
                        skipLedgerSync: true,
                    });
                } catch (e) {
                    console.warn('post-transaction budget refresh (bulk update):', e?.message || e);
                }
            }

            notifyBudgetStateChanged('prosperity:updated', {
                userId: currentUser.id,
                reason: 'transaction:updated',
            });
            if (updateService) {
                updateService.publish('transaction:updated', {
                    bulk: true,
                    count: result.updated,
                });
            }

            return { success: true, data: result };
        } catch (error) {
            console.error('transactions:bulkUpdate error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:bulkDelete', async (event, payload) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };

            const ids = Array.isArray(payload) ? payload : payload?.ids;
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: false, error: 'No transaction ids provided' };
            }

            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const result = await service.bulkDeleteTransactions(ids, currentUser.id);

            if (transactionLifecycle?.runPostTransactionEffects && result.dates?.length) {
                try {
                    await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                        accountIds: result.accountIds,
                        dates: result.dates,
                        skipLedgerSync: true,
                    });
                } catch (e) {
                    console.warn('post-transaction budget refresh (bulk delete):', e?.message || e);
                }
            }

            notifyBudgetStateChanged('prosperity:updated', {
                userId: currentUser.id,
                reason: 'transaction:deleted',
            });
            if (updateService) {
                updateService.publish('transaction:deleted', {
                    bulk: true,
                    count: result.deleted,
                });
            }

            return { success: true, data: result };
        } catch (error) {
            console.error('transactions:bulkDelete error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:pairTransfers', async () => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            const { pairTransfersForUser } = require('../services/transactions/plaidTransferPairing.cjs');
            const db = await getDatabase();
            const result = await pairTransfersForUser(db, currentUser.id, { lookbackDays: 90 });
            if (transactionLifecycle?.runPostTransactionEffects && result.accountIds?.length) {
                await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                    accountIds: result.accountIds,
                    dates: [],
                    skipLedgerSync: true,
                    forwardMonths: 3,
                });
            }
            notifyBudgetStateChanged('prosperity:updated', {
                userId: currentUser.id,
                reason: 'transaction:transfer-pairing',
            });
            return { success: true, data: result };
        } catch (error) {
            console.error('transactions:pairTransfers error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:getMlModelStatus', async () => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            const db = await getDatabase();
            const { categoryMlService } = require('../services/transactions/categoryMlService.cjs');
            const status = await categoryMlService.getModelStatus(db, currentUser.id);
            return { success: true, data: status };
        } catch (error) {
            console.error('transactions:getMlModelStatus error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:retrainCategoryMl', async () => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            const db = await getDatabase();
            const result = await transactionCategorizationService.retrainMlModel(db, currentUser.id);
            return { success: true, data: result };
        } catch (error) {
            console.error('transactions:retrainCategoryMl error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:getMlSuggestion', async (event, transactionId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            const db = await getDatabase();
            const data = await transactionCategorizationService.getMlSuggestionForTransaction(
                db,
                currentUser.id,
                transactionId
            );
            return { success: true, data };
        } catch (error) {
            console.error('transactions:getMlSuggestion error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:getUncategorizedSummary', async () => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            if (!transactionCategorizationService?.getUncategorizedSummary) {
                return { success: true, data: { uncategorizedCount: 0, uncategorizedTotalAmount: 0, needsReviewCount: 0 } };
            }
            const data = await transactionCategorizationService.getUncategorizedSummary(currentUser.id);
            return { success: true, data };
        } catch (error) {
            console.error('transactions:getUncategorizedSummary error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:getSplits', async (event, transactionId) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            const db = await getDatabase();
            const data = await transactionCategorizationService.getTransactionSplits(
                db,
                currentUser.id,
                transactionId
            );
            return { success: true, data };
        } catch (error) {
            console.error('transactions:getSplits error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:clearSplits', async (event, payload) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            const transactionId =
                typeof payload === 'string' ? payload : payload?.transactionId;
            if (!transactionId) return { success: false, error: 'transactionId required' };
            const db = await getDatabase();
            const result = await transactionCategorizationService.clearTransactionSplits(
                db,
                currentUser.id,
                transactionId,
                { categoryId: payload?.categoryId ?? null }
            );
            const tx = await db.get(
                'SELECT account_id, date FROM transactions WHERE id = ?',
                [transactionId]
            );
            if (transactionLifecycle?.runPostTransactionEffects && tx) {
                await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                    accountIds: [tx.account_id],
                    dates: [tx.date],
                    skipLedgerSync: true,
                });
            }
            notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:split-cleared' });
            return { success: true, data: result };
        } catch (error) {
            console.error('transactions:clearSplits error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('transactions:setSplits', async (event, payload) => {
        try {
            const currentUser = userService.getCurrentUser();
            if (!currentUser) return { success: false, error: 'No user logged in' };
            const { transactionId, splits } = payload || {};
            if (!transactionId || !Array.isArray(splits)) {
                return { success: false, error: 'transactionId and splits required' };
            }
            const db = await getDatabase();
            const result = await transactionCategorizationService.setTransactionSplits(
                db,
                currentUser.id,
                transactionId,
                splits,
                { source: 'user_action' }
            );
            const tx = await db.get(
                'SELECT account_id, date FROM transactions WHERE id = ?',
                [transactionId]
            );
            if (transactionLifecycle?.runPostTransactionEffects && tx) {
                await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                    accountIds: [tx.account_id],
                    dates: [tx.date],
                    skipLedgerSync: true,
                });
            }
            notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'transaction:split' });
            return { success: true, data: result };
        } catch (error) {
            console.error('transactions:setSplits error:', error);
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
            const db = await getDatabase();
            const dbPath = getDatabasePath();
            const service = new TransactionService(dbPath);
            const result = await service.reconcileAccount(accountId, currentUser.id, statementBalance, transactionsToClear);
            if (result?.adjustment_transaction_id && transactionLifecycle?.runPostTransactionEffects) {
                const poolTx = await db.get(
                    'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
                    [result.adjustment_transaction_id, currentUser.id]
                );
                if (poolTx) {
                    try {
                        await transactionLifecycle.runPostTransactionEffects(currentUser.id, {
                            accountIds: [accountId],
                            dates: [poolTx.date],
                            skipLedgerSync: true,
                            db,
                            poolTransaction: poolTx,
                        });
                    } catch (e) {
                        console.warn('post-transaction budget refresh (reconcile):', e?.message || e);
                    }
                }
            }
            notifyBudgetStateChanged('prosperity:updated', { userId: currentUser.id, reason: 'account:reconciled' });
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
            const ownerId = resolveCategoryOwnerId(categoryData.user_id);
            if (!ownerId) {
                return { success: false, error: 'No user logged in' };
            }
            let groupId = categoryData.group_id;
            if (groupId) {
                const groupExists = await db.get(
                    'SELECT id FROM category_groups WHERE id = ? AND user_id = ?',
                    [groupId, ownerId]
                );
                if (!groupExists) groupId = null;
            }
            const id = categoryData.id || `cat_${Date.now()}`;
            await db.run(
                `INSERT INTO categories (id, user_id, name, group_id, assigned, target_type, target_frequency, target_amount, target_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    ownerId,
                    categoryData.name,
                    groupId,
                    categoryData.assigned || 0,
                    categoryData.target_type || 'monthly',
                    categoryData.target_frequency || 'monthly',
                    categoryData.target_amount || 0,
                    categoryData.target_date || null
                ]
            );
            const newCategory = await db.get('SELECT * FROM categories WHERE id = ? AND user_id = ?', [id, ownerId]);
            notifyBudgetStateChanged('category:created', { categoryId: id, userId: ownerId });
            return { success: true, data: newCategory };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ==================== ARCHIVE/RESTORE CATEGORY ====================
    ipcMain.handle('category:archive', async (event, categoryId, userId, archiveHints = {}) => {
        try {
            const db = await getDatabase();
            const ownerId = await resolveBudgetOwnerId(db, userId);
            if (ownerId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!ownerId) return { success: false, error: 'No user logged in' };
            const category = await findCategoryRowById(db, categoryId, ownerId);
            if (!category) return { success: false, error: 'Category not found' };
            if (category.is_credit_card_payment_category === 1) {
                return { success: false, error: 'Credit card payment categories cannot be archived.' };
            }
            const canonicalCategoryId = category.id;
            if (isCategoryArchivedFlag(category.archived)) {
                return {
                    success: true,
                    data: {
                        id: canonicalCategoryId,
                        archived: true,
                        message: 'Category is already archived',
                    },
                };
            }
            const { groupId: groupIdForArchive, groupName: groupNameForArchive } =
                await resolveCategoryGroupSnapshot(db, category, ownerId, archiveHints);
            const archivedAtIso = new Date().toISOString();
            const updateResult = await db.run(
                `UPDATE categories
                 SET archived = 1,
                     archived_at = ?,
                     original_group_id = ?,
                     original_group_name = ?,
                     group_id = NULL,
                     updated_at = datetime('now')
                 WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
                [
                    archivedAtIso,
                    groupIdForArchive,
                    groupNameForArchive,
                    canonicalCategoryId,
                    ownerId,
                ]
            );
            if (!updateResult?.changes) {
                return { success: false, error: 'Category could not be archived (no matching row updated)' };
            }
            notifyBudgetStateChanged('category:updated', { categoryId: canonicalCategoryId, userId: ownerId, archived: true });
            return { success: true, data: { id: canonicalCategoryId, archived: true, message: 'Category archived successfully' } };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('category:restore', async (event, categoryId, userId, restoreHints = {}) => {
        try {
            const db = await getDatabase();
            const ownerId = await resolveBudgetOwnerId(db, userId);
            if (ownerId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!ownerId) return { success: false, error: 'No user logged in' };
            const category = await findCategoryRowById(db, categoryId, ownerId);
            if (!category) return { success: false, error: 'Category not found' };
            if (!isCategoryArchivedFlag(category.archived)) {
                return { success: false, error: 'Category is not archived' };
            }
            const canonicalCategoryId = category.id;
            const targetGroupId = await resolveCategoryRestoreTarget(
                db,
                category,
                ownerId,
                restoreHints
            );
            if (!targetGroupId) {
                return {
                    success: false,
                    error: 'Could not assign a category group for restore. Create a group and try again.',
                };
            }
            const updateResult = await db.run(
                `UPDATE categories
                 SET archived = 0,
                     group_id = ?,
                     restored_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
                [targetGroupId, canonicalCategoryId, ownerId]
            );
            if (!updateResult?.changes) {
                return { success: false, error: 'Category could not be restored (no matching row updated)' };
            }
            notifyBudgetStateChanged('category:updated', { categoryId: canonicalCategoryId, userId: ownerId, archived: false });
            return {
                success: true,
                data: {
                    id: canonicalCategoryId,
                    archived: false,
                    group_id: targetGroupId,
                    original_group_id: targetGroupId,
                    message: 'Category restored successfully',
                },
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('category:getArchived', async (event, userId) => {
        try {
            const db = await getDatabase();
            const targetUserId = await resolveBudgetOwnerId(db, userId);
            if (targetUserId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session', data: [] };
            if (!targetUserId) return { success: true, data: [] };
            const archivedCategories = await db.all(
                `SELECT c.*,
                        COALESCE(NULLIF(TRIM(c.original_group_name), ''), cg.name) AS group_name
                 FROM categories c
                 LEFT JOIN category_groups cg
                   ON CAST(cg.id AS TEXT) = CAST(
                     COALESCE(NULLIF(TRIM(c.original_group_id), ''), NULLIF(TRIM(c.group_id), '')) AS TEXT
                   )
                  AND CAST(cg.user_id AS TEXT) = CAST(c.user_id AS TEXT)
                 WHERE c.user_id = ? AND ${sqlCategoryIsArchived('c')}
                 ORDER BY c.archived_at DESC`,
                [targetUserId]
            );
            for (const row of archivedCategories) {
                const preservedName =
                    row.original_group_name != null && String(row.original_group_name).trim() !== ''
                        ? String(row.original_group_name).trim()
                        : row.group_name != null && String(row.group_name).trim() !== ''
                          ? String(row.group_name).trim()
                          : null;
                if (preservedName && preservedName !== row.original_group_name) {
                    await db.run(
                        `UPDATE categories
                         SET original_group_name = ?
                         WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
                        [preservedName, row.id, targetUserId]
                    );
                    row.original_group_name = preservedName;
                    row.group_name = preservedName;
                }
            }
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
            notifyBudgetStateChanged('category:updated', { categoryId, userId, is_hidden: newHiddenStatus });
            return { success: true, data: { id: categoryId, is_hidden: newHiddenStatus } };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('getCategories', async (event, userId, monthKey) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session', data: [] };
            if (!targetUserId) return { success: true, data: [] };

            const mKey = monthKey
                ? monthlyBudgetService.toLocalMonthKey(monthKey)
                : monthlyBudgetService.toLocalMonthKey(new Date());

            if (monthKey) {
                await runCreditCardPaymentCategorySync(targetUserId, 'get_categories_month');
                const snapshot = await monthlyBudgetService.getBudgetMonthSnapshot(
                    dbConnection,
                    targetUserId,
                    mKey
                );
                return { success: true, data: snapshot.categories || [] };
            }

            const categories = await dbConnection.all(
                `SELECT c.*, cg.name as group_name
                 FROM categories c
                 LEFT JOIN category_groups cg
                   ON CAST(cg.id AS TEXT) = CAST(COALESCE(c.group_id, '') AS TEXT)
                  AND cg.user_id = c.user_id
                 WHERE c.user_id = ?
                   AND ${sqlCategoryNotArchived('c')}
                 ORDER BY cg.sort_order ASC, c.name ASC`,
                [targetUserId]
            );
            const enriched = await monthlyBudgetService.enrichCategoriesWithUnderfunded(
                dbConnection,
                targetUserId,
                categories,
                mKey
            );
            return { success: true, data: enriched };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('budget:getAssignmentAudit', async (event, userId, opts = {}) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session', data: [] };
            }
            if (!targetUserId) {
                return { success: true, data: [] };
            }
            const { getBudgetAssignmentAuditLog } = require('../services/budget/budgetAssignmentAuditService.cjs');
            const rows = await getBudgetAssignmentAuditLog(dbConnection, targetUserId, opts || {});
            return { success: true, data: rows };
        } catch (error) {
            console.error('budget:getAssignmentAudit error:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    ipcMain.handle('budget:getGlobalSummary', async (event, userId) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session', data: null };
            }
            if (!targetUserId) {
                return {
                    success: true,
                    data: {
                        currentMonthKey: monthlyBudgetService.toLocalMonthKey(new Date()),
                        totalCash: 0,
                        totalAssigned: 0,
                        futureAssigned: 0,
                        readyToAssign: 0,
                        futureBreakdown: [],
                    },
                };
            }
            const totalCash = await resolveBudgetCashTotal(targetUserId);
            const summary = await monthlyBudgetService.getGlobalBudgetSummary(
                dbConnection,
                targetUserId,
                totalCash
            );
            return { success: true, data: summary };
        } catch (error) {
            console.error('budget:getGlobalSummary error:', error);
            return { success: false, error: error.message, data: null };
        }
    });

    ipcMain.handle('budget:getUnderfundedSummary', async (event, userId, monthKey) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session', data: null };
            }
            if (!targetUserId) {
                return { success: true, data: { underfundedTotal: 0, categoryBreakdown: [], monthKey: '' } };
            }
            const snapshot = await monthlyBudgetService.getBudgetMonthSnapshot(
                dbConnection,
                targetUserId,
                monthKey || monthlyBudgetService.toLocalMonthKey(new Date())
            );
            return {
                success: true,
                data: {
                    monthKey: snapshot.monthKey,
                    underfundedTotal: snapshot.underfundedTotal ?? 0,
                    categoryBreakdown: snapshot.underfundedBreakdown ?? [],
                },
            };
        } catch (error) {
            console.error('budget:getUnderfundedSummary error:', error);
            return { success: false, error: error.message, data: null };
        }
    });

    ipcMain.handle('budget:listTimelineMonths', async (event, userId) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!targetUserId) {
                return { success: true, data: { months: [], currentMonthKey: monthlyBudgetService.toLocalMonthKey(new Date()) } };
            }
            const data = await monthlyBudgetService.listBudgetTimelineMonths(dbConnection, targetUserId);
            return { success: true, data };
        } catch (error) {
            console.error('budget:listTimelineMonths error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:getMonthSnapshot', async (event, userId, monthKey) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session', data: { categories: [], monthKey: '', isCurrentCalendarMonth: false } };
            if (!targetUserId) return { success: true, data: { categories: [], monthKey: '', isCurrentCalendarMonth: false } };

            await runCreditCardPaymentCategorySync(targetUserId, 'budget_month_snapshot');

            const snapshot = await monthlyBudgetService.getBudgetMonthSnapshot(
                dbConnection,
                targetUserId,
                monthKey || monthlyBudgetService.toLocalMonthKey(new Date())
            );
            return { success: true, data: snapshot };
        } catch (error) {
            console.error('budget:getMonthSnapshot error:', error);
            return { success: false, error: error.message, data: { categories: [], monthKey: '', isCurrentCalendarMonth: false } };
        }
    });

    ipcMain.handle('budget:getCategoryActivityTransactionIds', async (event, userId, categoryId, monthKey) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!targetUserId) {
                return { success: true, data: { transaction_ids: [] } };
            }
            const mKey = monthlyBudgetService.toLocalMonthKey(monthKey || new Date());
            const ids = await monthlyBudgetService.getCategoryActivityTransactionIds(
                dbConnection,
                targetUserId,
                categoryId,
                mKey
            );
            return { success: true, data: { transaction_ids: ids, monthKey: mKey, categoryId } };
        } catch (error) {
            console.error('budget:getCategoryActivityTransactionIds error:', error);
            return { success: false, error: error.message, data: { transaction_ids: [] } };
        }
    });

    ipcMain.handle('budget:bulkAssignMonth', async (event, userId, monthKey, assignments, opts = {}) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!targetUserId) {
                return { success: false, error: 'User not found' };
            }
            if (!Array.isArray(assignments) || assignments.length === 0) {
                return { success: false, error: 'No assignments provided' };
            }

            const totalCash = await resolveBudgetCashTotal(targetUserId);
            const result = await monthlyBudgetService.applyMonthBudgetBulkAndRefresh(
                dbConnection,
                targetUserId,
                monthKey || monthlyBudgetService.toLocalMonthKey(new Date()),
                assignments,
                {
                    mode: opts?.mode || 'delta',
                    totalCash,
                    auditSource: opts?.auditSource || 'bulk_assign',
                    auditMetadata: opts?.auditMetadata || null,
                    skipPoolAdjustment: opts?.skipPoolAdjustment === true,
                }
            );
            notifyBudgetStateChanged('budget:bulkAssigned', {
                userId: targetUserId,
                monthKey: result.monthKey,
                count: result.assignments.length,
            });
            notifyBudgetStateChanged('prosperity:updated', {
                userId: targetUserId,
                reason: 'budget:bulkAssigned',
            });
            return { success: true, data: result };
        } catch (error) {
            console.error('budget:bulkAssignMonth error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:repairAssignments', async (event, userId, monthKey, opts = {}) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!targetUserId) {
                return { success: false, error: 'User not found' };
            }
            await runCreditCardPaymentCategorySync(targetUserId, 'budget_repair');
            const forwardMonths = Number(opts?.forwardMonths) || 6;
            const result = await monthlyBudgetService.repairAndRefreshBudgetMonths(
                dbConnection,
                targetUserId,
                monthKey || monthlyBudgetService.toLocalMonthKey(new Date()),
                forwardMonths
            );
            notifyBudgetStateChanged('budget:repaired', {
                userId: targetUserId,
                monthKey: result.monthKey,
                repairCount: result.repairs?.length || 0,
            });
            notifyBudgetStateChanged('prosperity:updated', {
                userId: targetUserId,
                reason: 'budget:repaired',
            });
            return { success: true, data: result };
        } catch (error) {
            console.error('budget:repairAssignments error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:consolidateAssignments', async (event, userId, monthKey, opts = {}) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!targetUserId) {
                return { success: false, error: 'User not found' };
            }
            const result = await monthlyBudgetService.consolidateAvailableIntoMonthAssignments(
                dbConnection,
                targetUserId,
                monthKey || monthlyBudgetService.toLocalMonthKey(new Date()),
                { ...opts, userIntentAssignment: true, auditSource: 'consolidate_assignments' }
            );
            notifyBudgetStateChanged('budget:consolidated', {
                userId: targetUserId,
                monthKey: result.monthKey,
                count: result.conversions?.length || 0,
            });
            notifyBudgetStateChanged('prosperity:updated', {
                userId: targetUserId,
                reason: 'budget:consolidated',
            });
            return { success: true, data: result };
        } catch (error) {
            console.error('budget:consolidateAssignments error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:unassignMonth', async (event, userId, monthKey) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!targetUserId) {
                return { success: false, error: 'User not found' };
            }
            const result = await monthlyBudgetService.unassignAllForMonth(
                dbConnection,
                targetUserId,
                monthKey || monthlyBudgetService.toLocalMonthKey(new Date()),
                { auditSource: 'unassign_month' }
            );
            notifyBudgetStateChanged('budget:unassigned', {
                userId: targetUserId,
                monthKey: result.monthKey,
                totalReleased: result.totalReleased,
            });
            notifyBudgetStateChanged('prosperity:updated', {
                userId: targetUserId,
                reason: 'budget:unassigned',
            });
            return { success: true, data: result };
        } catch (error) {
            console.error('budget:unassignMonth error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:resetEnvelopes', async (event, userId, monthKey) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!targetUserId) {
                return { success: false, error: 'User not found' };
            }
            const result = await monthlyBudgetService.resetEnvelopesFromMonth(
                dbConnection,
                targetUserId,
                monthKey || monthlyBudgetService.toLocalMonthKey(new Date()),
                { userIntentAssignment: true }
            );
            notifyBudgetStateChanged('budget:resetEnvelopes', {
                userId: targetUserId,
                monthKey: result.monthKey,
            });
            return { success: true, data: result };
        } catch (error) {
            console.error('budget:resetEnvelopes error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:setReadyToAssignPool', async (event, userId, targetBalance) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!targetUserId) {
                return { success: false, error: 'User not found' };
            }
            const balance = await monthlyBudgetService.setReadyToAssignPoolBalance(
                dbConnection,
                targetUserId,
                Number(targetBalance) || 0
            );
            await dbConnection.run(
                `UPDATE user_budget_pool
                 SET pool_backfilled = 1, updated_at = datetime('now')
                 WHERE user_id = ?`,
                [targetUserId]
            );
            notifyBudgetStateChanged('prosperity:updated', {
                userId: targetUserId,
                reason: 'budget:pool_set',
            });
            return { success: true, data: { readyToAssign: balance } };
        } catch (error) {
            console.error('budget:setReadyToAssignPool error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:reconcilePoolEnvelope', async (event, userId) => {
        try {
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!targetUserId) {
                return { success: false, error: 'User not found' };
            }
            const totalCash = await resolveBudgetCashTotal(targetUserId);
            const result = await monthlyBudgetService.reconcileBudgetPoolEnvelope(
                dbConnection,
                targetUserId,
                totalCash
            );
            notifyBudgetStateChanged('prosperity:updated', {
                userId: targetUserId,
                reason: 'budget:pool_reconciled',
            });
            return { success: true, data: result };
        } catch (error) {
            console.error('budget:reconcilePoolEnvelope error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:getIntegrityState', async (event, userId, monthKey) => {
        try {
            const budgetIntegrityService =
                require(path.join(__dirname, '../services/budget/budgetIntegrityService.cjs'));
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!targetUserId) {
                return { success: false, error: 'User not found' };
            }
            const state = await budgetIntegrityService.evaluateBudgetIdentity(
                dbConnection,
                targetUserId,
                { monthKey }
            );
            return { success: true, data: state };
        } catch (error) {
            console.error('budget:getIntegrityState error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('budget:scopeActiveAccounts', async (event, userId, keepAccountNames) => {
        try {
            const budgetIntegrityService =
                require(path.join(__dirname, '../services/budget/budgetIntegrityService.cjs'));
            const dbConnection = await getDatabase();
            let targetUserId = await resolveBudgetOwnerId(dbConnection, userId);
            if (targetUserId === '__AUTH_MISMATCH__') {
                return { success: false, error: 'User mismatch for this session' };
            }
            if (!targetUserId) {
                return { success: false, error: 'User not found' };
            }
            const result = await budgetIntegrityService.scopeActiveAccountsExcept(
                dbConnection,
                targetUserId,
                keepAccountNames || []
            );
            notifyBudgetStateChanged('accounts-updated', { userId: targetUserId });
            return { success: true, data: result };
        } catch (error) {
            console.error('budget:scopeActiveAccounts error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-category', async (event, categoryId) => {
        try {
            const db = await getDatabase();
            await db.run('DELETE FROM categories WHERE id = ?', [categoryId]);
            notifyBudgetStateChanged('category:deleted', { categoryId });
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
            const userId = currentUser?.id;
            if (!userId) return { success: true, data: [] };
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
            const category = await findCategoryRowById(db, categoryId);
            if (category?.is_credit_card_payment_category === 1) {
                return { success: false, error: 'Credit card payment categories are system-managed and cannot be deleted directly.' };
            }
            const transactions = await db.get('SELECT COUNT(*) as count FROM transactions WHERE category_id = ?', [categoryId]);
            if (transactions.count > 0) await db.run('DELETE FROM transactions WHERE category_id = ?', [categoryId]);
            await db.run('DELETE FROM categories WHERE id = ?', [categoryId]);
            notifyBudgetStateChanged('category:deleted', { categoryId });
            return { success: true, data: {} };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-account', async (event, accountId, userId) => {
        try {
            const ownerId = resolveBudgetOwnerId(null, userId);
            if (ownerId === '__AUTH_MISMATCH__') return { success: false, error: 'User mismatch for this session' };
            if (!ownerId) return { success: false, error: 'No user logged in' };
            const deleted = await accountService.deleteAccount(accountId, ownerId);
            if (deleted) {
                notifyAccountsUpdated('manual');
                return { success: true, data: { deleted: true } };
            }
            return { success: false, error: 'Account not found or already deleted' };
        } catch (error) {
            return { success: false, error: error.message, code: error.code };
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
        return { success: true };
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
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac
            ? [
                  {
                      label: app.name,
                      submenu: [
                          { role: 'about' },
                          { type: 'separator' },
                          { role: 'services' },
                          { type: 'separator' },
                          { role: 'hide' },
                          { role: 'hideOthers' },
                          { role: 'unhide' },
                          { type: 'separator' },
                          { role: 'quit' },
                      ],
                  },
              ]
            : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Budget',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => mainWindow?.webContents.send('menu-new-budget'),
                },
                {
                    label: 'Open Budget...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => mainWindow?.webContents.send('menu-open-budget'),
                },
                { type: 'separator' },
                {
                    label: 'Import from CSV...',
                    click: () => mainWindow?.webContents.send('menu-import-csv'),
                },
                {
                    label: 'Export to CSV...',
                    click: () => mainWindow?.webContents.send('menu-export-csv'),
                },
                ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
            ],
        },
        {
            label: 'Edit',
            submenu: getEditMenuTemplate(),
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
    if (extensionBridge) extensionBridge.stop();
    if (nativeServer) nativeServer.close();
    if (db && typeof db.close === 'function') db.close();
    else if (db && db.$pool) db.close();
});

createMenu();