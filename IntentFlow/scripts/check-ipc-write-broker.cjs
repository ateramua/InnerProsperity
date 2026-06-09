#!/usr/bin/env node
'use strict';

/**
 * Verify every manifest write IPC channel is broker-wrapped via enqueueWrite() in index.cjs.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'src/main/index.cjs');
const MANIFEST = path.join(__dirname, 'ipc-write-handlers.manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const indexText = fs.readFileSync(INDEX, 'utf8');

const wrapped = new Set();
for (const match of indexText.matchAll(/enqueueWrite\('([^']+)'/g)) {
  wrapped.add(match[1]);
}

const missing = [];
for (const channel of manifest.requiredWriteHandlers) {
  if (!wrapped.has(channel)) {
    missing.push(channel);
  }
}

const extra = [...wrapped].filter((ch) => !manifest.requiredWriteHandlers.includes(ch));

if (missing.length > 0) {
  console.error('IPC write broker guard failed — missing enqueueWrite wraps:\n');
  for (const ch of missing) console.error(`  - ${ch}`);
  process.exit(1);
}

if (extra.length > 0) {
  console.warn('IPC write broker guard: wrapped handlers not listed in manifest (update manifest):');
  for (const ch of extra.sort()) console.warn(`  + ${ch}`);
}

console.log(
  `IPC write broker guard passed (${manifest.requiredWriteHandlers.length} write handlers, architecture=${manifest.version}).`
);
