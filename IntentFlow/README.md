Below is a concise README section (or standalone guide) for setting up the database when cloning the project. It assumes the developer is on macOS (as the desktop app location is given for macOS), but the principles are similar for other platforms.

Database Setup for Development
The project uses SQLite for data storage. The database file is not included in the repository (it is ignored via .gitignore). You must set up a database manually before running the development server.

🗂 Database Location
Expected path: src/db/data/app.db

Backup file: src/db/data/app.db.empty.backup (committed, but empty)

🧪 Option 1: Copy an Existing Database (Recommended)
If you already have the desktop app installed and running, you can copy its database into the project.

Locate the desktop app’s database
On macOS, the typical path is:
~/Library/Application Support/intentflow/money-manager.db
(If the app name is different, adjust accordingly.)

Stop the development server if it is running (Ctrl + C).

Copy the database:

```bash
cp ~/Library/Application\ Support/intentflow/money-manager.db src/db/data/app.db
```

Stop the dev server, then start again:

```bash
npm run dev:restart
```

Or `npm run dev` after a clean stop. See [docs/db-single-writer.md](docs/db-single-writer.md) — **main-process DB changes require a full Electron restart** (the dev script now auto-restarts Electron when `src/main`, `src/db`, or `src/preload` change). Run `npm run check:db-architecture` before release builds.

The app will now use your real data.

🧪 Option 2: Initialize a Fresh Database
If you do not have an existing database, you can start with an empty one and let the app create the tables automatically (if migration scripts exist). Alternatively, you can seed it with test data.

Ensure the database directory exists

bash
mkdir -p src/db/data
Create an empty database file (optional)

bash
touch src/db/data/app.db
Start the development server

bash
npm run dev
The app should create the necessary tables on first run.
If you get SQLITE_ERROR: no such table errors, the app may not have auto‑migration; check for a npm run db:migrate script in package.json and run it.

✅ Verify the Setup
After starting the dev server, you should see in the logs:

✅ Database connection established

✅ Database initialized successfully

No SQLITE_ERROR: no such table messages should appear.

🔁 Refreshing the Database
To update your development database with the latest data from the desktop app, simply repeat Option 1 (copy the file again) while the dev server is stopped. The next time you start the server, the new data will be loaded.

⚠️ Important Notes
The database file (app.db) is excluded from Git (see .gitignore).

The file src/db/data/app.db.empty.backup is a placeholder and should not be used for development.

If you need to share the database with other developers, consider using a shared cloud folder or a backup/restore script.

Always stop the dev server before replacing the database file to avoid file‑locking issues.

This guide assumes macOS paths; for Windows or Linux, adjust the desktop app’s data directory accordingly (e.g., %APPDATA%\intentflow\money-manager.db or ~/.config/intentflow/money-manager.db).

