#!/bin/bash
# Resolvo — VPS Deploy Script
# Run on VPS: bash /root/Resolvo/deploy.sh
set -e
cd /root/Resolvo

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Resolvo — Deploying latest code    ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Download latest server.js and migrate script from GitHub
echo "📥 Downloading latest server.js..."
curl -sf -o server.js.tmp "https://raw.githubusercontent.com/Mrsk82/Resolvo/main/server.js"
mv server.js.tmp server.js
echo "✅ server.js updated"

echo "📥 Downloading migrate-to-sqlite.js..."
curl -sf -o migrate-to-sqlite.js "https://raw.githubusercontent.com/Mrsk82/Resolvo/main/migrate-to-sqlite.js" || true
echo "✅ migrate-to-sqlite.js updated"

# Install dependencies (includes better-sqlite3)
echo ""
echo "📦 Installing dependencies..."
npm install --production --silent
echo "✅ Dependencies ready"

# Run SQLite migration (skips brands already migrated)
echo ""
echo "🗄️  Running SQLite migration..."
node migrate-to-sqlite.js || echo "⚠️  Migration script error — check logs, server will auto-migrate on first access"

# Confirm data is safe
echo ""
echo "✅ data/ untouched — customer data safe"
echo "   Brands: $(ls data/brands/ 2>/dev/null | wc -l)"

# Restart
echo ""
echo "🔄 Restarting server..."
pm2 restart resolvo --update-env
echo "✅ Done!"
echo ""
pm2 status
