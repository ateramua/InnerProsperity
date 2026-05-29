# Plaid webhook relay (production)

The desktop app **cannot** accept Plaid webhooks. This service receives `POST /plaid/webhook`, verifies the **`Plaid-Verification`** JWT, and queues flags for **`GET /pending?userId=…`** (the app polls).

**Security:** Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, and optional `RELAY_API_KEY` only via your host’s secret manager (`fly secrets`, Railway variables, etc.). **Never commit real secrets.**

If a production secret was ever pasted into chat or committed, **rotate it in the Plaid Dashboard** and update all deployments + `plaid.env.json`.

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness (`{"ok":true,"service":"intentflow-plaid-relay"}`) |
| POST | `/plaid/webhook` | Plaid team / item webhooks (preserve raw body + `Plaid-Verification` header) |
| GET | `/pending?userId=…` | App polls and clears queued items (optional `Authorization: Bearer <RELAY_API_KEY>`) |
| POST | `/pending/ack` | App acknowledges successfully processed event ids |
| POST | `/items/register` | Desktop registers `{ itemId, userId }` after connect (webhooks only include `item_id`) |
| POST | `/items/unregister` | Desktop removes mapping on disconnect |

**Plaid Dashboard → Webhooks URL:**

`https://<your-relay-host>/plaid/webhook`

**Desktop app env** (must match relay base, no path):

- `PLAID_WEBHOOK_RELAY_URL=https://<your-relay-host>`
- `PLAID_WEBHOOK_RELAY_API_KEY=<same as RELAY_API_KEY>` if you enabled Bearer auth on `/pending`

**Never set `PLAID_RELAY_SKIP_JWT_VERIFY=true` in production.**

---

## Required server environment

| Variable | Purpose |
|----------|---------|
| `PLAID_CLIENT_ID` | Same as production app |
| `PLAID_SECRET` | **Production** secret (not Sandbox) |
| `PLAID_ENV` | `production` or `development` (development uses production API host) |
| `HOST` | `0.0.0.0` |
| `PORT` | `8787` (or whatever the platform maps internally) |
| `RELAY_API_KEY` or `PLAID_WEBHOOK_RELAY_API_KEY` | Recommended: long random string; protects `GET /pending` |
| `PLAID_WEBHOOK_STORE_PATH` | Optional; defaults to `data/plaid-webhooks.json` |

---

## Durable webhook queue

The relay persists incoming webhooks to **`data/plaid-webhooks.json`** by default so process restarts do not erase pending sync flags. Each record stores a dedupe id (`webhook_id` when Plaid sends one, otherwise a SHA-256 hash of the raw body), `item_id`, user id, webhook code, timestamps, status, and delivery attempts.

Statuses:

- `pending` — ready for the desktop app to poll.
- `delivery_attempted` — returned by `/pending`; if the app does not acknowledge it through `/pending/ack`, it becomes eligible again after `PLAID_WEBHOOK_DELIVERY_RETRY_MS` (default 5 minutes).
- `delivered` — acknowledged by the app after successful processing; recent delivered rows are retained for deduplication.
- `ignored` — webhook did not include enough data for this relay contract.

For production hosts with ephemeral filesystems (including many Render/Railway/Fly setups unless a disk/volume is attached), mount persistent storage and set:

```bash
PLAID_WEBHOOK_STORE_PATH=/data/plaid-webhooks.json
```

On Render, attach a **Persistent Disk** and point `PLAID_WEBHOOK_STORE_PATH` at that disk path. Without persistent disk, this is still better than memory during a single process lifetime, but queued events can disappear when the container is replaced.

Optional tuning:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PLAID_WEBHOOK_DELIVERY_RETRY_MS` | `300000` | Retry `delivery_attempted` events after this many ms if not marked delivered |
| `PLAID_WEBHOOK_MAX_COMPLETED_EVENTS` | `500` | Retain this many delivered events for deduplication |

`GET /health` includes store counts and the store path so you can verify the relay is using the intended persistent location.

---

## Option A — Fly.io

Prereqs: [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/), Docker.

From **`IntentFlow/`** (directory that contains `package.json` for the Electron app):

1. Edit **`fly.plaid-relay.toml`**: set `app = "your-unique-app-name"`.
2. One-time: `fly apps create your-unique-app-name`
3. Set secrets (use **your** production values; never paste them into git):

```bash
fly secrets set \
  --config fly.plaid-relay.toml \
  PLAID_CLIENT_ID="your-production-client-id" \
  PLAID_SECRET="your-production-secret" \
  PLAID_ENV="production" \
  RELAY_API_KEY="$(openssl rand -hex 32)"
```

4. Deploy:

```bash
fly deploy --config fly.plaid-relay.toml
```

After deploy, note `https://<your-app>.fly.dev`.

Smoke test:

```bash
curl -sS "https://<your-app>.fly.dev/health"
```

**Plaid:** set webhook to `https://<your-app>.fly.dev/plaid/webhook`.

**App:** `PLAID_WEBHOOK_RELAY_URL=https://<your-app>.fly.dev` and matching `PLAID_WEBHOOK_RELAY_API_KEY`.

---

## Option B — Docker (any VPS / Railway / Render)

Build context must be **`IntentFlow/`** so paths match the Dockerfile:

```bash
cd IntentFlow
docker build -f deployment/plaid-relay/Dockerfile -t intentflow-plaid-relay .
docker run --rm -p 8787:8787 \
  -e PLAID_CLIENT_ID="…" \
  -e PLAID_SECRET="…" \
  -e PLAID_ENV=production \
  -e RELAY_API_KEY="…" \
  intentflow-plaid-relay
```

Put TLS in front (platform HTTPS or Caddy/nginx) so Plaid hits **`https://…/plaid/webhook`**.

---

## Option C — Run from dev tree (not ideal for prod)

From `IntentFlow/` with `PLAID_*` and `RELAY_API_KEY` in `.env`:

```bash
npm run plaid:relay
```

Use only for local testing; production should use HTTPS on the public URL.

---

## OAuth redirect URL

The hosted **`oauth-callback.html`** (e.g. on Vercel) is **separate** from the relay. Plaid allowlist + `PLAID_REDIRECT_URI` use that HTTPS page; webhooks use **this** relay’s `/plaid/webhook`.
