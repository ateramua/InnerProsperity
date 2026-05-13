Feature Development Instruction: Offline Encrypted Backup & Restore for IntentFlow
Combined with Debug, Fix, and Feature Audit Tasks
Document Purpose
This document provides a comprehensive development instruction for the IntentFlow application — a macOS/Windows Electron desktop app built with Next.js and TypeScript. The instruction covers three interrelated areas:

Debugging and fixing critical production issues (broken backup button, static file loading errors, UI scroll failure)

Auditing the existing database import/export system (locating, verifying, and correcting current implementation)

Implementing the complete offline encrypted database backup and restore system (as specified in prior requirements)

All work must be production-safe, maintain backward compatibility, and function correctly in packaged Electron .app (macOS) and .exe (Windows) builds.

Part 0: Context & Assumptions
Cleanup Already Performed (Do Not Repeat Unless Necessary)
The following cleanup commands have been executed previously:

bash
rm -rf .next out release dist build
rm -rf ~/Library/Caches/electron*
rm -rf ~/Library/Caches/electron-builder*
rm -rf node_modules package-lock.json
Assumptions for the developer:

Full build cache has been cleared

App has been rebuilt from scratch

Electron packaging may currently be inconsistent or broken

You are working from a clean but potentially broken state

IntentFlow is a money management application with offline-first principles

A Settings page exists and is accessible before and after login

The application uses a local SQLite database (app.db) as its primary data store

Critical Constraints
Constraint	Requirement
Data safety	❌ Do NOT break existing financial data
File safety	❌ Do NOT delete or overwrite user database files without confirmation/rollback
Compatibility	✅ Maintain backward compatibility with existing database schemas
Build stability	✅ Must remain stable in packaged Electron build
ASAR integrity	✅ Must not break app.asar structure
No cloud	✅ Zero-cloud, offline-only operation
Part 1: Issue Analysis & Root Cause Identification
Issue 1: Backup Button Confusion + Non-Working Function
Problem Statement:

There is a "Backup" button in the IntentFlow UI, but:

User is unclear what it does

It may be intended for database export/backup

Current functionality is broken or unreliable

Root Cause Analysis Required (to be completed by developer):

Investigation Area	Questions to Answer
Button location	Where exactly in the UI does this button appear? (Settings page? Navigation bar? Separate page?)
Current wiring	What event handler or IPC call is currently bound to this button?
Intended behavior	Was this meant for database export, app state backup, or full data snapshot?
Broken since when	Did it ever work? If yes, what change broke it?
Error messages	Are there console errors when clicking the button?
Expected Outcome of Analysis:

A clear report identifying:

The current purpose of the existing "Backup" button

Why it is broken (missing handler, incorrect IPC channel, encryption failure, file permission issue, etc.)

Whether it can be repurposed or must be replaced

Issue 2: Electron + Next.js Static File Loading Errors (CRITICAL)
Observed Error:

text
GET file:///Applications/IntentFlow.app/Contents/Resources/app.asar/out/settings/_next/static/chunks/main-xxxx.js net::ERR_FILE_NOT_FOUND
GET .../_buildManifest.js net::ERR_FILE_NOT_FOUND
GET .../_ssgManifest.js net::ERR_FILE_NOT_FOUND
Root Cause Analysis Required:

Investigation Area	Questions to Answer
Broken asset resolution	Why are static assets failing to resolve inside app.asar?
Next.js export structure	Is the /out/settings directory structure correct? Does _next exist at the expected path?
Build process	Is the app using next build + next export correctly? Or should it use next export exclusively?
Electron routing	Is BrowserWindow.loadFile() or loadURL() pointing to the correct entry point?
Protocol handling	Is the file:// protocol being used correctly for production?
Likely Fix Areas (to be investigated):

next.config.js — assetPrefix, basePath, output: 'export' configuration

Electron BrowserWindow — loadFile() vs loadURL() with file:// protocol

Build scripts — order of operations: next build → next export → Electron builder

Path resolution — use of app.getAppPath() vs relative paths

Issue 3: UI Scroll Failure (CRITICAL UX Bug)
Problem Statement:

User cannot scroll vertically or horizontally on the landing/home page.

Root Cause Analysis Required:

Investigation Area	Questions to Answer
CSS overflow rules	Is overflow: hidden, overflow-x: hidden, or overflow-y: hidden applied anywhere globally?
Container constraints	Are flex or grid containers preventing scroll propagation?
Viewport issues	Is 100vh behaving incorrectly in Electron on macOS?
Event interception	Are parent containers intercepting scroll events?
Expected Fix:

Ensure the following CSS is applied globally (or equivalent fix based on root cause):

css
html, body {
  overflow: auto;
  height: 100%;
}

#root {
  overflow: auto;
}
Part 2: Feature Audit — Existing Database Import/Export System
Audit Requirements
Before implementing any new backup/restore features, you must locate and document the existing implementation.

Locate and report:

Item	What to Find
Import/export logic	Which files currently handle database creation, backup/export, and restore/import?
IPC communication	What IPC channels are registered in the main process for backup operations?
Renderer-side API	What methods are exposed via the preload bridge (e.g., window.database.export(), window.database.import())?
Settings UI integration	Which buttons or components currently trigger backup/restore actions?
Encryption implementation	Is there any encryption currently applied to backups? If yes, which algorithm and key derivation?
Expected Architecture (if correctly implemented):

text
src/
├── main/
│   ├── database/
│   │   └── DatabaseManager.ts     # Core database operations
│   ├── backup/
│   │   ├── backupExporter.ts      # Export logic
│   │   └── backupImporter.ts      # Import logic
│   └── ipc/
│       └── backupHandlers.ts      # IPC handlers
├── preload/
│   └── index.ts                   # Exposes backupAPI to renderer
└── renderer/
    └── components/
        └── Settings/
            └── BackupSection.tsx  # UI buttons and state
Deliverable for Audit:

A clear mapping document showing:

Where the import/export feature currently lives (file paths)

What works correctly (if anything)

What is broken or missing

What needs to be refactored or replaced

Whether encryption is properly implemented or absent

Part 3: Feature Implementation — Complete Offline Encrypted Backup & Restore System
3.1 Feature Overview
Implement a secure offline-first backup and restore system that allows IntentFlow users to:

Automatically create a database on fresh install (no sample data)

Export their entire database to an encrypted backup file

Save that file to external storage (USB, SSD, flash drive)

Restore from that backup on any machine (including after OS reset or device replacement)

Perform all operations offline with zero cloud dependencies

3.2 Automatic Database Creation
Requirement: When IntentFlow launches on a machine where no database exists, the application must automatically create a new, empty SQLite database with the complete schema.

Specification:

Aspect	Detail
Trigger	App launch, database file not found at app.getPath('userData')/app.db
Action	Create new database with all required tables (users, transactions, categories, settings, etc.)
Data inserted	❌ No sample, demo, or seed data
Schema source	Use existing migration/initialization scripts
Failure handling	If creation fails, show error and prevent app from proceeding
3.3 Export Backup Feature (Settings → Export Backup)
Requirement: Users must be able to trigger an encrypted export of their active database.

Specification:

Step	Action
1	User clicks "Export Backup" in Settings
2	System prompts for a backup password (with strength indicator)
3	System locates app.db at app.getPath('userData')
4	System creates a transaction-safe snapshot (copy to temp location)
5	System encrypts the snapshot using AES-256-GCM (preferred) or XChaCha20-Poly1305
6	System derives encryption key using Argon2id (preferred) or PBKDF2 (min 600,000 iterations)
7	System generates a portable encrypted backup file named intentflow-backup-[timestamp].enc
8	Electron dialog.showSaveDialog opens for user to choose save location (USB, SSD, local folder)
9	System writes backup file and cleans up temp files
10	System updates "Last Backup Timestamp" in UI
Backup Container Structure:

json
{
  "version": "1.0.0",
  "createdAt": "2026-01-15T14:30:00Z",
  "appVersion": "2.1.0",
  "encryptionMetadata": {
    "algorithm": "AES-256-GCM",
    "kdf": "Argon2id",
    "salt": "<base64-encoded-salt>",
    "iv": "<base64-encoded-iv>",
    "authTag": "<base64-encoded-auth-tag>"
  },
  "checksum": "<sha256-of-encrypted-payload>",
  "encryptedPayload": "<base64-encoded-encrypted-data>"
}
3.4 Import Backup Feature (Settings → Import Backup)
Requirement: Users must be able to restore from a previously created encrypted backup.

Specification:

Step	Action
1	User clicks "Import Backup" in Settings
2	Electron dialog.showOpenDialog opens, filtered for .enc files
3	User selects backup file
4	System prompts for backup password
5	System parses backup JSON container
6	System validates version compatibility (support semantic versioning checks)
7	System verifies checksum to detect corruption/tampering
8	System decrypts payload using provided password
9	System creates automatic pre-restore rollback backup of current app.db
10	System replaces active app.db with decrypted data
11	System automatically restarts or reloads the application
12	User resumes with all data restored
Rollback Safety:

If ANY step fails (decryption, version mismatch, checksum failure, write error), system must roll back to pre-restore state

Rollback backup should be named app.db.rollback-[timestamp] and kept for manual recovery (optional auto-cleanup after 7 days)

3.5 Security & Privacy Requirements
Requirement	Detail
Local-only encryption	All crypto operations happen exclusively on user's machine
No cloud	Zero dependence on any cloud API, authentication service, or external server
No logging	Never log passwords, decrypted content, keys, or salts to console, files, telemetry, or crash reports
Memory safety	Zero sensitive buffers after use (use buffer.fill(0) for keys)
Password strength	Warn if password is weak (length < 8, common patterns) but do not enforce
3.6 UI/UX Specifications — Settings Page Integration
The existing Settings page must include a Backup & Restore section with:

UI Element	Behavior
Export Backup button	Triggers export flow. Disables during export. Shows loading state.
Import Backup button	Triggers import flow. Disables during import. Shows loading state.
Last Backup display	Shows timestamp of last successful export (stored locally, e.g., localStorage)
Status indicator	Shows success/error of last operation with clear message
Confirmation Dialogs Required:

Scenario	Dialog Content
Import confirmation	"WARNING: This will replace ALL current data with the backup. A rollback backup will be created automatically. Continue?"
Invalid password	"Incorrect password. Please try again."
Corrupted backup	"Backup file is corrupted or has been tampered with (checksum mismatch). Restoration aborted."
Incompatible version	"This backup was created with a different version of IntentFlow (vX.X.X). Current version is vY.Y.Y. Restoration may not work correctly. Continue anyway?"
3.7 Error Handling Strategy
Error Scenario	System Response
Source database missing on export	Show error: "No database found to export. Please ensure IntentFlow has been used at least once."
Insufficient disk space for export	Show error: "Not enough disk space to create backup. Please free up space and try again."
Permission denied writing to export location	Show error: "Cannot write to selected location. Please choose a different folder."
User cancels file dialog	Do nothing, return to Settings without error
Password input cancelled	Cancel export/import operation
Decryption fails (wrong password)	Show "Invalid password" and prompt again (limit 3 attempts)
Version mismatch	Show warning dialog with option to continue or cancel
Database write error during import	Roll back to pre-restore backup, show error, log non-sensitive details
3.8 Cross-Platform Requirements
Platform	Specific Considerations
macOS	Use app.getPath('userData') → ~/Library/Application Support/IntentFlow/. Handle permission dialogs for removable storage. Test on ARM (M1/M2/M3) and Intel.
Windows	Use app.getPath('userData') → %APPDATA%\IntentFlow\. Handle drive letters for USB (e.g., D:\). Test on Windows 10 and 11.
Electron APIs to Use:

dialog.showSaveDialog for export file picker

dialog.showOpenDialog for import file picker

app.getPath('userData') for database location

app.getPath('temp') for snapshot/rollback files

app.getVersion() for app version in backup metadata

3.9 Refactoring the Existing "Backup" Button
Based on the audit from Part 2, you must:

Action	Requirement
If button is broken	Rewire it to the new export/import system
If button is duplicate	Remove it and consolidate into Settings page
If button is mislabeled	Rename to "Export Database" or "Backup & Restore" as appropriate
Ensure clarity	User must never be confused about whether they are exporting (saving a copy) or importing (restoring data)
Recommended UI Clarity Pattern:

text
Backup & Restore
├── Export Database (creates encrypted backup file)
│   └── [ Export ] button
├── Restore from Backup (replaces current data with backup)
│   └── [ Restore ] button
└── Last backup: Jan 15, 2026 14:30
Part 4: Deliverables
Provide the following as your final response:

4.1 Root Cause Analysis
For each of the three issues:

Issue 1 (Backup button confusion & broken function)

Issue 2 (Next.js static file loading errors)

Issue 3 (UI scroll failure)

Provide:

What the root cause is

Why it occurred

What files/configuration are responsible

4.2 Production-Safe Fixes
For each issue, provide exact fix instructions (without code, but descriptive enough to implement):

Issue	Fix Description
Backup button	e.g., "Remove the old Backup button from NavigationBar.tsx and implement new Export/Import buttons in Settings/BackupSection.tsx with proper IPC handlers"
Static file loading	e.g., "Modify next.config.js to set assetPrefix: './' and output: 'export'. Update Electron main.ts to use loadFile(path.join(__dirname, 'out/index.html')) instead of loadURL."
Scroll failure	e.g., "Remove overflow: hidden from global.css body selector. Add overflow: auto to html, body, and #root."
4.3 Architecture Mapping
Provide a clear map of:

Where import/export logic currently exists (file paths and functions)

What is missing or broken

What needs to be added (new files, IPC channels, preload methods)

4.4 Updated Feature Implementation Plan
Provide a step-by-step implementation plan for the complete backup/restore system described in Part 3, organized by file/module.

4.5 Risk Assessment for Production Build
Risk	Likelihood	Impact	Mitigation
Example: app.asar path resolution fails in production	Medium	High	Test with electron-builder --dir before final packaging; use app.getAppPath()
(Add risks specific to IntentFlow)			
Part 5: Acceptance Criteria
The feature is complete and production-ready when:

Backup & Restore
Fresh install on macOS automatically creates empty database

Fresh install on Windows automatically creates empty database

User can export encrypted backup to USB drive

User can import backup from USB drive on different machine

All data is restored exactly as it was (verified by comparing checksums)

Import includes rollback safety (old database preserved on failure)

Invalid password fails gracefully with error message

Corrupted backup fails gracefully with error message

Export/Import works with zero internet connection

Bug Fixes
Settings page loads without any ERR_FILE_NOT_FOUND errors

All static assets (CSS, JS, images) load correctly in production .app

Landing page scrolls vertically and horizontally as expected

No overflow: hidden blocks scrolling globally

UI/UX
Settings page has clear "Export Backup" and "Import Backup" buttons

"Last Backup Timestamp" displays correctly

Confirmation dialogs appear for destructive actions (import)

Loading states prevent double-clicks during export/import

Production Build
npm run build completes without errors

npm run dist creates working macOS .app

npm run dist creates working Windows .exe (if Windows available for testing)

App launches without console errors in production

app.asar structure remains intact

Part 6: Non-Goals (Out of Scope)
The following are explicitly not part of this instruction:

❌ Cloud backup or sync (Google Drive, iCloud, Dropbox, etc.)

❌ Automatic scheduled backups

❌ Incremental backups (full backups only)

❌ Multi-device synchronization

❌ Backup compression (optional but not required)

❌ Password recovery (lost password = lost data — this is intentional for security)

❌ Migration of data from other financial apps (CSV import, etc.)

Instructions for ChatGPT Response
Based on this complete development instruction, produce a final response that:

Begins with the document title as specified

Provides the root cause analysis for each issue

Provides production-safe fixes without including actual code (descriptive instructions only)

Maps the existing import/export architecture

Provides the step-by-step implementation plan for the backup/restore system

Includes the risk assessment table

Ends with the acceptance criteria checklist

Do not include actual code blocks. Use descriptive, actionable language suitable for a senior engineer to implement.