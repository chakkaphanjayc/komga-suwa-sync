#!/bin/bash

# =================================================================
# Quick Fix Script for Common Issues
# =================================================================
# This script fixes common deployment issues
# Run with: ./fix-issues.sh

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

# Fix permissions
fix_permissions() {
    log_info "Fixing script permissions..."
    chmod +x *.sh 2>/dev/null || true
    log_success "Permissions fixed"
}

# Check Docker installation
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        echo ""
        echo "Please install Docker:"
        echo "1. Visit: https://docs.docker.com/get-docker/"
        echo "2. Download and install Docker Desktop"
        echo "3. Restart your terminal"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        echo ""
        echo "Please start Docker Desktop and try again"
        exit 1
    fi

    log_success "Docker is installed and running"
}

# Clean up Docker resources
clean_docker() {
    log_info "Cleaning up Docker resources..."
    docker system prune -f 2>/dev/null || true
    docker volume prune -f 2>/dev/null || true
    log_success "Docker cleanup completed"
}

# Create required directories
create_directories() {
    log_info "Creating required directories..."
    mkdir -p data logs 2>/dev/null || true
    log_success "Directories created"
}

# Check .env file
check_env() {
    if [ ! -f ".env" ]; then
        log_warning ".env file not found"
        if [ -f ".env.example" ]; then
            log_info "Creating .env from .env.example..."
            cp .env.example .env
            log_success ".env file created. Please edit it with your configuration."
        else
            log_error "Neither .env nor .env.example found. Please create .env file."
            exit 1
        fi
    else
        log_success ".env file exists"
    fi
}

# Main function
main() {
    echo "🔧 Komga-Suwayomi Sync - Quick Fix"
    echo "==================================="
    echo ""

    fix_permissions
    check_docker
    clean_docker
    create_directories
    check_env

    echo ""
    log_success "All fixes applied!"
    echo ""
    echo "You can now run:"
    echo "  ./simple-deploy.sh production"
    echo "  ./simple-deploy.sh development"
}

# Run main function
main "$@"
