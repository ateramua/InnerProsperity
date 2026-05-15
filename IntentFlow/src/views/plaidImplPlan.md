IntentFlow: unified Plaid + manual accounts strategy
This plan unifies Linked Banks (Plaid) with manual account flows (CashAccountsView, CreditCardManager, LoanManager, Sidebar “Add Credit Card” / “Add Loan”, accounts/index.jsx, ViewContainer). It is based on the current codebase: one shared accounts table, a plaid_accounts bridge, and type-based views that already can show Plaid-created rows—but several gaps prevent a seamless experience.

1. Design principle: one ledger, two origins
                    ┌─────────────────────────────────────┐
                    │           accounts (canonical)       │
                    │  id, user_id, type, balance, ...       │
                    └──────────────▲──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
     manual create          plaid_accounts         transactions
  (UI forms / IPC)          (bridge table)      (manual + plaid_tx_id)
              │                    │
              │              plaid_items
              │              (item + encrypted token)
              │
    CashAccountsView      LinkedBanksView
    CreditCardManager     (connect / sync / reconnect)
    LoanManager
    Sidebar modals
Rule: Every spendable/registerable account is a row in accounts. Plaid never replaces that model; it feeds it.

Origin	How created	Transactions	Balance authority
Manual
accounts:create via forms
User-entered + rules
User + cleared transaction math
Plaid-linked
syncPlaidAccounts after Link
transactionsSync + plaid_transaction_id
Plaid balance on sync + transaction-derived working/cleared
Manual and Plaid accounts coexist in the same views today because views filter getAccountsSummary by type (checking/savings/credit/loan). No separate “Plaid-only” list is required—but metadata, conventions, and refresh behavior must be aligned.

2. Current state (completed vs partial vs missing)
2.1 Completed Plaid functionality
Area	Status
Plaid Link (CDN + link_token)
Done — LinkedBanksView.jsx
Public token exchange + encrypted storage
Done — encryptToken / safeStorage in index.cjs
Update Link (reconnect)
Done — createUpdateLinkToken
DB: plaid_items, plaid_accounts, plaid_category_mappings
Done — initSchema.cjs
Account import on link
Done — creates accounts + plaid_accounts
transactionsSync + cursor
Done
Category mapping modal (post-sync)
Done
Background hourly sync
Done — autoSyncEnabled user setting
IPC surface
Done — preload.cjs
Navigation
Done — Sidebar → linked-banks → ViewContainer
2.2 Partial / broken integration with manual flows
Issue	Impact
Plaid inserts minimal accounts rows (no account_type_category, no credit/loan fields)
Credit/loan dashboards under-feature Plaid cards
Plaid balance not negated for liabilities; manual Sidebar uses negative for credit/loan
Wrong signs vs budget math (monthlyBudgetService: outflows negative)
Plaid transaction amounts stored as Plaid sends them (positive = outflow)
Budget/activity totals wrong for linked txns
syncPlaidAccounts only creates new Plaid accounts; never updates balances/names
Stale balances in Cash/Credit/Loan views
institution set to official_name (account name), not institution
Misleading labels
No accounts-updated after Plaid sync
Cash/Credit/Loan views don’t refresh after Link
Sidebar accounts.credit / accounts.loans are hardcoded []
Sidebar never lists linked or manual accounts under Credit/Loans
getLinkedItems returns SELECT * (includes access_token)
Security risk in renderer
Remove bank: no itemRemove, orphans accounts + transactions
UX lie + Plaid billing + duplicate risk on re-link
No duplicate detection / merge
User can manual-add “Chase Visa” then Link same card → two accounts
No “Plaid-linked” badge or edit policy
User may edit fields that sync will overwrite
2.3 Missing for production-grade unified product
Account provenance columns (source, plaid_account_id on accounts or join always required)
Link existing manual account (merge) flow
Account selection in Plaid Link (account_filters)
Liabilities product for APR/limit/due date on credit/loans
Webhook path (or robust focus/interval sync)
Reconciliation rules for Plaid (is_cleared / pending)
Settings UI for Plaid + auto-sync
Tests, .env.example, centralized PlaidService
Migration for existing manual + Plaid data
3. How manual and Plaid accounts should coexist
3.1 Recommended account model
Extend accounts (or always join plaid_accounts):

-- Proposed additions to accounts
source TEXT NOT NULL DEFAULT 'manual'  -- 'manual' | 'plaid'
sync_enabled INTEGER DEFAULT 1         -- 0 = manual-only mode for hybrid
last_balance_sync_at DATETIME
external_mask TEXT                     -- e.g. Plaid mask •••• 1234
Keep plaid_accounts as the technical bridge (plaid_account_id, item_id, Plaid type/subtype).

Display name: {institution_name} •••• {mask} when Plaid-linked; manual keeps user-chosen name.

3.2 View behavior (target)
View	Manual accounts	Plaid-linked accounts
CashAccountsView
Full add/edit/delete
Show with 🔗 badge; edit limited (notes only); balance read-only or “synced from bank”
CreditCardManager
Add via form / Sidebar
Auto-appear after Link; populate limit/APR when Liabilities enabled
LoanManager
Add via form / Sidebar
Auto-appear for type=loan from Plaid
AllAccountsView / accounts dashboard
Unchanged
Group under institution; show link status
Account detail
Full txn CRUD
Plaid txns: edit category/memo, not amount/date (or warn)
Linked Banks
CTA: “Connect bank” + list items
Per-item: accounts, sync, reconnect, disconnect
3.3 Should Plaid accounts auto-populate existing views?
Yes — that is already the right architecture. After Link + syncPlaidAccounts, rows exist in accounts with type set. Required fixes:

Normalize balance sign and account_type_category on import.
Update existing Plaid-linked rows on each account sync (balance, name, mask).
Dispatch accounts-updated (and optional plaid-sync-complete) after connect/sync.
Fix Sidebar to load accounts from getAccountsSummary (not empty arrays).
Enrich credit/loan fields from Plaid Liabilities when available.
No parallel “Plaid credit card list” is needed unless you want Linked Banks to be the only entry point—in that case still use the same accounts rows.

4. Account linking lifecycle (end-to-end)
User creates account manually
User opens Linked Banks
createLinkToken
Plaid Link UI
exchangePublicToken
syncPlaidAccounts
syncTransactionsForItem
Category mapping (if needed)
Appears in Cash/Credit/Loan views
ITEM_LOGIN_REQUIRED
update link token
User removes bank
Plaid itemRemove
Policy-based delete/keep
User links bank with similar account
Link plaid_accounts to existing account id
ManualOnly
LinkStart
LinkToken
PlaidLink
Exchange
ImportAccounts
ImportTxns
Mapped
Active
NeedsReconnect
Disconnect
ItemRemove
LocalCleanup
MergeOffer
4.1 Connect (new item)
link/token/create (transactions; later liabilities for cards/loans).
Plaid Link success → item/public_token/exchange.
Upsert plaid_items (encrypted token, institution).
syncPlaidAccounts — create or update internal accounts.
syncTransactionsForItem — cursor sync.
Emit accounts-updated + refresh Sidebar.
4.2 Reconnect
Update-mode link token (already implemented).
On success: refresh token, set status = active, run account + transaction sync.
4.3 Disconnect (policy-driven)
Recommended UX (checkboxes):

Remove connection from Plaid (/item/remove).
Delete imported transactions? (default: keep history, stop sync)
Deactivate or delete internal accounts? (default: deactivate, source cleared)
Implementation: transactional DB cleanup + itemRemove.

4.4 Merge manual → Plaid (duplicate prevention)
When syncPlaidAccounts sees a new Plaid account:

Compute fingerprint: hash(institution_id + mask + type + subtype) per user.
Match existing manual accounts with same fingerprint (or fuzzy name + mask).
If match: attach plaid_accounts.account_id to existing row; do not insert new accounts.
If no match: create new account with source = 'plaid'.
Offer UI in Linked Banks: “We found an existing account ‘Chase Checking •••• 4567’ — link to it?”

5. Sync and reconciliation
5.1 Balance sync
Account type	Manual	Plaid-linked
Checking/savings
From transactions + user adjustments
accountsGet → update balance / working_balance; optional: don’t overwrite if user locked
Credit
User-entered negative balance
Plaid credit balance (normalize sign) + Liabilities for limit
Loan
User-entered
Plaid loan balance + Liabilities for payment/APR
After transaction sync, keep calling updateAccountBalances (already done) and apply Plaid-reported current balance where source = 'plaid'.

5.2 Transaction sync
Continue /transactions/sync with cursor on plaid_items.
Amount transform: storedAmount = -plaidTx.amount (align with app convention).
Pending: is_cleared = 0 while pending; update on modified.
Removed: soft-delete or hard-delete per policy (recommend soft-delete flag).
Transfers: detect Plaid transfer category / counterpart; set is_transfer when rules match.
5.3 Reconciliation (manual process + Plaid)
Existing startReconciliation in accountService.cjs compares statement balance to calculated cleared balance.

Plaid-linked policy:

Cleared = posted (non-pending) Plaid transactions.
Reconciliation UI shows: “Bank balance (Plaid): $X” vs “Register cleared: $Y”.
Allow reconcile to statement even when Plaid sync lags (user confirms date).
Do not auto-reconcile solely from Plaid without user action (audit trail).
6. Duplicate prevention (detailed)
Layer	Mechanism
DB
UNIQUE(plaid_account_id) on plaid_accounts; UNIQUE(plaid_transaction_id) on transactions
Item
One plaid_items.id per Plaid Item; re-link same institution updates token, not duplicate item if same item_id
Account
Fingerprint match before INSERT; merge UI
UX
In Cash/Credit/Loan “Add” flows: if user has Plaid item for institution, show “Connect via Linked Banks instead”
Sidebar
Don’t create manual credit card with same mask as existing Plaid account (client-side warning)
7. Ownership and institution metadata
Field	Storage	Notes
User ownership
accounts.user_id, plaid_items.user_id
Enforce on every Plaid IPC handler
Institution (display)
plaid_items.institution_name, plaid_items.institution_id
Propagate to accounts.institution on sync
Plaid account id
plaid_accounts.plaid_account_id
Stable external key
Mask
plaid_accounts.mask → accounts.external_mask
Shown in UI
Item health
plaid_items.status, last_error
Drives reconnect banner everywhere
Never expose access_token to renderer; return DTOs from getLinkedItems.

8. Frontend architecture updates
8.1 New / refactored modules
src/
  services/plaid/
    plaidService.cjs          # Single Plaid client, all API calls
    plaidAccountSync.cjs      # Import/update accounts, fingerprint merge
    plaidTransactionSync.cjs # Cursor sync, amount transform
    plaidTypes.js             # Shared constants / error codes
  hooks/
    useAccounts.js            # getAccountsSummary + accounts-updated
    usePlaidItems.js            # linked items + status
  contexts/
    AccountsContext.jsx         # Optional: single cache for Sidebar + views
8.2 Event contract
// After any Plaid or manual account mutation
window.dispatchEvent(new CustomEvent('accounts-updated', { detail: { source: 'plaid' | 'manual' } }));
Emit from:

plaid-exchange-public-token success
plaid-sync-item / plaid-sync-transactions success
Background sync (throttled)
accounts:create / update / delete
8.3 Per-surface changes
File	Changes
LinkedBanksView.jsx
Remove stray spinner; show child accounts per item; link to account detail; merge modal; settings link
CashAccountsView.jsx
Plaid badge; disable balance edit if source=plaid; “Connect bank” empty state
CreditCardManager.jsx
Same; map Plaid liabilities fields
LoanManager.jsx
Same
Sidebar.jsx
useEffect load getAccountsSummary → populate credit/loans; listen accounts-updated
ViewContainer.jsx
On linked-banks mount optional prefetch; ensure Plaid connect refreshes loans/cards
AccountDetailView
Show sync status, last sync, reconnect CTA if item unhealthy
settings.jsx
Auto-sync toggle, Plaid env status (dev), privacy link
8.4 Manual add flows (keep, but gate)
Do not remove manual add from Cash/Credit/Loan/Sidebar.
Add copy: “Already connected via Linked Banks?”
Block or warn duplicate masks/names.
For source=plaid accounts, route “Edit” to limited modal.
9. Backend API requirements (IPC)
Existing (keep, harden)
Channel	Hardening
plaid-create-link-token
Validate user; optional products, account_filters
plaid-create-update-link-token
Verify item.user_id
plaid-exchange-public-token
Merge logic; emit event
plaid-get-linked-items
Return safe DTO only
plaid-sync-item
Update accounts + emit event
plaid-sync-transactions
Amount transform; user check
plaid-remove-item
itemRemove + cleanup policy
plaid-save-category-mapping
OK
New handlers
Channel	Purpose
plaid-get-config-status
{ configured, env } for UI
plaid-get-item-accounts
Accounts for one item (with masks, internal ids)
plaid-get-category-mappings
List mappings for settings UI
plaid-link-account-to-plaid
Merge manual account id + plaid_account_id
plaid-unlink-account
Detach Plaid from account without removing item
accounts:create
Reject duplicate fingerprint (optional)
Centralize Plaid client in plaidService.cjs; index.cjs handlers become thin.

10. Database schema changes
-- accounts
ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE accounts ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE accounts ADD COLUMN external_mask TEXT;
ALTER TABLE accounts ADD COLUMN last_balance_sync_at DATETIME;
-- plaid_items
ALTER TABLE plaid_items ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE plaid_items ADD COLUMN last_error TEXT;
ALTER TABLE plaid_items ADD COLUMN consent_expires_at DATETIME;
-- plaid_accounts  
ALTER TABLE plaid_accounts ADD COLUMN fingerprint TEXT;
CREATE UNIQUE INDEX idx_plaid_accounts_item_plaid ON plaid_accounts(item_id, plaid_account_id);
-- transactions (optional)
ALTER TABLE transactions ADD COLUMN source TEXT DEFAULT 'manual';
ALTER TABLE transactions ADD COLUMN deleted_at DATETIME;
-- sync audit (optional)
CREATE TABLE plaid_sync_runs (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  started_at DATETIME,
  finished_at DATETIME,
  added INTEGER, modified INTEGER, removed INTEGER,
  error TEXT
);
Migration script:

Set source = 'plaid' where id IN (SELECT account_id FROM plaid_accounts).
Negate amounts on transactions with plaid_transaction_id (one-time).
Normalize credit/loan balances for Plaid-linked liability accounts.
11. Transaction synchronization flow (canonical)
1. User: Connect / Sync / Background timer
2. syncPlaidAccounts(itemId)
   - accountsGet
   - FOR each Plaid account:
       - match fingerprint OR create/update accounts row
       - upsert plaid_accounts
       - update balance (normalized sign)
3. syncTransactionsForItem(itemId)
   - LOOP transactionsSync(cursor)
   - FOR added/modified/removed:
       - map account via plaid_accounts
       - map category via plaid_category_mappings (PFC primary key)
       - amount = -plaidTx.amount
       - upsert by plaid_transaction_id
   - save cursor
   - updateAccountBalances per touched account
4. Emit accounts-updated
5. UI: Cash / Credit / Loan / Sidebar refresh
12. OAuth and token handling
Topic	Plan
Storage
Main process only; safeStorage required in production builds
Rotation
Update token on re-exchange; same item_id row
OAuth institutions
Production link/token/create with redirect_uri per Plaid dashboard
Desktop
Link handles OAuth in embedded flow; no custom OAuth UI needed for MVP
Multi-user
client_user_id = app user id (already)
13. Webhook processing
Desktop cannot host webhooks directly.

Phase 1 (MVP): Polling — hourly background + sync on app focus + manual “Sync now”.

Phase 2: Lightweight relay (Cloudflare Worker / Lambda):

Receives Plaid webhooks, verifies JWT
Stores item_id + sync_required in queue/DB
Desktop polls GET /sync-flags?userId= or receives push (optional)
Handle: SYNC_UPDATES_AVAILABLE, ITEM_LOGIN_REQUIRED, PENDING_EXPIRATION.

14. Account categorization logic
Stage	Logic
Import
Map personal_finance_category.primary (and detailed) → plaid_category_mappings
Legacy
Fallback: category.join(' > ') if array
Unmapped
Queue in modal; store mapping
Re-apply
On mapping save, UPDATE transactions SET category_id = ? WHERE plaid category matches
Rules (future)
Payee contains → category (before Plaid default)
Credit card payments / transfers: use Plaid transaction_code / PFC transfer types to set is_transfer.

15. Migration strategy (existing manual accounts)
Inventory: All accounts without plaid_accounts → source = 'manual'.
Linked: Backfill source = 'plaid' from join.
Balances: Script to fix sign on liability accounts (manual and Plaid) per product decision document.
Transactions: One-time negate Plaid-imported amounts.
Duplicates: Optional admin script: find pairs (same user, similar name, same mask) → report for manual merge.
No forced Plaid: Manual accounts continue working unchanged.
16. UX/UI recommendations
Global connection health — small indicator in Sidebar footer if any item login_required.
Unified empty states — Cash: “Add manually” + “Connect bank (Linked Banks)”.
Account card badges — Manual | Bank-linked + institution logo (later).
Sync feedback — progress bar during long transactionsSync pagination.
Disconnect clarity — explain what is deleted vs kept.
Replace alert() with toasts in Linked Banks and add flows.
Account picker in Link — Plaid Link account_selection so user doesn’t import unwanted accounts.
Deep links — From Credit card row → “Manage connection” → Linked Banks item.
17. Security and compliance
Tokens only in main process; encrypted at rest.
IPC authorization on every itemId / accountId.
No secrets in renderer or Next static bundle.
Log redaction (no tokens, no full account numbers).
Plaid compliance: privacy policy, data use disclosure in Link flow.
itemRemove on disconnect.
Data retention documented; export path for user data (existing backup features).
18. Testing strategy
Layer	Cases
Unit
Amount negation; fingerprint; category key extraction
Integration
Mock Plaid: link → 2 accounts → sync → appear in getAccountsSummary filtered by type
Integration
Merge manual + Plaid same mask → one account
Integration
Disconnect → itemRemove called, transactions policy
Manual E2E
Sandbox: Link → Cash view shows checking; Credit shows card; sync txns → budget activity
Regression
Manual add still works; Sidebar lists accounts after fix
Security
getLinkedItems payload has no access_token
19. Deployment strategy
**Runbook:** [`IntentFlow/docs/plaid-production-deploy.md`](../../docs/plaid-production-deploy.md) — OAuth redirects, `plaid.env.json`, production webhook relay with JWT verification (`npm run plaid:relay`), and dashboard URLs.

Document PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV in .env.example at repo root / IntentFlow/.
Packaged app: load env from userData config or build-time injection (never commit secrets).
Plaid Dashboard: OAuth redirect URIs for production (must match `PLAID_REDIRECT_URI` exactly).
Separate sandbox vs production keys.
Feature flag: PLAID_ENABLED to hide Linked Banks when unset.
20. Prioritized implementation roadmap
Phase 0 — Foundation (week 1) BLOCKERS
Central plaidService.cjs + env validation.
Fix transaction amount sign + migration.
Fix liability balance sign on Plaid import (align with manual Sidebar logic).
Safe getLinkedItems DTO; IPC user ownership checks.
itemRemove + honest disconnect cleanup options.
Emit accounts-updated after all Plaid sync paths.
Fix Sidebar account loading from getAccountsSummary.
Phase 1 — Unified account sync (week 2)
syncPlaidAccounts update path (balances, names, masks).
Schema: source, status, last_error, fingerprint.
Set account_type_category on Plaid import (budget / credit / loan).
Plaid badges + read-only balance in Cash/Credit/Loan for linked accounts.
Category mapping: PFC + getCategoryMappings IPC + settings UI.
Phase 2 — Duplicate prevention & merge (week 3)
Fingerprint matching on import.
Merge UI (manual ↔ Plaid).
Warnings on manual add when similar account exists.
plaid-get-item-accounts + Linked Banks account list UI.
Phase 3 — Reliability & enrichment (week 4)
Add Liabilities product for credit/loan fields.
Reconciliation UI hints for Plaid balances.
Transfer detection; soft-delete removed txns.
Settings: auto-sync toggle (wire existing autoSyncEnabled).
plaid_sync_runs audit log.
Phase 4 — Production (week 5+)
Webhook relay + focus sync.
OAuth production config.
Automated tests in CI.
Compliance copy + documentation.
21. Direct answers to your questions
Question	Answer
How should manual and Plaid accounts coexist?
Same accounts table; source distinguishes; Plaid feeds sync, manual feeds full control.
Should Plaid cards/loans/cash auto-populate existing views?
Yes, by type filter—already designed; fix metadata, signs, refresh events, Sidebar loading.
Sync & reconciliation?
Plaid = automated txn + balance feed; reconciliation = user statement vs cleared register, with Plaid balance shown as reference.
Duplicate prevention?
DB uniqueness + fingerprint merge + UX warnings on manual add.
Ownership & institution metadata?
user_id on all rows; institution on plaid_items synced to accounts.institution; mask on bridge table.
How should UI evolve?
Linked Banks = connection hub; Cash/Credit/Loan = operational views for all accounts with badges and edit policies; Sidebar lists all accounts dynamically.
22. Summary
The app uses a unified ledger: Plaid writes to `accounts`, and Cash/Credit/Loan views read by type with `source` distinguishing manual vs bank-linked rows.

23. Implementation status (complete in codebase)
| Phase | Status |
|-------|--------|
| 0 Foundation | Done — plaidService, signs, safe DTOs, itemRemove, accounts-updated |
| 1 Unified sync | Done — badges, read-only linked accounts, category mapping, Sidebar load |
| 2 Duplicates | Done — fingerprint, merge UI, manual-add warnings, server duplicate guard |
| 3 Reliability | Done — liabilities, transfers, soft-delete, reconcile hints, sync audit |
| 4 Production (in-app) | Done — Link account_selection, focus sync, webhook poll, CI tests, toasts |
| 4 Product gaps (May 2026) | Done — category re-apply, consent expiry UX, unlink UI, accounts dashboard grouping, balance lock, sync toggle, duplicate report script |
| 4 Production (ops) | You — host HTTPS relay (`plaid-webhook-relay.cjs`), Plaid webhook URL, Dashboard OAuth URIs, `plaid.env.json`; see **`docs/plaid-production-deploy.md`** |

**Commands:** `npm run test:plaid` · `npm run plaid:relay` (JWT webhook relay) · `npm run plaid:relay-example` (stub) · `npm run plaid:report-duplicates`

**Packaged Plaid keys:** copy `IntentFlow/plaid.env.example.json` → `~/Library/Application Support/IntentFlow/plaid.env.json`