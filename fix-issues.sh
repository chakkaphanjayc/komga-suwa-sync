#!/bin/bash

# =================================================================
# Quick Fix Script for Komga-Suwayomi Sync
# =================================================================
# This script fixes common permission and setup issues
# Run this on your Linux system to resolve deployment problems

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

# Fix script permissions
fix_permissions() {
    log_info "Fixing script permissions..."

    chmod +x deploy.sh
    chmod +x health-check.sh
    chmod +x backup.sh
    chmod +x setup-linux.sh

    log_success "Permissions fixed"
}

# Install Docker if missing
install_docker() {
    if command -v docker &> /dev/null; then
        log_success "Docker is already installed"
        return
    fi

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
    usermod -aG docker $(whoami)

    log_success "Docker installed successfully"
    log_warning "Please log out and back in for Docker group changes to take effect"
}

# Start Docker service
start_docker() {
    if ! systemctl is-active --quiet docker; then
        log_info "Starting Docker service..."
        systemctl start docker
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not responding"
        exit 1
    fi

    log_success "Docker is running"
}

# Create .env if missing
setup_env() {
    if [ -f ".env" ]; then
        log_success ".env file exists"
        return
    fi

    if [ ! -f ".env.example" ]; then
        log_warning ".env.example not found, creating basic .env"
        cat > .env << EOF
# Komga-Suwayomi Sync Configuration
KOMGA_BASE=http://your-komga-server:25600
KOMGA_USER=your-komga-username
KOMGA_PASS=your-komga-password
SUWA_BASE=http://your-suwayomi-server:4567
SUWA_TOKEN=your-suwayomi-bearer-token
SYNC_INTERVAL_MS=30000
LOG_LEVEL=info
EOF
        log_warning "Please edit .env file with your actual server details"
        return
    fi

    log_info "Creating .env file from template..."
    cp .env.example .env
    log_warning "Please edit .env file with your configuration"
}

# Create necessary directories
create_dirs() {
    log_info "Creating necessary directories..."

    mkdir -p data
    mkdir -p logs

    log_success "Directories created"
}

# Main fix function
main() {
    echo "🔧 Quick Fix for Komga-Suwayomi Sync"
    echo "====================================="
    echo ""

    log_info "Working directory: $(pwd)"

    fix_permissions
    install_docker
    start_docker
    setup_env
    create_dirs

    log_success "Fix completed!"
    echo ""
    echo "Next steps:"
    echo "1. Edit .env file with your server configuration"
    echo "2. Run: ./deploy.sh production"
    echo ""
    echo "If you still have issues:"
    echo "• Check Docker: docker info"
    echo "• View logs: docker compose logs"
    echo "• Get help: ./deploy.sh --help"
}

# Run main function
main "$@"
