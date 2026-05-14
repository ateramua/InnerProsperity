// scripts/copy-to-app.js
const fs = require('fs');
const path = require('path');

// Source and destination paths
const outDir = path.join(__dirname, '../out');
const releaseAppPath = path.join(__dirname, '../release/mac-arm64/IntentFlow.app/Contents/Resources/out');

console.log('📁 Copying out directory to app bundle...');

if (!fs.existsSync(outDir)) {
  console.error('❌ out directory not found at:', outDir);
  process.exit(1);
}

// Function to copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Check if release app exists
const releaseAppDir = path.join(__dirname, '../release/mac-arm64/IntentFlow.app');
if (!fs.existsSync(releaseAppDir)) {
  console.log('⚠️ Release app not found. Run electron-builder first.');
  process.exit(0);
}

// Copy the out directory
copyDir(outDir, releaseAppPath);
console.log('✅ Out directory copied successfully to:', releaseAppPath);

// Verify the copy
const indexHtml = path.join(releaseAppPath, 'index.html');
if (fs.existsSync(indexHtml)) {
  console.log('✅ Verification: index.html exists in app bundle');
} else {
  console.error('❌ Verification failed: index.html not found in app bundle');
}