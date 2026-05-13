#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../out');
const sourceNext = path.join(outDir, '_next');

if (!fs.existsSync(outDir)) {
  console.error('❌ Export output directory not found. Run next build first.');
  process.exit(1);
}

if (!fs.existsSync(sourceNext)) {
  console.error('❌ _next directory not found in export output. Ensure Next.js output is configured with output: "export".');
  process.exit(1);
}

const copiedDirs = [];

function copyNextAssets(currentDir) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const hasHtmlPage = entries.some((entry) => entry.isFile() && entry.name.endsWith('.html'));

  if (hasHtmlPage && currentDir !== outDir) {
    const targetNext = path.join(currentDir, '_next');
    if (!fs.existsSync(targetNext)) {
      fs.cpSync(sourceNext, targetNext, { recursive: true });
      copiedDirs.push(targetNext);
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== '_next') {
      copyNextAssets(path.join(currentDir, entry.name));
    }
  }
}

copyNextAssets(outDir);

console.log(`✅ Copied _next assets into ${copiedDirs.length} route directories.`);
if (copiedDirs.length > 0) {
  copiedDirs.slice(0, 10).forEach((dir) => console.log('  -', dir));
}
