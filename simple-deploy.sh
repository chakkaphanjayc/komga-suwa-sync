#!/usr/bin/env bash

# =================================================================
# Simple Deployment Script for Komga-Suwayomi Sync
# =================================================================
# This script provides a simple way to deploy the application
# Run with: ./simple-deploy.sh production

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

# Simple deployment function
simple_deploy() {
    local env=$1

    log_info "Starting simple deployment ($env)..."

    # Check if .env exists
    if [ ! -f ".env" ]; then
        log_error ".env file not found. Please create it from .env.example"
        exit 1
    fi

    # Create data directory
    mkdir -p data logs 2>/dev/null || true

    # Choose compose file
    local compose_file="docker-compose.yml"
    if [ "$env" = "production" ]; then
        compose_file="docker-compose.prod.yml"
    fi

    # Build and deploy
    log_info "Building Docker image..."
    docker compose -f "$compose_file" build --no-cache

    log_info "Starting services..."
    docker compose -f "$compose_file" up -d

    log_info "Waiting for service to start..."
    sleep 10

    log_success "Deployment completed!"
    echo ""
    echo "Access your application at: http://localhost:3000"
    echo "View logs: docker compose logs -f"
    echo "Stop service: docker compose down"
}

# Show help
show_help() {
    echo "Usage: $0 [environment] [options]"
    echo ""
    echo "Environments:"
    echo "  development    Deploy in development mode"
    echo "  production     Deploy in production mode"
    echo ""
    echo "Options:"
    echo "  --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./simple-deploy.sh production"
    echo "  ./simple-deploy.sh development"
}

# Main function
main() {
    local env="development"

    # Parse arguments
    case "${1:-development}" in
        development|dev)
            env="development"
            ;;
        production|prod)
            env="production"
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown environment: $1"
            show_help
            exit 1
            ;;
    esac

    echo "Komga-Suwayomi Sync - Simple Deployment"
    echo "======================================="
    echo "Environment: $env"
    echo ""

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi

    simple_deploy "$env"
}

# Run main function
main "$@"</content>
<parameter name="filePath">d:\komga-suwa-sync\simple-deploy.sh
