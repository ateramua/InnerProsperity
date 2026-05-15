/**
 * Plaid webhook JWT verification per https://plaid.com/docs/api/webhooks/webhook-verification/
 * Requires exact raw request body bytes for SHA-256 (whitespace-sensitive).
 */
const crypto = require('crypto');
const { jwtVerify, importJWK } = require('jose');

const KEY_CACHE = new Map();
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) {
    if (String(k).toLowerCase() === lower) return v;
  }
  return undefined;
}

function peekJwtKidAndAlg(jwt) {
  if (!jwt || typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (header.alg !== 'ES256') return null;
    if (!header.kid) return null;
    return { kid: header.kid, alg: header.alg };
  } catch {
    return null;
  }
}

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a), 'hex');
    const bb = Buffer.from(String(b), 'hex');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

async function getVerificationJwk(plaidClient, kid) {
  const now = Date.now();
  const cached = KEY_CACHE.get(kid);
  if (cached && cached.expiresAt > now) return cached.jwk;

  const res = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const jwk = res.data?.key;
  if (!jwk) throw new Error('webhook_verification_key/get returned no key');

  const expiredAtSec = jwk.expired_at != null ? Number(jwk.expired_at) : null;
  const expiredAtMs = expiredAtSec != null && !Number.isNaN(expiredAtSec) ? expiredAtSec * 1000 : null;
  const expiresAt =
    expiredAtMs && expiredAtMs > now
      ? Math.min(expiredAtMs, now + KEY_CACHE_TTL_MS)
      : now + KEY_CACHE_TTL_MS;
  KEY_CACHE.set(kid, { jwk, expiresAt });
  return jwk;
}

/**
 * @param {object} opts
 * @param {import('plaid').PlaidApi} opts.plaidClient
 * @param {Buffer} opts.rawBody - exact POST body as received
 * @param {string|undefined} opts.plaidVerificationHeader - Plaid-Verification JWT
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string }>}
 */
async function verifyPlaidWebhook(opts) {
  const { plaidClient, rawBody, plaidVerificationHeader } = opts;
  const jwtHeader = plaidVerificationHeader;
  if (!jwtHeader) {
    return { ok: false, status: 401, error: 'missing Plaid-Verification header' };
  }

  const peek = peekJwtKidAndAlg(jwtHeader);
  if (!peek) {
    return { ok: false, status: 401, error: 'invalid Plaid-Verification JWT header' };
  }

  let jwk;
  try {
    jwk = await getVerificationJwk(plaidClient, peek.kid);
  } catch (e) {
    return { ok: false, status: 502, error: `verification key lookup failed: ${e.message}` };
  }

  let payload;
  try {
    const key = await importJWK(jwk);
    ({ payload } = await jwtVerify(jwtHeader, key, {
      algorithms: ['ES256'],
      maxTokenAge: '5m',
    }));
  } catch (e) {
    return { ok: false, status: 401, error: `JWT verify failed: ${e.message}` };
  }

  const expectedSha = payload.request_body_sha256;
  if (!expectedSha || typeof expectedSha !== 'string') {
    return { ok: false, status: 401, error: 'JWT missing request_body_sha256' };
  }

  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  if (!timingSafeEqualHex(bodyHash, expectedSha)) {
    return { ok: false, status: 401, error: 'request body SHA-256 mismatch' };
  }

  return { ok: true };
}

module.exports = {
  verifyPlaidWebhook,
  getHeader,
  peekJwtKidAndAlg,
  timingSafeEqualHex,
};
