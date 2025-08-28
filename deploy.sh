#!/bin/bash
# =================================================================
# Komga-Suwayomi Sync - Proxmox Deployment Script
# =================================================================
# This script helps deploy the service on Proxmox/Linux systems
# Run with: chmod +x deploy.sh && ./deploy.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="komga-suwa-sync"
CONTAINER_PORT=3000
HOST_PORT=3000

# Functions
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

check_dependencies() {
    log_info "Checking dependencies..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi

    log_success "Dependencies check passed"
}

setup_environment() {
    log_info "Setting up environment..."

    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_success "Created .env from template"
            log_warning "Please edit .env file with your Komga and Suwayomi server details"
        else
            log_error ".env.example not found"
            exit 1
        fi
    else
        log_info ".env file already exists"
    fi

    # Create data directory
    if [ ! -d "data" ]; then
        mkdir -p data
        log_success "Created data directory"
    fi

    # Fix permissions before deployment
    log_info "Fixing file permissions..."
    if [ -f "fix-permissions.sh" ]; then
        chmod +x fix-permissions.sh
        ./fix-permissions.sh
        log_success "Permissions fixed"
    else
        # Manual permission fix
        sudo chown -R 1001:1001 data/ 2>/dev/null || true
        sudo chown 1001:1001 .env 2>/dev/null || true
        chmod -R 755 data/ 2>/dev/null || true
        chmod 644 .env 2>/dev/null || true
        log_success "Basic permissions set"
    fi
}

build_and_deploy() {
    log_info "Building and deploying $PROJECT_NAME..."

    # Build the image
    log_info "Building Docker image..."
    docker-compose build

    # Start the service
    log_info "Starting service..."
    docker-compose up -d

    # Wait for service to be healthy
    log_info "Waiting for service to start..."
    sleep 10

    # Check if service is running
    if docker-compose ps | grep -q "Up"; then
        log_success "Service deployed successfully!"
        log_info "Service is available at: http://localhost:$HOST_PORT"
        log_info "Web dashboard: http://localhost:$HOST_PORT"
        log_info "Health check: http://localhost:$HOST_PORT/health"
    else
        log_error "Service failed to start"
        log_info "Check logs with: docker-compose logs"
        exit 1
    fi
}

show_post_installation() {
    echo
    log_success "Post-installation steps:"
    echo "1. Edit the .env file with your server configurations:"
    echo "   nano .env"
    echo
    echo "2. Open the web dashboard:"
    echo "   http://localhost:$HOST_PORT"
    echo
    echo "3. Configure Komga and Suwayomi connections in the web interface"
    echo
    echo "4. Test connections and run initial sync"
    echo
    echo "Useful commands:"
    echo "  docker-compose logs -f          # View logs"
    echo "  docker-compose restart          # Restart service"
    echo "  docker-compose down             # Stop service"
    echo "  docker-compose up -d --build    # Rebuild and restart"
}

main() {
    echo "🚀 Komga-Suwayomi Sync - Proxmox Deployment"
    echo "=========================================="

    check_dependencies
    setup_environment
    build_and_deploy
    show_post_installation

    echo
    log_success "Deployment completed successfully!"
}

# Run main function
main "$@"
