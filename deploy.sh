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

# Download latest server.js directly from GitHub (no git conflicts)
echo "📥 Downloading latest server.js..."
curl -sf -o server.js.tmp "https://raw.githubusercontent.com/Mrsk82/Resolvo/main/server.js"
mv server.js.tmp server.js
echo "✅ server.js updated"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install --production --silent
echo "✅ Dependencies ready"

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
