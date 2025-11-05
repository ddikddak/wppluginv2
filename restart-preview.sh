#!/bin/bash

# Script to fully restart the preview server with new changes applied
# Usage: ./restart-preview.sh [WP_ORIGIN]
# Example: ./restart-preview.sh http://didac.local

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

WP_ORIGIN="${1:-http://didac.local}"
PORT="${PORT:-5500}"

echo "🛑 Stopping existing preview server..."
pkill -f "node preview-server.js" || echo "   No existing server found"

echo ""
echo "🔨 Building wizard..."
cd brand-me-now-wizard
npm run build
cd ..

echo ""
echo "📦 Copying new build files..."
rm -rf bmn-plugin/brand-me-now-wizard/dist/*
cp -r brand-me-now-wizard/dist/* bmn-plugin/brand-me-now-wizard/dist/

echo ""
echo "🚀 Starting preview server with WP_ORIGIN=$WP_ORIGIN..."
WP_ORIGIN="$WP_ORIGIN" node preview-server.js &
SERVER_PID=$!

echo ""
echo "⏳ Waiting for server to start..."
sleep 2

echo ""
echo "✅ Preview server is running!"
echo "   URL: http://localhost:$PORT/"
echo "   WordPress Origin: $WP_ORIGIN"
echo "   Server PID: $SERVER_PID"
echo ""
echo "To stop the server, run: kill $SERVER_PID"
echo "Or: pkill -f 'node preview-server.js'"

