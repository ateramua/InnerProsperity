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
| `PLAID_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | `8787` (or whatever the platform maps internally) |
| `RELAY_API_KEY` or `PLAID_WEBHOOK_RELAY_API_KEY` | Recommended: long random string; protects `GET /pending` |

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
