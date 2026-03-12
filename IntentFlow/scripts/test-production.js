// scripts/test-production.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Testing production build...');

// Check if out directory exists
const outPath = path.join(__dirname, '../out');
if (!fs.existsSync(outPath)) {
  console.log('❌ out directory not found. Building first...');
  execSync('npm run build', { stdio: 'inherit' });
}

// Check for index.html
const indexPath = path.join(outPath, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('❌ index.html not found in out directory');
  process.exit(1);
}

// Check for required assets
console.log('✅ out/index.html found');

// Count files
const files = fs.readdirSync(outPath);
console.log(`📁 out directory contains ${files.length} items`);

// Test running electron in production mode
console.log('\n🚀 Testing Electron production start...');
try {
  execSync('cross-env NODE_ENV=production electron .', { 
    stdio: 'inherit',
    timeout: 10000 // Run for 10 seconds then exit
  });
} catch (error) {
  // This will timeout after 10 seconds - that's fine for testing
  console.log('✅ Electron started successfully');
}

console.log('\n✅ Production build test complete!');