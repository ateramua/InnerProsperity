# Practical: Plaid allowed redirect URI for IntentFlow

Plaid needs an **HTTPS URL you host** on the **allowlist** in the Dashboard. That **exact** string is **`PLAID_REDIRECT_URI`** in `.env` or `plaid.env.json`.

**Rules (Plaid):**

- Production: **HTTPS only** (Sandbox allows `http://localhost` for testing).
- **No custom URL schemes** (`intentflow://…` is not allowed as `redirect_uri`).
- **Do not** add your own query parameters to the URI you send in `/link/token/create`. Plaid will append `?oauth_state_id=…` when it redirects the user’s browser.

**What IntentFlow does:** when `PLAID_ENV=production` and `PLAID_REDIRECT_URI` is set, the main process includes that URL in the Link token payload (`redirect_uri`). It must match the Dashboard allowlist **character for character** (path, trailing slash, `https`).

---

## Step 1 — Pick the final URL (before you deploy)

Choose **one** canonical URL. Examples:

| Good | Notes |
|------|--------|
| `https://oauth.intentflow.com/plaid/callback` | Dedicated subdomain |
| `https://www.yourdomain.com/plaid-oauth-callback.html` | Single file |

Decide **now** whether the path ends with `/` or not — it must stay the same everywhere.

Copy that string into a scratch note; you’ll paste it into the Dashboard and into `PLAID_REDIRECT_URI`.

---

## Step 2 — Host `oauth-callback.html` at that URL

This folder contains **`oauth-callback.html`**. Your deployed URL must **serve this file** at the path you chose (or rename to match).

**Easiest free options with HTTPS:**

### A) Cloudflare Pages

1. Create a Git repo (or use this monorepo) with `deployment/plaid-oauth-redirect/oauth-callback.html` at repo root **or** set build output to this folder’s contents.
2. [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → Create → Pages → Connect Git (or Upload assets).
3. If using “Upload”: zip **only** `oauth-callback.html` (optional: rename to `index.html` if you want the apex path `/` to serve it).
4. Assign a hostname, e.g. `oauth.yourdomain.com`.
5. After deploy, confirm in a browser: `https://oauth.yourdomain.com/plaid/callback` (or whatever path you used) loads the page.

### B) GitHub Pages

1. Put `oauth-callback.html` in the published site (e.g. `docs/` folder on `gh-pages` branch, or a small dedicated repo).
2. Enable Pages in repo **Settings → Pages**.
3. Your file might be at `https://<user>.github.io/<repo>/oauth-callback.html` — use **that full URL** as your allowlist entry and `PLAID_REDIRECT_URI`.

### C) Any static host

Netlify Drop, S3 + CloudFront, nginx on a VPS — any **HTTPS** URL that returns this HTML is fine.

---

## Step 3 — Plaid Dashboard allowlist

1. Open [Plaid Dashboard](https://dashboard.plaid.com/) → **Team settings** → **API** (or **Developers → API**).
2. Find **Allowed redirect URIs**.
3. Click **Add** and paste the **exact** URL from Step 1 (the one that now loads your HTML), e.g.  
   `https://oauth.intentflow.com/plaid/callback`  
   **Do not** append `?oauth_state_id=…` here — only the base URL Plaid will redirect to.

Save.

---

## Step 4 — IntentFlow config

In **`plaid.env.json`** (packaged) or **`IntentFlow/.env`** (dev):

```json
"PLAID_REDIRECT_URI": "https://oauth.intentflow.com/plaid/callback"
```

Same string as the Dashboard. Restart the app.

---

## Step 5 — Electron / desktop reality check

Plaid’s docs distinguish:

- **Desktop web (popup OAuth):** often works **without** you doing anything special on the redirect page; the popup may complete Link in the parent context.
- **Embedded / webview-style flows:** may need **Link reinitialization** on the redirect page with the **same** `link_token` and `receivedRedirectUri: window.location.href` (see [Plaid OAuth](https://plaid.com/docs/link/oauth/)).

IntentFlow today initializes Link inside the app and does **not** pass `receivedRedirectUri`. For many banks, the **minimal hosted page** (close tab + return to app) combined with **`PLAID_REDIRECT_URI` set for production token creation** is enough.

If OAuth **stuck after bank login** for some institutions:

1. Confirm allowlist URL and `PLAID_REDIRECT_URI` match exactly.
2. Consider a **small backend** that stores `link_token` keyed by user before opening Link and serves it on the redirect page for reinitialization (Plaid describes this pattern in their OAuth docs for cross-session / webview cases).

The included HTML has an **optional** (commented) reinitialization block you can enable if you serve Link from the **same site** as the callback (typical web app, not Electron).

---

## Sandbox quick test

Plaid allows **HTTP localhost** redirect URIs in Sandbox only. You can register e.g. `http://localhost:5500/oauth-callback.html`, serve the file locally (`npx serve` / VS Code Live Server), and point Sandbox `PLAID_REDIRECT_URI` there to practice the Dashboard + env steps before buying a domain.
