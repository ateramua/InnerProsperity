#!/usr/bin/env node
/**
 * Native Messaging host for IntentFlow browser extensions.
 *
 * Browser extensions talk to this process using Chrome/Firefox native messaging.
 * This process intentionally does not open the database directly; it forwards
 * requests to the desktop app's localhost-only extension bridge.
 */
const http = require('http');

const PORTS = [37631, 37632, 37633];
const MAX_MESSAGE_BYTES = 1024 * 1024;

function readMessage() {
    return new Promise((resolve) => {
        const chunks = [];
        let total = 0;

        process.stdin.on('data', (chunk) => {
            chunks.push(chunk);
            total += chunk.length;

            if (total < 4) return;

            const buffer = Buffer.concat(chunks, total);
            const length = buffer.readUInt32LE(0);
            if (length > MAX_MESSAGE_BYTES) {
                writeMessage({ ok: false, error: 'Native message too large' });
                process.exit(1);
            }

            if (buffer.length >= length + 4) {
                const body = buffer.subarray(4, length + 4).toString('utf8');
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve({ type: 'invalid', payload: null });
                }
            }
        });

        process.stdin.on('end', () => resolve(null));
    });
}

function writeMessage(payload) {
    const json = Buffer.from(JSON.stringify(payload), 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(json.length, 0);
    process.stdout.write(Buffer.concat([header, json]));
}

function requestBridge(port, method, pathname, body, accessToken = null) {
    return new Promise((resolve, reject) => {
        const encoded = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                path: pathname,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': encoded ? encoded.length : 0,
                    'X-IntentFlow-Source': 'browser-extension',
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                timeout: 1200,
            },
            (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
                        else reject(new Error(parsed.error || `Bridge returned ${res.statusCode}`));
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );

        req.on('timeout', () => {
            req.destroy(new Error('Bridge request timed out'));
        });
        req.on('error', reject);
        if (encoded) req.write(encoded);
        req.end();
    });
}

async function callBridge(method, pathname, body, accessToken = null) {
    let lastError = null;
    for (const port of PORTS) {
        try {
            return await requestBridge(port, method, pathname, body, accessToken);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('IntentFlow desktop bridge is not running');
}

async function handleMessage(message) {
    if (!message || typeof message !== 'object') {
        return { ok: false, error: 'Invalid native message' };
    }

    switch (message.type) {
        case 'bridge.ping':
            return callBridge('GET', '/extension/health');
        case 'pair.request':
            return callBridge('POST', '/extension/pair/request', message.payload || {});
        case 'dashboard.summary':
            return callBridge('GET', '/extension/dashboard-summary', null, message.payload?.accessToken);
        case 'capture.page':
            return callBridge('POST', '/extension/capture-page', message.payload || {}, message.payload?.accessToken);
        default:
            return { ok: false, error: `Unsupported message type: ${message.type || 'unknown'}` };
    }
}

(async () => {
    const message = await readMessage();
    const response = await handleMessage(message).catch((error) => ({
        ok: false,
        error: error.message || 'Native host error',
    }));
    writeMessage(response);
})();
