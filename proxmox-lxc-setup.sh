#!/bin/bash

# =================================================================
# Proxmox LXC Setup Script for Komga-Suwayomi Sync
# =================================================================
# This script helps set up the LXC container for Docker deployment
# Run this script inside the LXC container after creation

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

# Check if running in LXC container
check_lxc() {
    log_info "Checking if running in LXC container..."

    if [ ! -f /proc/1/environ ] || ! grep -q "container=lxc" /proc/1/environ; then
        log_warning "This script is designed for LXC containers."
        log_warning "Some features may not work correctly outside LXC."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        log_success "Running in LXC container"
    fi
}

# Update system
update_system() {
    log_info "Updating system packages..."

    apt update
    apt upgrade -y
    apt autoremove -y
    apt autoclean

    log_success "System updated"
}

# Install required packages
install_packages() {
    log_info "Installing required packages..."

    # Basic tools
    apt install -y curl wget git vim htop net-tools

    # Docker dependencies
    apt install -y apt-transport-https ca-certificates gnupg lsb-release

    log_success "Packages installed"
}

# Install Docker
install_docker() {
    log_info "Installing Docker..."

    # Install Docker using official script
    curl -fsSL https://get.docker.com | sh

    # Start and enable Docker service
    systemctl start docker
    systemctl enable docker

    # Add current user to docker group
    usermod -aG docker root

    log_success "Docker installed and configured"
}

# Install Docker Compose
install_docker_compose() {
    log_info "Installing Docker Compose..."

    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose

    # Create symlink for compatibility
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

    log_success "Docker Compose installed"
}

# Configure Docker for LXC
configure_docker_lxc() {
    log_info "Configuring Docker for LXC environment..."

    # Create Docker daemon configuration
    cat > /etc/docker/daemon.json << EOF
{
    "storage-driver": "overlay2",
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "iptables": false,
    "bridge": "none"
}
EOF

    # Restart Docker service
    systemctl restart docker

    log_success "Docker configured for LXC"
}

# Setup application directory
setup_app_directory() {
    log_info "Setting up application directory..."

    # Create application directory
    mkdir -p /opt/komga-suwa-sync
    cd /opt/komga-suwa-sync

    # Clone repository
    if [ ! -d ".git" ]; then
        git clone https://github.com/chakkaphanjayc/komga-suwa-sync.git .
    else
        log_info "Repository already exists, pulling latest changes..."
        git pull
    fi

    # Set proper permissions
    chown -R root:root /opt/komga-suwa-sync

    log_success "Application directory ready"
}

# Create systemd service for auto-start
create_systemd_service() {
    log_info "Creating systemd service for auto-start..."

    cat > /etc/systemd/system/komga-suwa-sync.service << EOF
[Unit]
Description=Komga-Suwayomi Sync Service
After=docker.service network.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/komga-suwa-sync
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
ExecReload=/usr/local/bin/docker-compose up -d --build
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable komga-suwa-sync

    log_success "Systemd service created"
}

# Configure firewall
configure_firewall() {
    log_info "Configuring firewall..."

    # Install UFW if not present
    apt install -y ufw

    # Configure UFW
    ufw --force enable
    ufw allow ssh
    ufw allow 3000/tcp

    log_success "Firewall configured"
}

# Setup monitoring
setup_monitoring() {
    log_info "Setting up basic monitoring..."

    # Install monitoring tools
    apt install -y iotop sysstat

    # Enable sysstat
    sed -i 's/ENABLED="false"/ENABLED="true"/' /etc/default/sysstat
    systemctl enable sysstat
    systemctl start sysstat

    log_success "Monitoring tools installed"
}

# Create backup script
create_backup_script() {
    log_info "Creating backup script..."

    cat > /opt/komga-suwa-sync/backup.sh << 'EOF'
#!/bin/bash
# Backup script for Komga-Suwayomi Sync

BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="komga-sync_$DATE"

mkdir -p $BACKUP_DIR

echo "Creating backup: $BACKUP_NAME"

# Stop services
cd /opt/komga-suwa-sync
docker-compose down

# Backup data and configuration
tar -czf $BACKUP_DIR/$BACKUP_NAME.tar.gz data/ .env

# Start services
docker-compose up -d

echo "Backup completed: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
echo "Backup size: $(du -h $BACKUP_DIR/$BACKUP_NAME.tar.gz | cut -f1)"
EOF

    chmod +x /opt/komga-suwa-sync/backup.sh

    # Create backups directory
    mkdir -p /opt/backups

    log_success "Backup script created"
}

# Display completion message
show_completion() {
    log_success "Proxmox LXC setup completed!"
    echo ""
    echo "Next steps:"
    echo "1. Configure your environment:"
    echo "   cd /opt/komga-suwa-sync"
    echo "   cp .env.example .env"
    echo "   nano .env"
    echo ""
    echo "2. Run health check:"
    echo "   ./health-check.sh"
    echo ""
    echo "3. Deploy the application:"
    echo "   ./deploy.sh production"
    echo ""
    echo "4. Access the application:"
    echo "   http://$(hostname -I | awk '{print $1}'):3000"
    echo ""
    echo "Useful commands:"
    echo "• Start service:  systemctl start komga-suwa-sync"
    echo "• Stop service:   systemctl stop komga-suwa-sync"
    echo "• View logs:      docker-compose logs -f"
    echo "• Backup data:    ./backup.sh"
    echo ""
}

# Main setup function
main() {
    echo "🚀 Proxmox LXC Setup for Komga-Suwayomi Sync"
    echo "=============================================="
    echo ""

    check_lxc
    update_system
    install_packages
    install_docker
    install_docker_compose
    configure_docker_lxc
    setup_app_directory
    create_systemd_service
    configure_firewall
    setup_monitoring
    create_backup_script
    show_completion
}

# Run main function
main "$@"
