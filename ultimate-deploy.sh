#!/usr/bin/env bash

# =================================================================
# Ultimate Deployment Script
# =================================================================
# This script tries multiple approaches to fix Docker build issues

set -e

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

# Method 1: Try with BuildKit disabled
try_buildkit_disabled() {
    log_info "Trying build with BuildKit disabled..."
    if DOCKER_BUILDKIT=0 docker compose build --no-cache; then
        log_success "BuildKit disabled method worked!"
        return 0
    else
        log_warning "BuildKit disabled method failed"
        return 1
    fi
}

# Method 2: Try with network fix Dockerfile
try_network_fix_dockerfile() {
    log_info "Trying with network-optimized Dockerfile..."

    # Backup original Dockerfile
    cp Dockerfile Dockerfile.backup 2>/dev/null || true

    # Use network fix Dockerfile
    cp Dockerfile.network-fix Dockerfile

    if docker compose build --no-cache; then
        log_success "Network fix Dockerfile worked!"
        return 0
    else
        # Restore original
        mv Dockerfile.backup Dockerfile 2>/dev/null || true
        log_warning "Network fix Dockerfile failed"
        return 1
    fi
}

# Method 3: Try with explicit network creation
try_explicit_network() {
    log_info "Trying with explicit network creation..."

    # Create bridge network explicitly
    docker network create bridge 2>/dev/null || true

    # Try build
    if docker compose build --no-cache; then
        log_success "Explicit network method worked!"
        return 0
    else
        log_warning "Explicit network method failed"
        return 1
    fi
}

# Method 4: Clean everything and try again
try_clean_rebuild() {
    log_info "Trying clean rebuild..."

    # Stop everything
    docker compose down 2>/dev/null || true

    # Clean everything
    docker system prune -a -f 2>/dev/null || true
    docker volume prune -f 2>/dev/null || true
    docker network prune -f 2>/dev/null || true

    # Create fresh network
    docker network create bridge 2>/dev/null || true

    # Try build
    if DOCKER_BUILDKIT=0 docker compose build --no-cache; then
        log_success "Clean rebuild worked!"
        return 0
    else
        log_warning "Clean rebuild failed"
        return 1
    fi
}

# Deploy function
deploy() {
    log_info "Starting services..."
    docker compose up -d

    log_info "Waiting for service to start..."
    sleep 15

    log_success "Deployment completed!"
    echo ""
    echo "🌐 Access your application at: http://localhost:3000"
    echo "📋 View logs: docker compose logs -f"
    echo "🛑 Stop service: docker compose down"
}

# Main function
main() {
    echo "🚀 Ultimate Docker Deployment"
    echo "============================"
    echo ""

    # Check prerequisites
    if [ ! -f ".env" ]; then
        log_error ".env file not found. Please create it from .env.example"
        exit 1
    fi

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi

    # Create directories
    mkdir -p data logs 2>/dev/null || true

    # Try different methods
    if try_buildkit_disabled; then
        deploy
    elif try_network_fix_dockerfile; then
        deploy
    elif try_explicit_network; then
        deploy
    elif try_clean_rebuild; then
        deploy
    else
        log_error "All deployment methods failed!"
        echo ""
        echo "🔧 Manual troubleshooting steps:"
        echo ""
        echo "1. Check Docker status:"
        echo "   sudo systemctl status docker"
        echo ""
        echo "2. Restart Docker:"
        echo "   sudo systemctl restart docker"
        echo ""
        echo "3. Check networks:"
        echo "   docker network ls"
        echo ""
        echo "4. Clean everything:"
        echo "   docker system prune -a -f"
        echo "   docker volume prune -f"
        echo ""
        echo "5. Try manual build:"
        echo "   DOCKER_BUILDKIT=0 docker build -t komga-suwa-sync ."
        echo ""
        echo "6. If still failing, try without network:"
        echo "   docker build --network host -t komga-suwa-sync ."
        exit 1
    fi
}

# Run main function
main "$@"
