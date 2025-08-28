#!/bin/bash
# =================================================================
# Komga-Suwayomi Sync - Quick Fix and Restart
# =================================================================
# This script fixes common Docker permission issues and restarts the service
# Run with: chmod +x quick-fix.sh && ./quick-fix.sh

set -e

echo "🔧 Quick Fix for Komga-Suwayomi Sync"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Stop the service
log_info "Stopping current service..."
docker-compose down || log_warning "Service was not running"

# Fix permissions
log_info "Fixing permissions..."
if [ -f "fix-permissions.sh" ]; then
    chmod +x fix-permissions.sh
    ./fix-permissions.sh
else
    # Manual permission fix
    log_info "Using manual permission fix..."
    sudo chown -R 1001:1001 data/ 2>/dev/null || log_warning "Could not set data directory ownership"
    sudo chown 1001:1001 .env 2>/dev/null || log_warning "Could not set .env ownership"
    chmod -R 755 data/ 2>/dev/null || log_warning "Could not set data directory permissions"
    chmod 644 .env 2>/dev/null || log_warning "Could not set .env permissions"
fi

# Rebuild and restart
log_info "Rebuilding and restarting service..."
docker-compose build --no-cache
docker-compose up -d

# Wait a moment
sleep 5

# Check if service is running
if docker-compose ps | grep -q "Up"; then
    log_success "Service restarted successfully!"
    log_info "Service is available at: http://localhost:3000"
    log_info "Check logs with: docker-compose logs -f"
else
    log_error "Service failed to start"
    log_info "Check logs with: docker-compose logs"
    exit 1
fi

echo
log_success "Quick fix completed!"
echo
echo "If you still see permission errors, try:"
echo "1. Check that you're running as a user with sudo access"
echo "2. Ensure the data directory and .env file exist"
echo "3. Try: sudo chown -R 1001:1001 data/ .env"
