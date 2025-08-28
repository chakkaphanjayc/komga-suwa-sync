#!/bin/bash

# =================================================================
# Komga-Suwayomi Sync - Linux Setup Script
# =================================================================
# This script helps set up the environment on Linux systems
# Run this before using deploy.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if running on Linux
check_linux() {
    if [ ! -f "/etc/os-release" ]; then
        log_error "This setup script is designed for Linux systems"
        exit 1
    fi
    log_success "Running on Linux system"
}

# Set executable permissions
set_permissions() {
    log_info "Setting executable permissions..."

    chmod +x deploy.sh
    chmod +x health-check.sh
    chmod +x backup.sh

    if [ -f "deploy.bat" ]; then
        chmod +x deploy.bat
    fi
    if [ -f "health-check.bat" ]; then
        chmod +x health-check.bat
    fi

    log_success "Permissions set"
}

# Install Docker if not present
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

# Create .env file if it doesn't exist
setup_env() {
    if [ -f ".env" ]; then
        log_success ".env file already exists"
        return
    fi

    if [ ! -f ".env.example" ]; then
        log_error ".env.example not found"
        return
    fi

    log_info "Creating .env file from template..."
    cp .env.example .env
    log_warning "Please edit .env file with your configuration before running deploy.sh"
    log_info "You can edit it with: nano .env"
}

# Create necessary directories
create_directories() {
    log_info "Creating necessary directories..."

    mkdir -p data
    mkdir -p logs

    log_success "Directories created"
}

# Main setup function
main() {
    echo "🚀 Komga-Suwayomi Sync - Linux Setup"
    echo "====================================="
    echo ""

    check_linux
    set_permissions
    install_docker
    setup_env
    create_directories

    log_success "Setup completed!"
    echo ""
    echo "Next steps:"
    echo "1. Edit .env file with your configuration: nano .env"
    echo "2. Run deployment: ./deploy.sh production"
    echo ""
    echo "Useful commands:"
    echo "• Deploy development: ./deploy.sh development"
    echo "• View logs: docker compose logs -f"
    echo "• Stop services: docker compose down"
    echo "• Health check: ./health-check.sh"
}

# Run main function
main "$@"
