/**
 * Desktop ↔ webhook relay helpers (item_id → user_id registration).
 */

function getRelayBaseUrl() {
  const raw = process.env.PLAID_WEBHOOK_RELAY_URL;
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

function getRelayAuthHeaders() {
  const key = process.env.PLAID_WEBHOOK_RELAY_API_KEY;
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

async function relayFetch(path, options = {}) {
  const baseUrl = getRelayBaseUrl();
  if (!baseUrl) return { ok: false, skipped: true, reason: 'no_relay_url' };

  const headers = {
    'Content-Type': 'application/json',
    ...getRelayAuthHeaders(),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Register Plaid item_id → app user_id so webhooks can be routed to /pending polls. */
async function registerPlaidItemWithRelay(itemId, userId) {
  if (!itemId || userId == null) return { registered: false, skipped: true };
  const result = await relayFetch('/items/register', {
    method: 'POST',
    body: JSON.stringify({ itemId: String(itemId), userId: String(userId) }),
  });
  return {
    registered: Boolean(result.ok),
    skipped: Boolean(result.skipped),
    error: result.error,
  };
}

async function unregisterPlaidItemFromRelay(itemId) {
  if (!itemId) return { unregistered: false, skipped: true };
  const result = await relayFetch('/items/unregister', {
    method: 'POST',
    body: JSON.stringify({ itemId: String(itemId) }),
  });
  return {
    unregistered: Boolean(result.ok),
    skipped: Boolean(result.skipped),
    error: result.error,
  };
}

async function registerAllPlaidItemsWithRelay(getItemsForUser) {
  if (!getRelayBaseUrl()) return { registered: 0, skipped: true };
  if (typeof getItemsForUser !== 'function') return { registered: 0, error: 'no_getter' };

  const pairs = await getItemsForUser();
  let registered = 0;
  for (const { itemId, userId } of pairs) {
    const r = await registerPlaidItemWithRelay(itemId, userId);
    if (r.registered) registered += 1;
  }
  return { registered, total: pairs.length };
}

module.exports = {
  getRelayBaseUrl,
  registerPlaidItemWithRelay,
  unregisterPlaidItemFromRelay,
  registerAllPlaidItemsWithRelay,
};
