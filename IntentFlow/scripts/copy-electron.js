const fs = require('fs');
const path = require('path');

const electronSrc = path.join(__dirname, '../electron');
const electronDest = path.join(__dirname, '../release/mac-arm64/Money Manager.app/Contents/Resources/electron');

if (!fs.existsSync(electronSrc)) {
  console.error('❌ electron source not found at:', electronSrc);
  process.exit(1);
}

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
      console.log(`📄 Copied: ${entry.name}`);
    }
  }
}

console.log('📁 Copying electron files...');
copyDir(electronSrc, electronDest);
console.log('✅ Electron files copied successfully!');
