#!/bin/bash

# =================================================================
# Komga-Suwayomi Sync Health Check Script
# =================================================================
# This script helps verify your Docker Compose setup

set -e

echo "🔍 Komga-Suwayomi Sync - Health Check"
echo "====================================="

# Check if Docker is running
echo "📋 Checking Docker..."
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi
echo "✅ Docker is running"

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ docker-compose.yml not found in current directory"
    exit 1
fi
echo "✅ docker-compose.yml found"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi
echo "✅ .env file found"

# Check if required environment variables are set
echo "🔧 Checking environment variables..."
required_vars=("KOMGA_BASE" "KOMGA_USER" "KOMGA_PASS" "SUWA_BASE")
missing_vars=()

for var in "${required_vars[@]}"; do
    if ! grep -q "^${var}=" .env || grep -q "^${var}=.*<.*>$" .env; then
        missing_vars+=("$var")
    fi
done

# Check if either SUWA_TOKEN or both SUWA_USER/SUWA_PASS are set
if ! grep -q "^SUWA_TOKEN=" .env || grep -q "^SUWA_TOKEN=.*<.*>$" .env; then
    if ! grep -q "^SUWA_USER=" .env || grep -q "^SUWA_USER=.*<.*>$" .env || ! grep -q "^SUWA_PASS=" .env || grep -q "^SUWA_PASS=.*<.*>$" .env; then
        missing_vars+=("SUWA_TOKEN or SUWA_USER/SUWA_PASS")
    fi
fi

if [ ${#missing_vars[@]} -gt 0 ]; then
    echo "❌ Missing or placeholder environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "   - $var"
    done
    echo "   Please edit your .env file with actual values."
    exit 1
fi
echo "✅ Environment variables configured"

# Validate URLs
echo "🌐 Validating server URLs..."
source .env

if ! curl -s --head "${KOMGA_BASE}/api/v1/series" >/dev/null 2>&1; then
    echo "⚠️  Warning: Cannot reach Komga server at ${KOMGA_BASE}"
    echo "   Make sure the URL is correct and the server is running."
else
    echo "✅ Komga server is reachable"
fi

if ! curl -s --head "${SUWA_BASE}/api/graphql" >/dev/null 2>&1; then
    echo "⚠️  Warning: Cannot reach Suwayomi server at ${SUWA_BASE}"
    echo "   Make sure the URL is correct and the server is running."
else
    echo "✅ Suwayomi server is reachable"
fi

# Check if data directory exists
if [ ! -d "data" ]; then
    echo "📁 Creating data directory..."
    mkdir -p data
fi
echo "✅ Data directory ready"

echo ""
echo "🎉 Health check completed!"
echo ""
echo "🚀 You can now run: docker-compose up --build"
echo "📊 Then visit: http://localhost:3000"
echo ""
echo "📖 For more information, see README.md"
