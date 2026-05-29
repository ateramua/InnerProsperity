# Plaid production setup (IntentFlow)

This complements in-app defaults: Electron loads `IntentFlow/.env` in development and **`plaid.env.json` in packaged userData**. The relay runs **outside** the desktop app.

## 1. Packaged keys (`plaid.env.json`)

1. Copy `IntentFlow/plaid.env.example.json` → your userData folder as **`plaid.env.json`**:
   - **macOS:** `~/Library/Application Support/IntentFlow/plaid.env.json`
   - **Windows:** `%APPDATA%\IntentFlow\plaid.env.json` (typically)
   - **Linux:** `$XDG_CONFIG_HOME/IntentFlow/plaid.env.json` or `~/.config/IntentFlow/plaid.env.json`
2. Fill `PLAID_CLIENT_ID`, `PLAID_SECRET`, set `PLAID_ENV` to `production` when ready.
3. Set `PLAID_WEBHOOK_RELAY_URL` to your **HTTPS relay base** (no trailing slash paths required in the JSON value).
4. If the relay protects `/pending` with a Bearer key, set `PLAID_WEBHOOK_RELAY_API_KEY` to the same secret (must match **`RELAY_API_KEY`** / **`PLAID_WEBHOOK_RELAY_API_KEY`** on the server—see relay script).
5. Restart the app so `loadPlaidEnvFromUserData` runs during startup.

Development still uses **`IntentFlow/.env`** (`PLAID_*` vars); packaged builds prioritize `plaid.env.json` when present.

## 2. Production OAuth redirect (`PLAID_REDIRECT_URI`)

**Host file:** `IntentFlow/public/plaid-oauth-redirect/oauth-callback.html` is copied into the site root as **`/plaid-oauth-redirect/oauth-callback.html`** (Next `public/` or static export `out/`).

1. In **[Plaid Dashboard](https://dashboard.plaid.com/)** → **Team settings** → **API** → **Allowed redirect URIs**, add exactly the HTTPS URL where that file is served (no `?` query of your own — Plaid appends `oauth_state_id`).
2. Set in **`IntentFlow/.env`** (development) **or** `plaid.env.json` in userData (packaged app) — same string as the allowlist:
   - `PLAID_ENV=production`
   - `PLAID_REDIRECT_URI=<same URL as allowlist, character-for-character>`
3. Restart the app. IntentFlow adds `redirect_uri` to `/link/token/create` when **`PLAID_ENV` is `production` or `development`** and `PLAID_REDIRECT_URI` is set.
4. **Desktop OAuth resume:** the hosted callback redirects to `intentflow://plaid-oauth?oauth_state_id=…`. Register the `intentflow` URL scheme in packaged builds (see `package.json` → `protocols`). Keep IntentFlow open on Linked Banks while completing OAuth at an institution like Chase.

## 3. Webhook relay (HTTPS + JWT verification)

The desktop app **cannot** receive Plaid webhooks. Use a small HTTPS service that:

1. Accepts `POST /plaid/webhook` from Plaid.
2. Verifies the **`Plaid-Verification`** JWT and body hash (see [Plaid webhook verification](https://plaid.com/docs/api/webhooks/webhook-verification/)).
3. Exposes `GET /pending?userId=…` for the app to poll and `POST /pending/ack` for successful processing acknowledgements.

### Run the production relay (Node)

**Deploy on Fly / Docker:** see [`deployment/plaid-relay/README.md`](../deployment/plaid-relay/README.md) (slim image, HTTPS via the platform).

From `IntentFlow/` (local process):

```bash
npm run plaid:relay
```

Required environment on the **server**:

| Variable | Purpose |
|----------|---------|
| `PLAID_CLIENT_ID` | Same as app |
| `PLAID_SECRET` | Same as app (use **production** secret when `PLAID_ENV=production`) |
| `PLAID_ENV` | `production` or `sandbox` (must match the environment that sends webhooks) |
| `PORT` | Listen port (default `8787`) |
| `HOST` | Bind address (default `0.0.0.0`) |
| `RELAY_API_KEY` or `PLAID_WEBHOOK_RELAY_API_KEY` | Optional; if set, `/pending` requires `Authorization: Bearer <key>` |
| `PLAID_WEBHOOK_STORE_PATH` | Optional durable queue path (default `data/plaid-webhooks.json`; use a persistent disk path in production) |

Optional:

| Variable | Purpose |
|----------|---------|
| `PLAID_RELAY_SKIP_JWT_VERIFY` | `true` only for local mocks—**never** in production |
| `PLAID_WEBHOOK_DELIVERY_RETRY_MS` | Retry window for `/pending` delivery attempts (default 5 minutes) |
| `PLAID_WEBHOOK_MAX_COMPLETED_EVENTS` | Delivered-event retention for deduplication (default 500) |

### Plaid Dashboard webhook URL

Set **Team webhooks** (or item-level if you use that) to:

`https://your-relay-host.example/plaid/webhook`

Use TLS (Let’s Encrypt, managed cert on Fly/Railway/Render, etc.).

### Desktop app

Set:

- `PLAID_WEBHOOK_RELAY_URL=https://your-relay-host.example`
- `PLAID_WEBHOOK_RELAY_API_KEY=<same as RELAY_API_KEY>` if you enabled auth on `/pending`

The main process polls `GET {PLAID_WEBHOOK_RELAY_URL}/pending?userId=…` during sync and acknowledges successfully processed events with `POST {PLAID_WEBHOOK_RELAY_URL}/pending/ack`.

### Item → user registration (required for webhooks)

Plaid ITEM webhooks include `item_id` but not your app user id. After each bank connect (and on login / startup), the desktop app calls:

`POST {PLAID_WEBHOOK_RELAY_URL}/items/register` with body `{ "itemId": "…", "userId": "…" }` (same Bearer key as `/pending` when `RELAY_API_KEY` is set).

On disconnect, the app calls `POST /items/unregister`. The relay stores mappings in `itemUsers` inside the webhook store file.

### TLS termination

Terminating TLS at a reverse proxy (Caddy, nginx, load balancer) is fine: forward **`Plaid-Verification`** and raw body unchanged to Node.

### Durable webhook queue

The production relay persists webhook events to **`data/plaid-webhooks.json`** by default, dedupes by Plaid `webhook_id` (or a raw-body SHA-256 hash), and reloads unfinished events on startup. The app acknowledges successful processing through `/pending/ack`; unacknowledged delivery attempts become retryable after the configured retry window. If your host has an ephemeral filesystem, attach a persistent disk and set **`PLAID_WEBHOOK_STORE_PATH`** to that mounted path (for example `/data/plaid-webhooks.json` on Render). `GET /health` reports queue counts and the active store path.

### Local development

Use the **in-memory stub** without JWT verification:

```bash
npm run plaid:relay-example
```

Point `PLAID_WEBHOOK_RELAY_URL=http://localhost:8787`. For Sandbox, prefer `npm run plaid:relay` once keys are loaded so JWT verification matches production.

## 4. Operational checklist

- [ ] Production Plaid keys in Dashboard; rotation plan documented internally.
- [ ] `PLAID_REDIRECT_URI` registered and set in prod `plaid.env.json`.
- [ ] Relay deployed with HTTPS, `PLAID_ENV=production`, JWT verify **on** (`PLAID_RELAY_SKIP_JWT_VERIFY` unset).
- [ ] Plaid webhook URL points at relay `/plaid/webhook`; fire test webhook from Sandbox before go-live if possible.
- [ ] `RELAY_API_KEY` set & mirrored in desktop `PLAID_WEBHOOK_RELAY_API_KEY`.

## 5. NPM scripts summary

| Command | Purpose |
|---------|---------|
| `npm run plaid:relay-example` | In-memory stub, no JWT (local quick test) |
| `npm run plaid:relay` | Production-style relay with JWT verification |
| `npm run plaid:report-duplicates` | Local duplicate-account report (offline admin) |

From repo root, `npm run plaid:relay` forwards to IntentFlow via root `package.json`.

# 6. Env Notes

   ## Plaid Deployment URLs

### Vercel Frontend / OAuth Page

Production app URL:

https://intentflow-6c9b.vercel.app

Deployment-specific URL:

https://intentflow-6c9b-o35owkz1z-abdi-teramus-projects.vercel.app

Plaid OAuth redirect URI:

https://intentflow-6c9b.vercel.app/plaid-oauth.html

Use the Plaid OAuth redirect URI when Plaid asks for an allowed redirect URI.

### Render Webhook Relay

Render service base URL:

https://intentflow-m0m4.onrender.com

Plaid webhook relay URL:

https://intentflow-m0m4.onrender.com/plaid/webhook

Use the Plaid webhook relay URL when Plaid asks for a webhook URL.

### Summary

Vercel hosts the browser page that Plaid redirects back to after OAuth.

Render hosts the relay/server endpoint that can receive Plaid webhook events.

# IntentFlow — Plaid Production Deployment Configuration

## 1. Vercel Production App URL

Stable production base URL:

```env
https://intentflow-6c9b.vercel.app
```

This is the main production frontend URL and should be used for Plaid OAuth redirect configuration.

---

## 2. Vercel Deployment URL (Do NOT use for Plaid)

Deployment-specific URL:

```env
https://intentflow-6c9b-o35owkz1z-abdi-teramus-projects.vercel.app
```

This URL may change between deployments.

Do NOT use this for:

* Plaid Redirect URI
* Production OAuth configuration
* Persistent integrations

Use only the stable Vercel production domain instead.

---

# 3. Plaid OAuth Redirect URI

Correct production redirect URI:

```env
https://intentflow-6c9b.vercel.app/oauth-callback.html
```

Add ONLY this URL inside:

* Plaid Dashboard
* Allowed Redirect URIs

---

# 4. Render Webhook Relay Service

Render base service URL:

```env
https://intentflow-m0m4.onrender.com
```

This service hosts the Plaid webhook relay/server.

---

# 5. Plaid Webhook Endpoint

Relay route defined in the app:

```env
/plaid/webhook
```

Full production webhook endpoint:

```env
https://intentflow-m0m4.onrender.com/plaid/webhook
```

This is the URL Plaid sends webhook events to.

---

# 6. App Environment Variable Configuration

Inside your app `.env`:

```env
PLAID_WEBHOOK_RELAY_URL=https://intentflow-m0m4.onrender.com
```

IMPORTANT:

* Use ONLY the base URL
* Do NOT append `/plaid/webhook`

The application constructs the route internally.

---

# 7. Plaid Dashboard Webhook Configuration

When Plaid asks for a webhook URL, use:

```env
https://intentflow-m0m4.onrender.com/plaid/webhook
```

This must include the full endpoint path.

---

# 8. Frontend vs Backend Responsibilities

## Vercel

Hosts:

* Frontend app
* OAuth callback page

Purpose:

* Plaid redirects users back here after OAuth/login flow

---

## Render

Hosts:

* Plaid webhook relay/server

Purpose:

* Receives Plaid webhook events
* Processes account updates/sync notifications

---

# 9. Current PLAID_REDIRECT_URI Value

Current configured value:

```env
PLAID_REDIRECT_URI=https://intentflow-6c9b-o35owkz1z-abdi-teramus-projects.vercel.app/plaid-oauth-redirect/oauth-callback.html
```

Recommended production value instead:

```env
PLAID_REDIRECT_URI=https://intentflow-6c9b.vercel.app/oauth-callback.html
```

Reason:

* Uses stable production domain
* Avoids deployment-specific URL changes
* Better for Plaid production reliability

---

# 10. Final Recommended Production Values

```env
PLAID_REDIRECT_URI=https://intentflow-6c9b.vercel.app/oauth-callback.html

PLAID_WEBHOOK_RELAY_URL=https://intentflow-m0m4.onrender.com
```

Plaid webhook endpoint:

```env
https://intentflow-m0m4.onrender.com/plaid/webhook
```
