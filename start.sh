#!/bin/bash
# GEMINI MCP + Frontend Startup Script

echo "═══════════════════════════════════════════════════════════════"
echo "  GEMINI Desktop Commander MCP Launcher"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "   Install from: https://nodejs.org"
    exit 1
fi

echo "✓ Node.js version: $(node --version)"
echo "✓ npm version: $(npm --version)"
echo ""

# Check dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check API key
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found"
    echo "   Creating .env from template..."
    cp .env.example .env
    echo "   Please add your GEMINI_API_KEY to .env"
    echo ""
fi

GEMINI_API_KEY=$(grep GEMINI_API_KEY .env | cut -d '=' -f 2)
if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" == '"YOUR_API_KEY_HERE"' ]; then
    echo "⚠️  GEMINI_API_KEY is not set in .env"
    echo "   Set it before using the agent"
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  Starting GEMINI (MCP Backend + Frontend)"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🚀 MCP Backend:   http://localhost:13001 (WebSocket)"
echo "🌐 Frontend:      http://localhost:13000"
echo ""
echo "   Press Ctrl+C to stop"
echo ""

# Start services
npm run dev
