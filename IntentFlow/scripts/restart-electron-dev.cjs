#!/usr/bin/env node
/**
 * Kill stale IntentFlow dev processes and start a fresh npm run dev.
 * Required after changes under src/main/, src/db/, or src/preload/ because
 * Electron main does not hot-reload.
 */
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const path = require('path');

const appRoot = path.join(__dirname, '..');

function runQuiet(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
  } catch (_) {
    /* process may not exist */
  }
}

function killStaleDevProcesses() {
  if (process.platform === 'win32') {
    runQuiet('taskkill /F /IM electron.exe /T');
    return;
  }

  runQuiet("pkill -f 'Electron.app/Contents/MacOS/Electron' 2>/dev/null");
  runQuiet("pkill -f 'node scripts/electron-dev.cjs' 2>/dev/null");
  runQuiet("pkill -f 'next dev' 2>/dev/null");
}

console.log('[IntentFlow] Stopping stale dev / Electron processes...');
killStaleDevProcesses();

console.log('[IntentFlow] Starting fresh dev server (main + preload will reload)...');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn('npm', ['run', 'dev'], {
  cwd: appRoot,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});
process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
