#!/usr/bin/env bash

# =================================================================
# Docker Network Fix Script
# =================================================================
# This script fixes Docker networking issues that cause "network bridge not found"

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

# Check Docker daemon
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi

    log_success "Docker is running"
}

# Fix Docker networks
fix_networks() {
    log_info "Checking Docker networks..."

    # List current networks
    docker network ls

    # Check if bridge network exists
    if ! docker network ls | grep -q bridge; then
        log_warning "Default bridge network missing, creating..."
        docker network create bridge
        log_success "Bridge network created"
    else
        log_success "Bridge network exists"
    fi

    # Inspect bridge network
    log_info "Inspecting bridge network..."
    docker network inspect bridge || log_warning "Could not inspect bridge network"

    # Clean up unused networks
    log_info "Cleaning up unused networks..."
    docker network prune -f
}

# Restart Docker daemon
restart_docker() {
    log_info "Restarting Docker daemon..."

    # Try different restart methods
    if command -v systemctl &> /dev/null; then
        sudo systemctl restart docker 2>/dev/null || true
    elif command -v service &> /dev/null; then
        sudo service docker restart 2>/dev/null || true
    else
        log_warning "Could not restart Docker automatically"
        log_info "Please restart Docker manually"
    fi

    # Wait for Docker to start
    sleep 5

    # Verify Docker is running
    if docker info &> /dev/null; then
        log_success "Docker restarted successfully"
    else
        log_error "Docker failed to restart"
        exit 1
    fi
}

# Clean Docker build cache
clean_cache() {
    log_info "Cleaning Docker build cache..."
    docker builder prune -f 2>/dev/null || true
    docker system prune -f 2>/dev/null || true
    log_success "Cache cleaned"
}

# Test build
test_build() {
    log_info "Testing Docker build..."

    # Try build with BuildKit disabled
    if DOCKER_BUILDKIT=0 docker compose build --no-cache --progress=plain; then
        log_success "Build test successful!"
        return 0
    else
        log_error "Build test failed"
        return 1
    fi
}

# Main function
main() {
    echo "🔧 Docker Network Fix"
    echo "===================="
    echo ""

    check_docker
    fix_networks
    clean_cache

    echo ""
    log_info "Testing build..."
    if test_build; then
        echo ""
        log_success "All fixes applied!"
        echo ""
        echo "You can now run:"
        echo "  docker compose up --build"
        echo "  DOCKER_BUILDKIT=0 docker compose up --build"
    else
        echo ""
        log_warning "Build still failing. Try these alternatives:"
        echo ""
        echo "1. Restart Docker daemon:"
        echo "   sudo systemctl restart docker"
        echo ""
        echo "2. Use BuildKit disabled:"
        echo "   DOCKER_BUILDKIT=0 docker compose up --build"
        echo ""
        echo "3. Clean everything and rebuild:"
        echo "   docker system prune -a -f"
        echo "   docker volume prune -f"
        echo "   DOCKER_BUILDKIT=0 docker compose up --build"
    fi
}

# Run main function
main "$@"
