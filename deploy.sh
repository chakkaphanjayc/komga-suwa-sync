#!/bin/bash

# =================================================================
# Komga-Suwayomi Sync - Deployment Script
# =================================================================
# This script helps deploy the application with different configurations
# Usage: ./deploy.sh [environment] [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="development"
SKIP_BUILD=false
SKIP_HEALTH_CHECK=false
PRODUCTION=false

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

show_help() {
    echo "🚀 Komga-Suwayomi Sync - Deployment Script"
    echo ""
    echo "Usage: $0 [environment] [options]"
    echo ""
    echo "Environments:"
    echo "  development    Deploy in development mode (default)"
    echo "  production     Deploy in production mode"
    echo ""
    echo "Options:"
    echo "  --skip-build           Skip Docker build step"
    echo "  --skip-health-check    Skip health check"
    echo "  --help                 Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                      # Deploy development environment"
    echo "  $0 production           # Deploy production environment"
    echo "  $0 development --skip-build  # Deploy dev without rebuilding"
}

install_docker() {
    log_info "Installing Docker..."

    # Update package list
    apt update

    # Install required packages
    apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

    # Set up the stable repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker Engine
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    # Start and enable Docker service
    systemctl start docker
    systemctl enable docker

    # Add current user to docker group
    usermod -aG docker root

    log_success "Docker installed successfully"
    log_info "Please log out and back in for group changes to take effect"
}

check_dependencies() {
    log_info "Checking dependencies..."

    # Check if we're on Linux and offer to install Docker
    if [ ! -f "/etc/os-release" ]; then
        log_warning "Non-Linux system detected. Please ensure Docker is installed manually."
    fi

    # Check Docker
    # Check Docker
    if ! command -v docker &> /dev/null || ! docker --version &> /dev/null; then
        log_warning "Docker is not installed"
        if [ -f "/etc/os-release" ]; then
            echo "Would you like to install Docker automatically? (y/N): "
            read -r REPLY
            if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
                install_docker
            else
                log_error "Docker is required for deployment"
                exit 1
            fi
        else
            log_error "Docker is not installed or not in PATH"
            exit 1
        fi
    fi

    # Check Docker Compose (try both versions)
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_warning "Docker Compose is not available, trying to install..."
        if command -v apt &> /dev/null; then
            apt update && apt install -y docker-compose || true
        elif command -v yum &> /dev/null; then
            yum install -y docker-compose || true
        fi

        # Check again
        if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
            log_error "Docker Compose is not installed or not in PATH"
            log_info "Please install Docker Compose manually or use 'docker compose' (Docker CLI plugin)"
            exit 1
        fi
    fi

    # Check if Docker is running
    if ! docker info &> /dev/null; then
        log_warning "Docker daemon is not running, attempting to start..."
        systemctl start docker 2>/dev/null || service docker start 2>/dev/null || true
        sleep 3
        if ! docker info &> /dev/null; then
            log_error "Failed to start Docker daemon"
            log_info "Please start Docker manually:"
            log_info "  systemctl start docker"
            log_info "  or"
            log_info "  service docker start"
            exit 1
        fi
    fi

    log_success "Dependencies check passed"
}

setup_environment() {
    log_info "Setting up environment..."

    # Create .env if it doesn't exist
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_warning ".env file created from template. Please edit it with your configuration."
            log_info "Edit .env file and run this script again."
            exit 1
        else
            log_error ".env.example not found"
            exit 1
        fi
    fi

    # Create data directory
    if [ ! -d "data" ]; then
        mkdir -p data
        log_success "Created data directory"
    fi

    # Create logs directory for production
    if [ "$PRODUCTION" = true ] && [ ! -d "logs" ]; then
        mkdir -p logs
        log_success "Created logs directory"
    fi
}

run_health_check() {
    if [ "$SKIP_HEALTH_CHECK" = true ]; then
        log_info "Skipping health check..."
        return
    fi

    log_info "Running health check..."

    if [ -f "health-check.sh" ]; then
        chmod +x health-check.sh
        if ! ./health-check.sh; then
            log_error "Health check failed"
            exit 1
        fi
    elif [ -f "health-check.bat" ]; then
        if ! ./health-check.bat; then
            log_error "Health check failed"
            exit 1
        fi
    else
        log_warning "No health check script found, skipping..."
    fi
}

build_and_deploy() {
    local compose_file="docker-compose.yml"

    if [ "$PRODUCTION" = true ]; then
        compose_file="docker-compose.prod.yml"
        if [ ! -f "$compose_file" ]; then
            log_error "Production compose file not found: $compose_file"
            exit 1
        fi
    fi

    # Build the image
    if [ "$SKIP_BUILD" = false ]; then
        log_info "Building Docker image..."
        if [ "$PRODUCTION" = true ]; then
            docker compose -f "$compose_file" build --no-cache
        else
            docker compose -f "$compose_file" build
        fi
    else
        log_info "Skipping build step..."
    fi

    # Stop existing containers
    log_info "Stopping existing containers..."
    docker compose -f "$compose_file" down

    # Start the services
    log_info "Starting services..."
    docker compose -f "$compose_file" up -d

    # Wait for health check
    log_info "Waiting for service to be healthy..."
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if docker compose -f "$compose_file" ps | grep -q "healthy"; then
            log_success "Service is healthy!"
            break
        fi

        log_info "Waiting... (attempt $attempt/$max_attempts)"
        sleep 10
        ((attempt++))
    done

    if [ $attempt -gt $max_attempts ]; then
        log_warning "Service may not be fully healthy yet, but continuing..."
    fi
}

show_deployment_info() {
    local port="3000"

    log_success "Deployment completed!"
    echo ""
    echo "📊 Service Information:"
    echo "   🌐 URL: http://localhost:$port"
    echo "   📋 Logs: docker compose logs -f"
    echo "   🛑 Stop: docker compose down"
    echo "   🔄 Restart: docker compose restart"
    echo ""

    if [ "$PRODUCTION" = true ]; then
        echo "🔒 Production Notes:"
        echo "   📁 Data persisted in: ./data"
        echo "   📋 Logs available in: ./logs"
        echo "   🔧 Configuration: .env"
        echo ""
    fi
}

# Parse arguments
while [ $# -gt 0 ]; do
    case $1 in
        development|dev)
            ENVIRONMENT="development"
            PRODUCTION=false
            shift
            ;;
        production|prod)
            ENVIRONMENT="production"
            PRODUCTION=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-health-check)
            SKIP_HEALTH_CHECK=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown argument: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main deployment flow
echo "🚀 Komga-Suwayomi Sync - Deployment Script"
echo "=========================================="
echo "Environment: $ENVIRONMENT"
echo "Skip Build: $SKIP_BUILD"
echo "Skip Health Check: $SKIP_HEALTH_CHECK"
echo ""

check_dependencies
setup_environment
run_health_check
build_and_deploy
show_deployment_info

log_success "Deployment script completed successfully!"
