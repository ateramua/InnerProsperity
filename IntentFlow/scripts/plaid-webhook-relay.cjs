#!/usr/bin/env node
/**
 * Production-style Plaid webhook relay for IntentFlow (deploy on Fly.io / Railway / Render).
 *
 * - POST /plaid/webhook — Plaid sends ITEM webhooks here; verifies Plaid-Verification JWT
 *   (unless PLAID_RELAY_SKIP_JWT_VERIFY=true for non-Plaid mocks only).
 * - GET /pending?userId=… — Desktop polls & clears queued flags (optional Bearer RELAY_API_KEY).
 * - GET /health — liveness
 *
 * In Plaid Dashboard → Team → Webhooks: set webhook URL to
 *   https://your-host.example/plaid/webhook
 *
 * Set in desktop app: PLAID_WEBHOOK_RELAY_URL=https://your-host.example
 */

require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env'),
});

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const { verifyPlaidWebhook } = require('./lib/plaidWebhookVerify.cjs');

const DEFAULT_STORE_PATH = path.resolve(__dirname, '../data/plaid-webhooks.json');
const webhookStorePath = process.env.PLAID_WEBHOOK_STORE_PATH || DEFAULT_STORE_PATH;
const DELIVERY_RETRY_AFTER_MS = Number(process.env.PLAID_WEBHOOK_DELIVERY_RETRY_MS) || 5 * 60 * 1000;
const MAX_COMPLETED_EVENTS = Number(process.env.PLAID_WEBHOOK_MAX_COMPLETED_EVENTS) || 500;

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function ensureStoreFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, events: [] }, null, 2));
  }
}

function loadWebhookStore(filePath) {
  ensureStoreFile(filePath);
  const parsed = safeJsonParse(fs.readFileSync(filePath, 'utf8'), { version: 1, events: [] });
  if (!Array.isArray(parsed.events)) return { version: 1, events: [] };
  return {
    version: 1,
    events: parsed.events.filter((event) => event && event.id && event.status),
  };
}

function writeWebhookStore(filePath, store) {
  const delivered = [];
  const active = [];
  for (const event of store.events || []) {
    if (event.status === 'delivered') delivered.push(event);
    else active.push(event);
  }
  delivered.sort((a, b) => String(b.deliveredAt || '').localeCompare(String(a.deliveredAt || '')));
  const compacted = {
    version: 1,
    events: [...active, ...delivered.slice(0, MAX_COMPLETED_EVENTS)],
  };
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(compacted, null, 2));
  fs.renameSync(tmpPath, filePath);
  return compacted;
}

function createWebhookStore(filePath) {
  let store = loadWebhookStore(filePath);

  function persist() {
    store = writeWebhookStore(filePath, store);
  }

  function getEventId(payload, rawBuf) {
    if (payload.webhook_id) return String(payload.webhook_id);
    const hash = crypto.createHash('sha256').update(rawBuf).digest('hex');
    return `sha256:${hash}`;
  }

  function add(payload, rawBuf) {
    const now = new Date().toISOString();
    const id = getEventId(payload, rawBuf);
    const existing = store.events.find((event) => event.id === id);
    if (existing) {
      existing.duplicateCount = (existing.duplicateCount || 0) + 1;
      existing.lastSeenAt = now;
      persist();
      return { event: existing, duplicate: true };
    }

    const itemId = payload.item_id || null;
    const userId = payload.client_user_id ?? payload.clientUserId ?? payload.user_id;
    const webhookCode = payload.webhook_code ?? payload.webhook_type ?? null;
    const event = {
      id,
      itemId,
      userId: userId == null ? null : String(userId),
      webhookType: payload.webhook_type || null,
      webhookCode,
      syncRequired: webhookCode !== 'PENDING_EXPIRATION',
      status: itemId && userId != null ? 'pending' : 'ignored',
      attempts: 0,
      duplicateCount: 0,
      receivedAt: now,
      lastSeenAt: now,
      lastAttemptAt: null,
      deliveredAt: null,
      payload,
    };
    store.events.push(event);
    persist();
    return { event, duplicate: false };
  }

  function pendingForUser(userId) {
    const nowMs = Date.now();
    return store.events.filter((event) => {
      if (event.userId !== String(userId || '')) return false;
      if (event.status === 'pending') return true;
      if (event.status !== 'delivery_attempted') return false;
      const lastAttempt = event.lastAttemptAt ? Date.parse(event.lastAttemptAt) : 0;
      return Number.isNaN(lastAttempt) || nowMs - lastAttempt >= DELIVERY_RETRY_AFTER_MS;
    });
  }

  function markDeliveryAttempted(eventIds) {
    const now = new Date().toISOString();
    const ids = new Set(eventIds);
    for (const event of store.events) {
      if (!ids.has(event.id)) continue;
      event.status = 'delivery_attempted';
      event.attempts = (event.attempts || 0) + 1;
      event.lastAttemptAt = now;
    }
    persist();
  }

  function markDelivered(eventIds) {
    const now = new Date().toISOString();
    const ids = new Set(eventIds);
    for (const event of store.events) {
      if (!ids.has(event.id)) continue;
      event.status = 'delivered';
      event.deliveredAt = now;
    }
    persist();
  }

  function stats() {
    const counts = store.events.reduce((acc, event) => {
      acc[event.status] = (acc[event.status] || 0) + 1;
      return acc;
    }, {});
    return {
      path: filePath,
      total: store.events.length,
      pending: counts.pending || 0,
      deliveryAttempted: counts.delivery_attempted || 0,
      delivered: counts.delivered || 0,
      ignored: counts.ignored || 0,
    };
  }

  return { add, pendingForUser, markDeliveryAttempted, markDelivered, stats };
}

const webhookStore = createWebhookStore(webhookStorePath);

function createRelayPlaidClient() {
  const env = process.env.PLAID_ENV || 'sandbox';
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret || !PlaidEnvironments[env]) {
    throw new Error(`Relay needs PLAID_CLIENT_ID, PLAID_SECRET, and valid PLAID_ENV (got "${env}")`);
  }
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });
  return new PlaidApi(configuration);
}

function authPending(req, res) {
  const relayKey = process.env.RELAY_API_KEY || process.env.PLAID_WEBHOOK_RELAY_API_KEY;
  if (!relayKey) return true;

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== relayKey) {
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('unauthorized');
    return false;
  }
  return true;
}

async function handleWebhook(plaidClient, req, res, rawBuf) {
  const skipJwt = process.env.PLAID_RELAY_SKIP_JWT_VERIFY === 'true';

  let plaidVerificationHeader;
  for (const [k, v] of Object.entries(req.headers)) {
    if (String(k).toLowerCase() === 'plaid-verification') {
      plaidVerificationHeader = Array.isArray(v) ? v[0] : v;
      break;
    }
  }

  if (!skipJwt) {
    const v = await verifyPlaidWebhook({
      plaidClient,
      rawBody: rawBuf,
      plaidVerificationHeader,
    });
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'text/plain' });
      res.end(v.error);
      console.warn('[relay] webhook rejected:', v.error);
      return;
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('[relay] WARNING: PLAID_RELAY_SKIP_JWT_VERIFY=true in production is unsafe');
  }

  let payload;
  try {
    payload = JSON.parse(rawBuf.length ? rawBuf.toString('utf8') : '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('invalid json');
    return;
  }

  const { event, duplicate } = webhookStore.add(payload, rawBuf);

  if (event.status === 'pending') {
    console.log(
      `[relay] ${duplicate ? 'deduped' : 'queued'} item ${event.itemId} for user ${event.userId} (${event.webhookCode || 'unknown'})`
    );
  } else {
    console.warn('[relay] webhook missing item_id or client user id:', Object.keys(payload));
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
}

async function readJsonRequest(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('error', reject);
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function main() {
  let plaidClient;
  try {
    plaidClient = createRelayPlaidClient();
  } catch (e) {
    console.error('[relay]', e.message);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'intentflow-plaid-relay', store: webhookStore.stats() }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/pending') {
      if (!authPending(req, res)) return;

      const userId = url.searchParams.get('userId');
      const events = webhookStore.pendingForUser(userId || '');
      const items = events.map((event) => ({
        eventId: event.id,
        itemId: event.itemId,
        syncRequired: event.syncRequired,
        webhookCode: event.webhookCode || null,
        receivedAt: event.receivedAt,
        attempts: event.attempts || 0,
      }));
      webhookStore.markDeliveryAttempted(events.map((event) => event.id));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/pending/ack') {
      if (!authPending(req, res)) return;

      readJsonRequest(req)
        .then((body) => {
          const eventIds = Array.isArray(body?.eventIds) ? body.eventIds.map(String) : [];
          webhookStore.markDelivered(eventIds);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, acknowledged: eventIds.length }));
        })
        .catch(() => {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('invalid json');
        });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/plaid/webhook') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        const rawBuf = Buffer.concat(chunks);
        try {
          await handleWebhook(plaidClient, req, res, rawBuf);
        } catch (err) {
          console.error('[relay] handler error:', err);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('internal error');
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`Plaid webhook relay listening on http://${host}:${port}`);
    console.log(`Webhook URL (Plaid Dashboard): http://HOST:${port}/plaid/webhook (HTTPS in prod)`);
    console.log(`Polling: GET /pending?userId=YOUR_APP_USER_ID`);
    console.log(`RELAY_API_KEY configured: ${Boolean(process.env.RELAY_API_KEY || process.env.PLAID_WEBHOOK_RELAY_API_KEY)}`);
    console.log(`JWT verify skip: ${process.env.PLAID_RELAY_SKIP_JWT_VERIFY === 'true'} (sandbox mocks only)`);
    console.log(`Webhook store: ${webhookStorePath}`);
    console.log(`Recovered webhook events: ${JSON.stringify(webhookStore.stats())}`);
  });
}

main();
