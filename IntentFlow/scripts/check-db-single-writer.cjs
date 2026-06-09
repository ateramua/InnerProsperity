#!/usr/bin/env node
'use strict';

/**
 * CI guard: Electron main/services must not open secondary SQLite connections.
 * CLI scripts under scripts/ and src/db/scripts/ may use dbPath constructors.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = [
  path.join(ROOT, 'src/main'),
  path.join(ROOT, 'src/services'),
  path.join(ROOT, 'src/db'),
];

const SKIP_FILES = new Set([
  path.join(ROOT, 'src/services/transactions/transactionService.cjs'),
  path.join(ROOT, 'src/db/intentflow-sqlite-owner.cjs'),
  path.join(ROOT, 'src/db/database.cjs'),
]);

const violations = [];

function isMigrationOrTestDbFile(rel) {
  const base = path.basename(rel);
  return (
    /^add_.*\.cjs$/.test(base) ||
    base === 'test-connection.cjs' ||
    rel.includes('/db/scripts/')
  );
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'scripts') continue;
      walk(full, files);
    } else if (/\.(cjs|js|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function checkFile(filePath) {
  if (SKIP_FILES.has(filePath)) return;
  const rel = path.relative(ROOT, filePath);
  if (isMigrationOrTestDbFile(rel)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');

  lines.forEach((line, idx) => {
    const n = idx + 1;
    if (/new\s+TransactionService\s*\(\s*getDatabasePath\s*\(\s*\)\s*\)/.test(line)) {
      violations.push(`${rel}:${n} — use new TransactionService(() => getDatabase()) in Electron code`);
    }
    if (/new\s+TransactionService\s*\(\s*dbPath\s*\)/.test(line) && !rel.includes('scripts/')) {
      violations.push(`${rel}:${n} — use provider constructor: new TransactionService(() => db)`);
    }
    if (/sqlite3\.Database\s*\(/.test(line)) {
      if (rel.includes('intentflow-sqlite-owner')) return;
      if (rel === 'src/main/index.cjs' && /OPEN_READONLY/.test(line)) return;
      violations.push(`${rel}:${n} — direct sqlite3.Database(); use intentflow-sqlite-owner`);
    }
  });
}

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    checkFile(file);
  }
}

if (violations.length > 0) {
  console.error('DB single-writer guard failed:\n');
  for (const v of violations) {
    console.error(`  - ${v}`);
  }
  process.exit(1);
}

console.log('DB single-writer guard passed.');
