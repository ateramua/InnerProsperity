// scripts/build.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Building Money Manager Desktop...');

// Step 1: Build Next.js app
console.log('\n📦 Building Next.js app...');
execSync('npm run build', { stdio: 'inherit' });

// Step 2: Check if build succeeded
const outPath = path.join(__dirname, '../out');
if (!fs.existsSync(outPath)) {
  console.error('❌ Build failed: out directory not found');
  process.exit(1);
}

// Step 3: Verify index.html exists
const indexPath = path.join(outPath, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('❌ Build failed: index.html not found');
  process.exit(1);
}

console.log('✅ Next.js build complete!');

// Step 4: Ask user what platform to build for
console.log('\n🎯 Choose platform to build for:');
console.log('1. macOS');
console.log('2. Windows');
console.log('3. Linux');
console.log('4. All platforms');

// For now, we'll just build for the current platform
// You can expand this later

console.log('\n✅ Ready to build! Run: npm run dist');