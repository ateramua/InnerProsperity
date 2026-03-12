#!/bin/bash
# run-production.sh
echo "🚀 Starting Money Manager in production mode..."

# Build if out directory doesn't exist
if [ ! -d "out" ]; then
  echo "📦 Building app first..."
  npm run build
fi

# Run in production mode
cross-env NODE_ENV=production electron .