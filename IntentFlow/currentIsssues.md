Technical Issue Report: IntentFlow Desktop Application
Executive Summary
The IntentFlow desktop application is experiencing critical failures across multiple systems, preventing core functionality including account creation, data persistence, and proper UI rendering. The application is currently unusable in its packaged Electron form due to cascading failures in asset loading, API connectivity, authentication, and database integration.

Critical Issues Requiring Immediate Attention
1. Static Asset Loading Failure (404 Errors)
Observed Behavior:

text
GET http://localhost:3000/login/_next/static/chunks/webpack.js 404 (Not Found)
GET http://localhost:3000/login/_next/static/chunks/main.js 404 (Not Found)
GET http://localhost:3000/login/_next/static/chunks/pages/_app.js 404 (Not Found)
Expected Behavior: Static assets should load from /_next/static/chunks/ (root path), not /login/_next/static/chunks/

Affected Pages: All pages using Next.js routing (/login, /accounts, /admin, /dashboard)

Root Cause: Electron is navigating to routes with a trailing slash or incorrect base path configuration, causing asset resolution to be relative to the route path instead of the root.

Impact: Application fails to load entirely. No React components render. window.electronAPI never becomes available in renderer.

2. Electron Preload API Not Exposed to Renderer
Observed Behavior:

text
❌ electronAPI is not available! Make sure you are running in Electron.
TypeError: Cannot read properties of undefined (reading 'createAccount')
Expected Behavior: window.electronAPI should be available with all methods immediately after page load.

Affected Components: All components using electronAPI (AuthContext, CashAccountsView, PropertyMapView, etc.)

Root Cause: Timing issue where preload script finishes after _app.jsx executes, or contextBridge.exposeInMainWorld is not properly configured.

Impact: Every operation requiring database access fails. Mock mode activates, preventing real data persistence.

3. Mock Mode Overriding Real API Calls
Observed Behavior:

text
🔧 MOCK: createAccount called - waiting for real electronAPI
success: false, error: 'Real electronAPI not loaded yet'
Expected Behavior: Real Electron API should handle all IPC calls directly to SQLite database.

Affected Workflows: Account creation, transaction management, category management, user authentication

Root Cause: _app.jsx contains a mock fallback that activates when real electronAPI is not immediately available. The mock intercepts all calls and prevents them from reaching the real backend.

Impact: No data persists to database. All operations are localStorage-only and disappear on refresh.

4. Database Query Returns Empty Results
Observed Behavior:

text
Accounts result: {success: true, data: Array(0)}
Number of accounts: 0
Expected Behavior: Database should return 6 existing accounts (API Test Account, g, c, a, Checking, Savings)

Affected Components: getAccountsSummary IPC handler, loadAccounts function in CashAccountsView

Root Cause: User ID mismatch (frontend sends userId: 3 but database user ID may be different), or the accounts:getSummary handler is filtering incorrectly.

Impact: Users see empty account lists even though data exists in database.

5. Port Conflict and Mismatch
Observed Behavior:

text
⚠ Port 3000 is in use, trying 3001 instead.
Local: http://localhost:3001
But Electron is hardcoded to http://localhost:3000

Expected Behavior: Both Next.js and Electron should communicate on the same port.

Root Cause: Something else using port 3000 (previous process, Docker container, or other application). Electron not dynamically detecting port.

Impact: Electron cannot connect to Next.js dev server, causing 404 errors and failed asset loading.

6. IPC Handler Registration Issues
Observed Behavior:

text
❌ Failed to load module ../services/payeeService.cjs: Cannot find module
📞 IPC: categoryGroups:getAll called for userId: 2
Expected Behavior: All IPC handlers should register successfully without module loading errors.

Affected Handlers: create-linked-transfer, update-linked-transfer, delete-linked-transfer, payee-related operations

Root Cause: Missing payeeService.cjs module or incorrect path resolution in packaged environment.

Impact: Transfer transactions and payee management will fail.

7. Authentication Flow Broken
Observed Behavior:

text
🔍 Checking auth status...
ℹ️ Running outside Electron; skipping electronAPI auth check
Expected Behavior: AuthContext should detect Electron environment and use real electronAPI.getCurrentUser().

Affected Components: AuthContext, login page, route protection

Root Cause: AuthContext is detecting missing electronAPI and falling back to browser mode.

Impact: Users cannot log in; role-based routing fails; protected routes inaccessible.

8. Missing Methods in electronAPI
Observed Behavior:

text
electronAPI.subscribeToEvent not available
electronAPI.getCategories is not available
electronAPI.getCategoryGroups is not available
Expected Behavior: All methods exposed in preload should be available.

Missing Methods: subscribeToEvent, getCategories, getCategoryGroups, getArchivedCategories, archiveCategory, restoreCategory

Impact: PropertyMapView, AutoAssignView, and category management pages fail to load data.

9. Package.json Script Inconsistency
Observed Behavior: Electron not opening automatically when running npm run dev

Expected Behavior: Concurrently should start Next.js and Electron simultaneously.

Root Cause: wait-on http://localhost:3000 condition failing due to port mismatch or timing.

Impact: Developer must manually launch Electron, slowing debugging and testing.

Affected Components Summary
Component	Issue	Severity
CashAccountsView	Cannot create or view accounts	🔴 CRITICAL
AuthContext	Authentication fails, redirects broken	🔴 CRITICAL
Electron Main Process	Asset loading, port detection, IPC handlers	🔴 CRITICAL
Preload Script	API not exposed to renderer	🔴 CRITICAL
PropertyMapView	Categories missing, no data loading	🟠 HIGH
Category Management	Cannot load groups or categories	🟠 HIGH
Transaction System	Transfer creation may fail due to missing payeeService	🟠 HIGH
Settings Page	Backup/restore not tested but likely broken	🟡 MEDIUM
Expected Behavior vs Actual Behavior
Workflow	Expected	Actual
Launch app	Loads accounts from database	Shows 0 accounts, 404 errors
Create account	Saves to SQLite, appears in UI	Mock saves to localStorage, never persists
View accounts	Shows 6 existing accounts	Empty list
Authentication	Detects Electron, gets current user	Falls back to browser mock
Page navigation	Smooth client-side routing	Asset 404s, broken navigation
Category data	Loads from database	Methods missing, no data
Root Causes Summary
Timing Issue: _app.jsx executes before preload script finishes exposing electronAPI

Asset Path Issue: Next.js basePath or assetPrefix misconfigured, or Electron navigation adds trailing slash

Port Detection: Hardcoded port 3000 fails when port is busy

Missing Module: payeeService.cjs not found in packaged build

User ID Mismatch: Frontend sending userId: 3 but database expects different user ID

Mock Interception: Mock fallback in _app.jsx activates and blocks real API calls

Required Fixes (Production-Ready)
Priority 1 (Critical)
Fix static asset loading - Update next.config.js with correct assetPrefix and basePath

Ensure electronAPI is available - Add ready signal from preload, wait for it in _app.jsx

Remove mock interference - Condition mock only when running in Chrome, not Electron

Fix port detection - Make Electron use dynamic port from Next.js or kill existing process

Priority 2 (High)
Fix database queries - Verify user ID matching, fix getAccountsSummary handler

Complete IPC handlers - Add missing methods (getCategories, getCategoryGroups, etc.)

Fix payeeService module - Ensure module is included in build or create fallback

Priority 3 (Medium)
Fix navigation routing - Remove trailing slash issues in Electron navigation

Update package.json scripts - Ensure Electron launches reliably with Next.js

Testing Requirements After Fixes
App launches without 404 errors

window.electronAPI has all methods available

No mock messages appear in console (only real API)

Database shows 6+ existing accounts in UI

New account saves to SQLite and persists after restart

Account numbers and routing numbers save correctly

Authentication works with real database

Category groups and categories load from database

All IPC handlers register without errors

Transfer transactions work

Settings page backup/restore functions (if implemented)

Architectural Notes
The IntentFlow application follows this architecture:

text
React UI (Renderer)
    ↓ (IPC via window.electronAPI)
Electron Preload (contextBridge)
    ↓ (ipcRenderer.invoke)
Electron Main Process (ipcMain.handle)
    ↓ (SQLite3)
Database (app.db)
The main break points are:

Preload → Renderer communication (API not exposed)

Main Process IPC handlers (some missing)

Database queries (user ID mismatch)

Assignment for Developer
You are required to:

Analyze the entire codebase holistically, not just the reported issues

Identify all hidden issues in the Electron IPC layer, preload script, Next.js configuration, and database layer

Fix all critical issues identified above with production-ready solutions (no temporary patches)

Verify all pages (Accounts, Admin, Dashboard, PropertyMap, Settings) function correctly after fixes

Test account creation, editing, deletion, and persistence across app restarts

Ensure no mock code runs in Electron environment

Document any additional issues discovered and how they were resolved

The goal is a fully stable, production-ready desktop application with complete offline-first data persistence.

