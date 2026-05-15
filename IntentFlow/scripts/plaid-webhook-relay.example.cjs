/**
 * Minimal in-memory webhook relay (no JWT verification).
 * For production, use `npm run plaid:relay` → `scripts/plaid-webhook-relay.cjs` and read
 * IntentFlow/docs/plaid-production-deploy.md
 *
 * Plaid POST → this service → pending flags per user/item
 * Desktop polls: GET /pending?userId=... (PLAID_WEBHOOK_RELAY_URL)
 */
const http = require('http');

const pendingByUser = new Map();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/pending') {
    const userId = url.searchParams.get('userId');
    const items = pendingByUser.get(userId) || [];
    pendingByUser.set(userId, []);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/plaid/webhook') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const itemId = payload.item_id;
        const clientUserId = payload.client_user_id || payload.user_id;
        const webhookCode = payload.webhook_code || payload.webhook_type;
        if (clientUserId && itemId) {
          const list = pendingByUser.get(String(clientUserId)) || [];
          list.push({
            itemId,
            syncRequired: webhookCode !== 'PENDING_EXPIRATION',
            webhookCode,
          });
          pendingByUser.set(String(clientUserId), list);
        }
        res.writeHead(200);
        res.end('ok');
      } catch (err) {
        res.writeHead(400);
        res.end(err.message);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

const port = Number(process.env.PORT) || 8787;
server.listen(port, () => {
  console.log(`Plaid webhook relay example listening on http://localhost:${port}`);
  console.log('Set PLAID_WEBHOOK_RELAY_URL=http://localhost:' + port);
});
