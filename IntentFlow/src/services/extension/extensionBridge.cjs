const http = require('http');
const { randomBytes, randomUUID } = require('crypto');

const BRIDGE_PROTOCOL_VERSION = '2026.05';
const DEFAULT_PORTS = [37631, 37632, 37633];
const MAX_BODY_BYTES = 256 * 1024;

function sendJson(res, statusCode, payload, origin = '*') {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-IntentFlow-Source',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(payload));
}

function safeOrigin(origin) {
    if (!origin) return '*';
    if (
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://') ||
        origin.startsWith('safari-web-extension://') ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
    ) {
        return origin;
    }
    return 'null';
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];

        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('Request body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            if (!chunks.length) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(new Error('Invalid JSON body'));
            }
        });

        req.on('error', reject);
    });
}

function getCurrentUserId(userService) {
    const user = userService && typeof userService.getCurrentUser === 'function'
        ? userService.getCurrentUser()
        : null;
    return user?.id || 2;
}

function getCurrentUser(userService) {
    return userService && typeof userService.getCurrentUser === 'function'
        ? userService.getCurrentUser()
        : null;
}

function createAccessToken() {
    return randomBytes(32).toString('base64url');
}

async function ensureCaptureTable(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS extension_captures (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            url TEXT NOT NULL,
            title TEXT,
            selected_text TEXT,
            detected_kind TEXT,
            status TEXT NOT NULL DEFAULT 'captured',
            created_at TEXT NOT NULL
        )
    `);
}

function normalizeCapturedPage(payload) {
    const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
    if (!url || !/^https?:\/\//i.test(url)) {
        throw new Error('A valid http(s) URL is required');
    }

    return {
        id: payload.id || randomUUID(),
        url,
        title: String(payload.title || 'Untitled page').slice(0, 500),
        selectedText: typeof payload.selectedText === 'string' ? payload.selectedText.slice(0, 4000) : null,
        detectedKind: typeof payload.detectedKind === 'string' ? payload.detectedKind.slice(0, 80) : 'general',
        capturedAt: payload.capturedAt || new Date().toISOString(),
    };
}

async function buildDashboardSummary({ getDatabase, accountService, monthlyBudgetService, userService }) {
    const userId = getCurrentUserId(userService);
    const db = await getDatabase();
    const accounts = await db.all(
        `SELECT id, name, type, account_type_category, working_balance, balance, is_active
         FROM accounts
         WHERE user_id = ? AND IFNULL(is_active, 1) = 1`,
        [userId]
    );

    let totals = null;
    if (accountService && typeof accountService.getTotalsByType === 'function') {
        try {
            totals = await accountService.getTotalsByType(userId);
        } catch {
            totals = null;
        }
    }

    const availableCash = accounts
        .filter((account) => (account.account_type_category || 'budget') === 'budget')
        .reduce((sum, account) => sum + Number(account.working_balance ?? account.balance ?? 0), 0);

    let monthlyBudgetRemaining = null;
    let underfundedTotal = null;
    let underfundedBreakdown = [];
    if (monthlyBudgetService && typeof monthlyBudgetService.getBudgetMonthSnapshot === 'function') {
        try {
            const monthKey = monthlyBudgetService.toLocalMonthKey
                ? monthlyBudgetService.toLocalMonthKey(new Date())
                : undefined;
            const snapshot = await monthlyBudgetService.getBudgetMonthSnapshot(userId, monthKey);
            if (Array.isArray(snapshot?.categories)) {
                monthlyBudgetRemaining = snapshot.categories.reduce(
                    (sum, category) => sum + Number(category.available ?? category.remaining ?? 0),
                    0
                );
            }
            if (snapshot?.underfundedTotal != null) {
                underfundedTotal = Number(snapshot.underfundedTotal) || 0;
                underfundedBreakdown = snapshot.underfundedBreakdown || [];
            }
        } catch {
            monthlyBudgetRemaining = null;
        }
    }

    const plaidAttention = await db.get(
        `SELECT COUNT(*) AS count
         FROM plaid_items
         WHERE user_id = ?
           AND (status IS NOT NULL AND status NOT IN ('active', 'good'))`,
        [userId]
    ).catch(() => ({ count: 0 }));

    return {
        netWorth: Number(totals?.netWorth ?? totals?.grandTotal ?? availableCash),
        availableCash,
        monthlyBudgetRemaining: monthlyBudgetRemaining ?? availableCash,
        underfundedTotal,
        underfundedBreakdown,
        accountsNeedingAttention: Number(plaidAttention?.count || 0),
        pendingTasks: 0,
        unreadNotifications: Number(plaidAttention?.count || 0),
        lastSyncAt: new Date().toISOString(),
    };
}

async function capturePage({ getDatabase, userService, updateService }, payload) {
    const userId = getCurrentUserId(userService);
    const capture = normalizeCapturedPage(payload);
    const db = await getDatabase();
    await ensureCaptureTable(db);
    await db.run(
        `INSERT OR REPLACE INTO extension_captures
         (id, user_id, url, title, selected_text, detected_kind, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'captured', ?)`,
        [
            capture.id,
            String(userId),
            capture.url,
            capture.title,
            capture.selectedText,
            capture.detectedKind,
            capture.capturedAt,
        ]
    );

    if (updateService && typeof updateService.publish === 'function') {
        updateService.publish('extension:capture-created', {
            id: capture.id,
            userId,
            title: capture.title,
            url: capture.url,
        });
    }

    return { ok: true, id: capture.id };
}

function createExtensionBridge(deps) {
    let server = null;
    let activePort = null;
    const sessions = new Map();

    function pruneSessions() {
        const now = Date.now();
        for (const [token, session] of sessions.entries()) {
            if (Date.parse(session.expiresAt) <= now) {
                sessions.delete(token);
            }
        }
    }

    function authenticate(req) {
        pruneSessions();
        const header = req.headers.authorization || '';
        const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(header) ? header[0] : header);
        if (!match) return null;
        return sessions.get(match[1]) || null;
    }

    async function createSession(pairingPayload = {}) {
        const currentUser = getCurrentUser(deps.userService) || { id: getCurrentUserId(deps.userService), username: 'IntentFlow user' };
        const approved = typeof deps.requestPairingApproval === 'function'
            ? await deps.requestPairingApproval(pairingPayload)
            : true;

        if (!approved) {
            const error = new Error('Pairing rejected');
            error.statusCode = 403;
            throw error;
        }

        const accessToken = createAccessToken();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
        const session = {
            authenticated: true,
            userId: String(currentUser.id),
            displayName: currentUser.fullName || currentUser.full_name || currentUser.username || 'IntentFlow user',
            accessToken,
            expiresAt,
            scopes: ['dashboard:read', 'capture:create', 'sync:queue'],
        };
        sessions.set(accessToken, session);
        return session;
    }

    async function handleRequest(req, res) {
        const origin = safeOrigin(req.headers.origin);

        if (req.method === 'OPTIONS') {
            sendJson(res, 204, {}, origin);
            return;
        }

        try {
            const url = new URL(req.url || '/', 'http://127.0.0.1');

            if (req.method === 'GET' && url.pathname === '/extension/health') {
                sendJson(res, 200, {
                    ok: true,
                    app: 'IntentFlow',
                    desktopVersion: deps.appVersion,
                    protocolVersion: BRIDGE_PROTOCOL_VERSION,
                    port: activePort,
                }, origin);
                return;
            }

            if (req.method === 'POST' && url.pathname === '/extension/pair/request') {
                if (req.headers['x-intentflow-source'] !== 'browser-extension') {
                    sendJson(res, 403, { ok: false, error: 'Forbidden' }, origin);
                    return;
                }
                const payload = await readJsonBody(req);
                const session = await createSession(payload);
                sendJson(res, 200, { ok: true, session }, origin);
                return;
            }

            if (req.method === 'GET' && url.pathname === '/extension/dashboard-summary') {
                if (!authenticate(req)) {
                    sendJson(res, 401, { ok: false, error: 'Pairing required' }, origin);
                    return;
                }
                const summary = await buildDashboardSummary(deps);
                sendJson(res, 200, summary, origin);
                return;
            }

            if (req.method === 'POST' && url.pathname === '/extension/capture-page') {
                if (req.headers['x-intentflow-source'] !== 'browser-extension') {
                    sendJson(res, 403, { ok: false, error: 'Forbidden' }, origin);
                    return;
                }
                if (!authenticate(req)) {
                    sendJson(res, 401, { ok: false, error: 'Pairing required' }, origin);
                    return;
                }
                const payload = await readJsonBody(req);
                const result = await capturePage(deps, payload);
                sendJson(res, 200, result, origin);
                return;
            }

            sendJson(res, 404, { ok: false, error: 'Not found' }, origin);
        } catch (error) {
            sendJson(res, error.statusCode || 500, { ok: false, error: error.message || 'Bridge error' }, origin);
        }
    }

    async function start() {
        if (server) return { server, port: activePort };

        for (const port of DEFAULT_PORTS) {
            try {
                await new Promise((resolve, reject) => {
                    const candidate = http.createServer((req, res) => {
                        void handleRequest(req, res);
                    });
                    candidate.on('error', reject);
                    candidate.listen(port, '127.0.0.1', () => {
                        server = candidate;
                        activePort = port;
                        resolve();
                    });
                });

                console.log(`✅ IntentFlow extension bridge listening on http://127.0.0.1:${activePort}`);
                return { server, port: activePort };
            } catch (error) {
                if (error.code !== 'EADDRINUSE') {
                    console.warn(`⚠️ Extension bridge failed on port ${port}:`, error.message);
                }
            }
        }

        throw new Error(`Unable to start extension bridge on ports ${DEFAULT_PORTS.join(', ')}`);
    }

    function stop() {
        if (!server) return;
        server.close();
        server = null;
        activePort = null;
    }

    return { start, stop, get port() { return activePort; } };
}

module.exports = {
    BRIDGE_PROTOCOL_VERSION,
    createExtensionBridge,
};
