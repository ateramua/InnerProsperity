#!/usr/bin/env node
/**
 * Post-build guard: static export must contain per-route _next copies
 * (Electron production loads file:// from out/).
 */
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'out');

function mustExist(rel) {
  const p = path.join(out, ...rel.split('/'));
  if (!fs.existsSync(p)) {
    console.error(`verify-production-export: missing required file: ${rel}`);
    process.exit(1);
  }
}

mustExist('index.html');
mustExist('login/index.html');
mustExist('accounts/index.html');
mustExist('accounts/[id]/index.html');

const loginChunksDir = path.join(out, 'login', '_next', 'static', 'chunks', 'pages');
if (!fs.existsSync(loginChunksDir)) {
  console.error('verify-production-export: missing login chunk dir');
  process.exit(1);
}
const loginChunks = fs.readdirSync(loginChunksDir);
if (!loginChunks.some((f) => f.startsWith('_app'))) {
  console.error('verify-production-export: no hashed _app chunk under login/_next');
  process.exit(1);
}

const loginHtml = fs.readFileSync(path.join(out, 'login', 'index.html'), 'utf8');
if (!loginHtml.includes('_next')) {
  console.error('verify-production-export: login/index.html has no _next asset refs');
  process.exit(1);
}

console.log('verify-production-export: OK');
