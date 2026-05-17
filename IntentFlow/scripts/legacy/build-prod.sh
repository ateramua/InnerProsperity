#!/bin/bash

echo "🔧 Building production app..."

export CSC_IDENTITY_AUTO_DISCOVERY=false

# Clean
rm -rf .next out release

# Build Next.js
echo "📦 Building Next.js..."
npx next build

# Fix HTML paths
echo "🔧 Fixing HTML paths..."
node scripts/fix-paths.cjs

# Build Electron
echo "🏗️ Building Electron app..."
npx electron-builder --mac --arm64

# Copy out directory into app
echo "📋 Copying files to app bundle..."
cp -r out release/mac-arm64/IntentFlow.app/Contents/Resources/

# Copy to Applications
echo "📱 Copying to Applications..."
cp -r release/mac-arm64/IntentFlow.app /Applications/

# Remove quarantine
xattr -d com.apple.quarantine /Applications/IntentFlow.app 2>/dev/null || true

# Launch
echo "🚀 Launching app..."
open /Applications/IntentFlow.app

echo "✅ Done!"
