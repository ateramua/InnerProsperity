#!/usr/bin/env node
/**
 * Starts Next dev on an available port and launches Electron with the same PORT.
 * Avoids hardcoding 3000 when that port is busy (wait-on + Electron mismatch).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const appRoot = path.join(__dirname, '..');

const ELECTRON_RESTART_WATCH_DIRS = [
  path.join(appRoot, 'src', 'main'),
  path.join(appRoot, 'src', 'db'),
  path.join(appRoot, 'src', 'preload'),
];
const ELECTRON_RESTART_DEBOUNCE_MS = 400;

function listenOnAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => tryPort(port + 1));
      server.listen(port, () => {
        const address = server.address();
        const chosen = typeof address === 'object' && address ? address.port : port;
        server.close(() => resolve(chosen));
      });
    };
    tryPort(startPort);
  });
}

function waitForHttp(port, timeoutMs = 120000) {
  const url = `http://127.0.0.1:${port}/`;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for Next.js at ${url}`));
        return;
      }
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => setTimeout(attempt, 250));
    };
    attempt();
  });
}

async function main() {
  const preferred = parseInt(process.env.INTENTFLOW_DEV_PORT || process.env.PORT || '3000', 10) || 3000;
  const port = await listenOnAvailablePort(preferred);
  console.log(`\n🚀 Next.js dev → http://127.0.0.1:${port}/ (PORT=${port})\n`);

  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
  };

  const nextCli = path.join(appRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const next = spawn(process.execPath, [nextCli, 'dev', '-p', String(port)], {
    cwd: appRoot,
    env,
    stdio: 'inherit',
  });

  await waitForHttp(port);

  const electronPkg = require.resolve('electron/package.json');
  const electronCli = path.join(path.dirname(electronPkg), 'cli.js');
  const debugPort =
    process.env.INTENTFLOW_REMOTE_DEBUGGING_PORT ||
    process.env.ELECTRON_REMOTE_DEBUGGING_PORT ||
    '9222';
  console.log(`🔌 Electron remote debugging → http://127.0.0.1:${debugPort}\n`);
  let electron = spawn(process.execPath, [electronCli, '.'], {
    cwd: appRoot,
    env,
    stdio: 'inherit',
  });

  let restartTimer = null;
  let watchers = [];
  let intentionalElectronRestart = false;

  const attachElectronExitHandler = (proc) => {
    proc.on('exit', (code) => {
      if (intentionalElectronRestart) {
        intentionalElectronRestart = false;
        return;
      }
      shutdown(code ?? 0);
    });
  };

  const scheduleElectronRestart = (reason) => {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!electron || electron.killed) return;
      console.log(`\n♻️  Restarting Electron (${reason}) — main/preload/db changed\n`);
      intentionalElectronRestart = true;
      try {
        electron.kill('SIGTERM');
      } catch (_) {}
      electron = spawn(process.execPath, [electronCli, '.'], {
        cwd: appRoot,
        env,
        stdio: 'inherit',
      });
      attachElectronExitHandler(electron);
    }, ELECTRON_RESTART_DEBOUNCE_MS);
  };

  const watchForMainChanges = () => {
    for (const dir of ELECTRON_RESTART_WATCH_DIRS) {
      if (!fs.existsSync(dir)) continue;
      try {
        const watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
          if (!filename) return;
          if (!/\.(cjs|js|mjs|json)$/i.test(filename)) return;
          scheduleElectronRestart(path.relative(appRoot, path.join(dir, filename)));
        });
        watchers.push(watcher);
      } catch (err) {
        console.warn(`[dev] Could not watch ${dir}:`, err?.message || err);
      }
    }
    if (watchers.length) {
      console.log('[dev] Watching main/db/preload — Electron restarts automatically on save\n');
    }
  };

  watchForMainChanges();

  const shutdown = (code) => {
    if (restartTimer) clearTimeout(restartTimer);
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch (_) {}
    }
    try {
      next.kill('SIGTERM');
    } catch (_) {}
    try {
      electron.kill('SIGTERM');
    } catch (_) {}
    process.exit(typeof code === 'number' ? code : 0);
  };

  next.on('exit', (code) => shutdown(code ?? 0));
  attachElectronExitHandler(electron);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
