#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Resolvo — Safe VPS Deployment Script
# Run this on your VPS: bash deploy.sh
# ═══════════════════════════════════════════════════════════════
#
# SAFE: Only pulls code files. data/ is NEVER touched.
# Your customer JSON stays exactly as-is on the VPS.
#
# ═══════════════════════════════════════════════════════════════

set -e  # Stop on any error

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Resolvo — Deploying latest code    ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Pull latest code from GitHub ──────────────────────────
echo "📥 Pulling latest code from GitHub..."
git pull origin main
echo "✅ Code updated"

# ── 2. Install/update dependencies ───────────────────────────
echo ""
echo "📦 Installing dependencies..."
npm install --production
echo "✅ Dependencies ready"

# ── 3. Verify data directory exists (safe check) ─────────────
if [ ! -d "data" ]; then
  echo ""
  echo "📁 Creating data/ directory (fresh deploy)..."
  mkdir -p data/brands
  echo "✅ data/ created"
else
  echo ""
  echo "✅ data/ exists — customer data untouched"
  echo "   Brands found: $(ls data/brands/ 2>/dev/null | wc -l)"
fi

# ── 4. Restart server with PM2 ────────────────────────────────
echo ""
if command -v pm2 &> /dev/null; then
  echo "🔄 Restarting server with PM2..."
  pm2 restart resolvo 2>/dev/null || pm2 start server.js --name resolvo
  pm2 save
  echo "✅ Server restarted with PM2"
else
  echo "⚠️  PM2 not found — install it: npm install -g pm2"
  echo "   Then run: pm2 start server.js --name resolvo && pm2 save && pm2 startup"
fi

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   ✅ Deployment complete!             ║"
echo "╚══════════════════════════════════════╝"
echo ""
