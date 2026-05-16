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

**Host file:** `IntentFlow/public/plaid-oauth-redirect/oauth-callback.html` is copied into the site root as **`/plaid-oauth-redirect/oauth-callback.html`** (Next `public/` or static export `out/`). Extra hosting notes: [`deployment/plaid-oauth-redirect/README.md`](../deployment/plaid-oauth-redirect/README.md).

1. In **[Plaid Dashboard](https://dashboard.plaid.com/)** → **Team settings** → **API** → **Allowed redirect URIs**, add exactly the HTTPS URL where that file is served (no `?` query of your own — Plaid appends `oauth_state_id`).
2. Set in **`IntentFlow/.env`** (development) **or** `plaid.env.json` in userData (packaged app) — same string as the allowlist:
   - `PLAID_ENV=production`
   - `PLAID_REDIRECT_URI=<same URL as allowlist, character-for-character>`
3. Restart the app. IntentFlow adds `redirect_uri` to `/link/token/create` **only when `PLAID_ENV=production`** and `PLAID_REDIRECT_URI` is set. Use **production** Client ID and Secret with `PLAID_ENV=production`.

## 3. Webhook relay (HTTPS + JWT verification)

The desktop app **cannot** receive Plaid webhooks. Use a small HTTPS service that:

1. Accepts `POST /plaid/webhook` from Plaid.
2. Verifies the **`Plaid-Verification`** JWT and body hash (see [Plaid webhook verification](https://plaid.com/docs/api/webhooks/webhook-verification/)).
3. Exposes `GET /pending?userId=…` for the app to poll (same contract as the example stub).

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

Optional:

| Variable | Purpose |
|----------|---------|
| `PLAID_RELAY_SKIP_JWT_VERIFY` | `true` only for local mocks—**never** in production |

### Plaid Dashboard webhook URL

Set **Team webhooks** (or item-level if you use that) to:

`https://your-relay-host.example/plaid/webhook`

Use TLS (Let’s Encrypt, managed cert on Fly/Railway/Render, etc.).

### Desktop app

Set:

- `PLAID_WEBHOOK_RELAY_URL=https://your-relay-host.example`
- `PLAID_WEBHOOK_RELAY_API_KEY=<same as RELAY_API_KEY>` if you enabled auth on `/pending`

The main process polls `GET {PLAID_WEBHOOK_RELAY_URL}/pending?userId=…` during sync.

### TLS termination

Terminating TLS at a reverse proxy (Caddy, nginx, load balancer) is fine: forward **`Plaid-Verification`** and raw body unchanged to Node.

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
