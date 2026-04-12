// scripts/fix-paths.js
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../out');

if (!fs.existsSync(outDir)) {
  console.log('❌ out directory not found. Run next build first.');
  process.exit(1);
}

function fixHtmlPaths(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Fix all absolute paths to relative paths
  const replacements = [
    [/href="\/_next\//g, 'href="./_next/'],
    [/src="\/_next\//g, 'src="./_next/'],
    [/href="\//g, 'href="./'],
    [/src="\//g, 'src="./'],
    [/"\/_next\//g, '"./_next/'],
    [/'\/_next\//g, "'./_next/"],
  ];
  
  for (const [regex, replacement] of replacements) {
    if (regex.test(content)) {
      content = content.replace(regex, replacement);
      modified = true;
    }
  }
  
  // Also fix the base tag
  if (!content.includes('<base href="./">') && !content.includes('<base href="/">')) {
    content = content.replace('<head>', '<head><base href="./">');
    modified = true;
  } else if (content.includes('<base href="/">')) {
    content = content.replace('<base href="/">', '<base href="./">');
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed: ${path.basename(filePath)}`);
    return true;
  }
  return false;
}

function walkDir(dir) {
  let fixedCount = 0;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fixedCount += walkDir(filePath);
    } else if (file.endsWith('.html')) {
      if (fixHtmlPaths(filePath)) fixedCount++;
    }
  }
  return fixedCount;
}

console.log('🔧 Fixing HTML paths in out directory...');
const fixed = walkDir(outDir);
console.log(`✅ Fixed ${fixed} HTML files!`);

// Also verify that the _next directory exists
const nextDir = path.join(outDir, '_next');
if (fs.existsSync(nextDir)) {
  console.log('✅ _next directory exists');
  const staticDir = path.join(nextDir, 'static', 'chunks');
  if (fs.existsSync(staticDir)) {
    const chunkFiles = fs.readdirSync(staticDir);
    console.log(`📄 Found ${chunkFiles.length} chunk files`);
  }
} else {
  console.log('❌ _next directory not found!');
}