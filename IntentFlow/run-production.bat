@echo off
echo 🚀 Starting Money Manager in production mode...

REM Build if out directory doesn't exist
if not exist out (
  echo 📦 Building app first...
  npm run build
)

REM Run in production mode
cross-env NODE_ENV=production electron .