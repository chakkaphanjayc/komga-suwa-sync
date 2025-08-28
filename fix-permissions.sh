#!/bin/bash
# =================================================================
# Komga-Suwayomi Sync - Permission Fix Script
# =================================================================
# This script fixes file permissions for Docker deployment
# Run this on the host system before starting the container

set -e

echo "🔧 Fixing permissions for Komga-Suwayomi Sync..."

# Fix data directory permissions
if [ -d "data" ]; then
    echo "Setting permissions for data directory..."
    sudo chown -R 1001:1001 data/
    chmod -R 755 data/
    echo "✅ Data directory permissions fixed"
else
    echo "Creating data directory..."
    mkdir -p data
    sudo chown -R 1001:1001 data/
    chmod -R 755 data/
    echo "✅ Data directory created and permissions set"
fi

# Fix .env file permissions
if [ -f ".env" ]; then
    echo "Setting permissions for .env file..."
    sudo chown 1001:1001 .env
    chmod 644 .env
    echo "✅ .env file permissions fixed"
else
    echo "⚠️  .env file not found. Make sure to create it from .env.example"
fi

echo ""
echo "🎉 Permission fix complete!"
echo ""
echo "You can now start the service with:"
echo "  docker-compose up -d"
echo ""
echo "If you still have permission issues, try:"
echo "  sudo chmod -R 755 data/"
echo "  sudo chown -R 1001:1001 data/ .env"
