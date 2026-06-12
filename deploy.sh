#!/bin/bash
# ═══════════════════════════════════════════
# Resolvo — VPS Deploy Script
# Run on VPS: bash deploy.sh
# ═══════════════════════════════════════════
set -e
cd /root/Resolvo

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Resolvo — Deploying latest code    ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Download latest server.js from GitHub (safe — no git conflicts)
echo "📥 Downloading latest server.js..."
curl -sf -o server.js.tmp "https://raw.githubusercontent.com/Mrsk82/Resolvo/main/server.js"
mv server.js.tmp server.js
echo "✅ server.js updated"

# Install/update dependencies
echo ""
echo "📦 Installing dependencies..."
npm install --production --silent
echo "✅ Dependencies ready"

# Verify data is safe
echo ""
if [ -d "data" ]; then
  echo "✅ data/ untouched — customer data safe"
  echo "   Brands: $(ls data/brands/ 2>/dev/null | wc -l)"
fi

# Restart server
echo ""
echo "🔄 Restarting server..."
pm2 restart resolvo --update-env
echo "✅ Server restarted"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   ✅ Deploy complete!                 ║"
echo "╚══════════════════════════════════════╝"
echo ""
pm2 status
