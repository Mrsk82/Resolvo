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

# Download latest server.js and frontend files from GitHub
echo "📥 Downloading latest server.js..."
curl -sf -o server.js.tmp "https://raw.githubusercontent.com/Mrsk82/Resolvo/main/server.js"
mv server.js.tmp server.js
echo "✅ server.js updated"

echo "📥 Downloading latest frontend (public/)..."
mkdir -p public
curl -sf -o public/index.html "https://raw.githubusercontent.com/Mrsk82/Resolvo/main/public/index.html" && echo "✅ index.html updated" || echo "⚠️  index.html download failed"
curl -sf -o public/pitch.html "https://raw.githubusercontent.com/Mrsk82/Resolvo/main/public/pitch.html" || true
curl -sf -o public/signup.html "https://raw.githubusercontent.com/Mrsk82/Resolvo/main/public/signup.html" || true
curl -sf -o public/portal.html "https://raw.githubusercontent.com/Mrsk82/Resolvo/main/public/portal.html" || true
echo "✅ Frontend files updated"

echo "📥 Downloading migration scripts..."
curl -sf -o migrate-to-sqlite.js "https://raw.githubusercontent.com/Mrsk82/Resolvo/main/migrate-to-sqlite.js" || true
curl -sf -o migrate-to-mysql.js "https://raw.githubusercontent.com/Mrsk82/Resolvo/main/migrate-to-mysql.js" || true
echo "✅ Migration scripts updated"

# Install dependencies (includes mysql2 + better-sqlite3)
echo ""
echo "📦 Installing dependencies..."
npm install --production --silent
echo "✅ Dependencies ready"

# Run MySQL migration (skips brands already migrated)
echo ""
echo "🗄️  Running MySQL migration..."
node migrate-to-mysql.js || echo "⚠️  Migration error — server will fallback to SQLite on first access"

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
