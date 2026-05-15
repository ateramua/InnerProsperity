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
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const { verifyPlaidWebhook } = require('./lib/plaidWebhookVerify.cjs');

const pendingByUser = new Map();

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

  const itemId = payload.item_id;
  const clientUserId = payload.client_user_id ?? payload.clientUserId ?? payload.user_id;
  const webhookCode = payload.webhook_code ?? payload.webhook_type;

  if (clientUserId != null && itemId) {
    const uid = String(clientUserId);
    const list = pendingByUser.get(uid) || [];
    list.push({
      itemId,
      syncRequired: webhookCode !== 'PENDING_EXPIRATION',
      webhookCode: webhookCode || null,
    });
    pendingByUser.set(uid, list);
    console.log(`[relay] queued item ${itemId} for user ${uid} (${webhookCode || 'unknown'})`);
  } else {
    console.warn('[relay] webhook missing item_id or client user id:', Object.keys(payload));
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
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
      res.end(JSON.stringify({ ok: true, service: 'intentflow-plaid-relay' }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/pending') {
      if (!authPending(req, res)) return;

      const userId = url.searchParams.get('userId');
      const items = pendingByUser.get(userId || '') || [];
      pendingByUser.set(userId || '', []);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items }));
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
  });
}

main();
