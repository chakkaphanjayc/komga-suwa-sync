# Komga-Suwayomi Sync Service

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Proxmox](https://img.shields.io/badge/Proxmox-0078D4?style=for-the-badge&logo=proxmox&logoColor=white)](https://proxmox.com/)

A bi-directional sync service for synchronizing read progress between Komga and Suwayomi (Tachidesk Server) with a beautiful web dashboard.

## ⚡ Performance Optimizations

This service uses a **dual-sync architecture** for optimal performance:

### 🔄 Event-Based Sync (Frequent)

- **Interval**: Every 30 seconds (configurable)
- **Scope**: Only recently read manga (last 24 hours)
- **Purpose**: Near real-time sync for active reading
- **Performance**: Lightweight, fast updates

### 🔄 Full Library Sync (Periodic)

- **Interval**: Every 6 hours (configurable)
- **Scope**: All mapped manga in your library
- **Purpose**: Comprehensive sync to catch any missed updates
- **Performance**: Thorough but resource-intensive

### 📊 Benefits

- ⚡ **Faster response times** for active reading
- 🔋 **Reduced server load** compared to constant full syncs
- 🎯 **Smart detection** of recently read manga
- 🔄 **Comprehensive coverage** with periodic full syncs

## 🚀 Quick Start with Docker Compose

### Prerequisites

- Docker and Docker Compose installed
- Komga server running and accessible
- Suwayomi (Tachidesk) server running and accessible

### 1. Clone the Repository

```bash
git clone https://github.com/chakkaphanjayc/komga-suwa-sync.git
cd komga-suwa-sync
```

### 2. Configure Environment

Copy the example environment file and edit it with your server details:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Komga Configuration
KOMGA_BASE=http://your-komga-server.com:25600
KOMGA_USER=your-komga-username
KOMGA_PASS=your-komga-password

# Suwayomi Configuration (choose one authentication method)
SUWA_BASE=http://your-suwayomi-server.com:4567
# Option 1: Bearer Token (recommended)
SUWA_TOKEN=your-suwayomi-bearer-token
# Option 2: Basic Authentication
# SUWA_USER=your-suwayomi-username
# SUWA_PASS=your-suwayomi-password

# Sync Configuration
SYNC_INTERVAL_MS=60000          # Sync every 60 seconds
FUZZY_THRESHOLD=0.85           # Title matching sensitivity (0-1)
LOG_LEVEL=info                 # Logging level: error, warn, info, debug
SYNC_DRY_RUN=false             # Set to true for testing without making changes
```

### 3. Deploy with Docker Compose

#### Option A: Quick Development Deployment

```bash
# Build and start the service
docker compose up --build

# Or run in background
docker compose up --build -d
```

#### Option B: Automated Deployment (Recommended)

```bash
# Make scripts executable (Linux/Mac)
chmod +x deploy.sh health-check.sh

# Run deployment script
./deploy.sh development

# Or for production
./deploy.sh production
```

#### Option C: Using Make Commands

```bash
# Initial setup
make setup

# Health check
make health-check

# Development deployment
make dev

# Production deployment
make prod
```

### 4. Access the Dashboard

Open your browser and navigate to: **http://localhost:3000**

## 🐳 Proxmox LXC Deployment

For Proxmox users, we've created specialized deployment tools for running this service in LXC containers with Docker support.

### 🚀 Quick Proxmox Setup

#### Option 1: Automated Setup (Recommended)

```bash
# 1. Create LXC container with Docker support
pct create 100 local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.xz \
    --hostname komga-sync \
    --memory 2048 \
    --cores 2 \
    --net0 name=eth0,bridge=vmbr0,gw=192.168.1.1,ip=192.168.1.100/24 \
    --rootfs local-lvm:20 \
    --swap 1024 \
    --unprivileged 0 \
    --features nesting=1

# 2. Copy optimized configuration
cp proxmox-lxc.conf /etc/pve/lxc/100.conf

# 3. Start container and run automated setup
pct start 100
pct enter 100
curl -fsSL https://raw.githubusercontent.com/chakkaphanjayc/komga-suwa-sync/main/proxmox-lxc-setup.sh | bash
```

#### Option 2: Detailed Manual Setup

For step-by-step instructions, see [PROXMOX-README.md](PROXMOX-README.md) for comprehensive documentation.

### Proxmox LXC Advantages

- **Lightweight**: Minimal resource overhead compared to VMs
- **Efficient**: Shared kernel with host system
- **Integrated**: Built-in Proxmox backup and management
- **Isolated**: Proper network segmentation and security

## 🐳 Docker Commands

### Basic Commands

```bash
# View logs
docker compose logs -f komga-suwa-sync

# Stop the service
docker compose down

# Rebuild after changes
docker compose up --build

# Update the service
docker compose pull && docker compose up --build -d
```

### Advanced Docker Commands

#### Using Make (Recommended)

```bash
# Show all available commands
make help

# Quick development setup
make setup          # Initial setup
make health-check   # Verify configuration
make dev           # Build, start, and show logs

# Production deployment
make prod          # Production deployment
make deploy-prod   # Alternative production command

# Service management
make up            # Start service
make down          # Stop service
make restart       # Restart service
make logs          # Show logs
make rebuild       # Rebuild and restart

# Maintenance
make clean         # Remove all Docker resources
make status        # Show service status
make monitor       # Monitor resource usage
```

#### Using Deployment Scripts

```bash
# Linux/Mac
./deploy.sh development          # Development deployment
./deploy.sh production           # Production deployment
./deploy.sh --skip-build         # Skip build step
./deploy.sh --skip-health-check  # Skip health check

# Windows
deploy.bat development           # Development deployment
deploy.bat production            # Production deployment
```

#### Manual Docker Commands

```bash
# Development
docker compose up --build
docker compose logs -f

# Production
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f

# Health check
docker compose exec komga-suwa-sync curl -f http://localhost:3000/health
```

## 🌐 Web Dashboard Features

### 📊 Dashboard

- Real-time sync statistics
- Service control (start/stop sync)
- Recent activity feed
- Connection status indicators

### ⚙️ Configuration

- Update server settings
- Authentication configuration
- Sync parameters adjustment
- Environment variable management

### 📋 Logs

- Real-time log streaming
- Log filtering and search
- Log level management
- Export functionality

### 🔧 API Debug

- Test API connections
- View API responses
- Debug GraphQL queries
- Endpoint testing tools

### 📚 Mappings

- View series and chapter mappings
- Search and filter mappings
- Manual mapping management
- Sync status overview

## 🚀 Production Deployment

### Production Configuration

For production deployments, use the optimized configuration:

```bash
# Deploy with production settings
make prod

# Or manually
docker compose -f docker-compose.prod.yml up -d --build
```

### Production Features

- **Resource Limits**: CPU and memory limits configured
- **Enhanced Logging**: JSON logging with rotation
- **Security**: Non-root user, minimal attack surface
- **Health Checks**: Comprehensive health monitoring
- **Reverse Proxy**: Optional nginx configuration available

### SSL/HTTPS Setup (Optional)

To enable HTTPS in production:

1. **Using nginx reverse proxy**:

   ```bash
   # Uncomment nginx service in docker-compose.prod.yml
   # Place your SSL certificates in ./ssl directory
   # Update nginx.conf with your domain
   docker compose -f docker-compose.prod.yml up -d
   ```

2. **Using Docker with SSL**:
   ```yaml
   # Add to docker-compose.prod.yml
   services:
     komga-suwa-sync:
       ports:
         - '443:3000'
       environment:
         - HTTPS=true
       volumes:
         - ./ssl:/app/ssl:ro
   ```

### Backup Strategy

```bash
# Backup data directory
make backup-data

# Manual backup
tar -czf "backup-$(date +%Y%m%d-%H%M%S).tar.gz" data/
```

### Monitoring

```bash
# Monitor resource usage
make monitor

# Check service health
curl http://localhost:3000/health

# View detailed logs
make debug-logs
```

## �️ Proxmox LXC Deployment

Deploy this service in a Proxmox LXC container for efficient virtualization with minimal overhead.

### Prerequisites

- Proxmox VE installed and configured
- LXC container with Ubuntu/Debian (recommended: Ubuntu 22.04 LTS)
- Root access to the LXC container
- Network connectivity to Komga and Suwayomi servers

### Step 1: Create and Configure LXC Container

#### Create LXC Container in Proxmox Web UI

1. **Access Proxmox Web Interface**
   - Open your browser and navigate to `https://your-proxmox-server:8006`
   - Login with your credentials

2. **Create New LXC Container**
   - Click **Create CT** (Create Container)
   - Choose your **Node** and **Storage**
   - Select **Ubuntu 22.04 LTS** template
   - Configure resources:
     - **CPU**: 1-2 cores
     - **Memory**: 1024-2048 MB
     - **Disk**: 10-20 GB
     - **Network**: Bridge mode with static IP

3. **Container Configuration**
   ```bash
   # Container ID: 100 (example)
   # Hostname: komga-sync
   # Password: Set a strong password
   ```

#### Enable Docker Support in LXC

**Important**: LXC containers need special configuration to run Docker.

1. **Stop the container**:

   ```bash
   pct stop 100
   ```

2. **Edit container configuration**:

   ```bash
   nano /etc/pve/lxc/100.conf
   ```

3. **Add Docker support** (add these lines):

   ```conf
   # Enable Docker support
   lxc.apparmor.profile: unconfined
   lxc.cap.drop:
   lxc.cgroup.devices.allow: a
   lxc.mount.auto: proc:rw sys:rw
   ```

4. **Start the container**:
   ```bash
   pct start 100
   ```

### Step 2: Prepare LXC Container

#### Connect to Container

```bash
# From Proxmox host
pct enter 100

# Or use SSH if configured
ssh root@<container-ip>
```

#### Update System and Install Dependencies

```bash
# Update package list
apt update && apt upgrade -y

# Install required packages
apt install -y curl wget git vim htop

# Install Docker
curl -fsSL https://get.docker.com | sh

# Add user to docker group (if needed)
usermod -aG docker root

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version
```

### Step 3: Deploy the Application

#### Clone Repository

```bash
# Create application directory
mkdir -p /opt/komga-suwa-sync
cd /opt/komga-suwa-sync

# Clone the repository
git clone https://github.com/chakkaphanjayc/komga-suwa-sync.git .
```

#### Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit environment file
nano .env
```

**Configure your environment variables**:

```env
# =================================================================
# Komga-Suwayomi Sync Service Configuration
# =================================================================

# =================================================================
# Komga Server Configuration
# =================================================================
KOMGA_BASE=http://your-komga-server:25600
KOMGA_USER=your-komga-username
KOMGA_PASS=your-komga-password

# =================================================================
# Suwayomi Server Configuration
# =================================================================
SUWA_BASE=http://your-suwayomi-server:4567
SUWA_TOKEN=your-suwayomi-bearer-token

# =================================================================
# Sync Configuration
# =================================================================
EVENT_SYNC_INTERVAL_MS=30000
FULL_SYNC_INTERVAL_MS=21600000
RECENT_READ_HOURS=24
FUZZY_THRESHOLD=0.85
LOG_LEVEL=info
SYNC_DRY_RUN=false
```

#### Deploy with Docker Compose

```bash
# Make scripts executable
chmod +x deploy.sh health-check.sh

# Run health check
./health-check.sh

# Deploy the application
./deploy.sh production
```

### Step 4: Configure Networking

#### Proxmox Network Configuration

1. **Access Proxmox Web UI**
2. **Navigate to your LXC container**
3. **Go to Network tab**
4. **Configure network settings**:
   - **Bridge**: vmbr0 (or your bridge)
   - **IPv4/CIDR**: Static IP (e.g., 192.168.1.100/24)
   - **Gateway**: Your gateway IP
   - **DNS**: Your DNS servers

#### Firewall Configuration (Optional)

If you have Proxmox firewall enabled:

```bash
# Allow port 3000 for the sync service
# In Proxmox Web UI: Container → Firewall → Add rule
# Direction: in, Action: ACCEPT, Protocol: tcp, Destination port: 3000
```

### Step 5: Access the Application

#### From Local Network

- **URL**: `http://<container-ip>:3000`
- **Example**: `http://192.168.1.100:3000`

#### From External Access (Optional)

To access from outside your network:

1. **Port Forwarding** on your router:
   - External Port: 3000 → Internal IP: `<container-ip>:3000`

2. **Or use Proxmox reverse proxy**:

   ```bash
   # Install nginx on Proxmox host
   apt install nginx

   # Configure reverse proxy
   cat > /etc/nginx/sites-available/komga-sync << EOF
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://<container-ip>:3000;
           proxy_set_header Host \$host;
           proxy_set_header X-Real-IP \$remote_addr;
           proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto \$scheme;
       }
   }
   EOF

   # Enable site
   ln -s /etc/nginx/sites-available/komga-sync /etc/nginx/sites-enabled/
   systemctl reload nginx
   ```

### Step 6: Monitoring and Maintenance

#### System Monitoring

```bash
# Monitor container resources
pct monitor 100

# Check Docker containers
docker ps

# View application logs
docker compose logs -f komga-suwa-sync
```

#### Backup Strategy

```bash
# Create backup script
cat > /opt/backup-komga-sync.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="komga-sync_$DATE"

mkdir -p $BACKUP_DIR

# Stop services
cd /opt/komga-suwa-sync
docker compose down

# Backup data
tar -czf $BACKUP_DIR/$BACKUP_NAME.tar.gz data/ .env

# Start services
docker compose up -d

echo "Backup completed: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
EOF

chmod +x /opt/backup-komga-sync.sh

# Schedule daily backups (add to crontab)
echo "0 2 * * * /opt/backup-komga-sync.sh" | crontab -
```

#### Update Procedure

```bash
# Update the application
cd /opt/komga-suwa-sync

# Backup current version
git tag backup-$(date +%Y%m%d)

# Pull latest changes
git pull

# Rebuild and deploy
./deploy.sh production --skip-health-check
```

### Proxmox LXC-Specific Configuration

#### Resource Management

```bash
# Adjust container resources via Proxmox Web UI
# Container → Resources tab

# Or via command line
pct set 100 -cores 2 -memory 2048 -swap 1024
```

#### Storage Configuration

```bash
# Add additional storage for data persistence
# In Proxmox Web UI: Container → Resources → Add → Storage

# Mount point: /opt/komga-suwa-sync/data
# Size: 50GB (adjust as needed)
```

#### High Availability (Optional)

```bash
# Enable container backup
# In Proxmox Web UI: Container → Backup → Enable daily backup

# Configure backup retention
# Backup → Retention: Keep 7 daily backups
```

### Troubleshooting Proxmox LXC Issues

#### Docker Not Starting

```bash
# Check LXC configuration
cat /etc/pve/lxc/100.conf

# Restart container with new configuration
pct stop 100
pct start 100

# Check Docker service
pct enter 100
systemctl status docker
```

#### Network Issues

```bash
# Check network configuration
pct enter 100
ip addr show
ping -c 3 google.com

# Check Proxmox network
ip addr show vmbr0
```

#### Permission Issues

```bash
# Fix Docker socket permissions
pct enter 100
chmod 666 /var/run/docker.sock

# Or add user to docker group
usermod -aG docker $USER
```

#### Performance Issues

```bash
# Monitor container performance
pct enter 100
htop

# Check Docker stats
docker stats

# Adjust container resources
pct set 100 -cpuunits 1024 -memory 1024
```

### Security Considerations

#### Container Hardening

```bash
# Enable AppArmor (if supported)
pct enter 100
apt install apparmor apparmor-utils
systemctl enable apparmor
systemctl start apparmor
```

#### Network Security

```bash
# Configure firewall in container
pct enter 100
apt install ufw
ufw enable
ufw allow 3000/tcp
ufw allow ssh
```

#### Data Encryption

```bash
# Encrypt sensitive data
pct enter 100
apt install cryptsetup

# Create encrypted directory for sensitive data
mkdir /opt/encrypted
cryptsetup luksFormat /dev/mapper/encrypted-data
```

### Migration and Scaling

#### Migrate to Different Node

```bash
# Stop container
pct stop 100

# Migrate to different node
pct migrate 100 target-node

# Start container
pct start 100
```

#### Horizontal Scaling (Advanced)

```bash
# Create multiple instances
pct clone 100 101 --name komga-sync-2
pct start 101

# Use load balancer (nginx)
# Configure nginx to distribute traffic between instances
```

### Proxmox LXC Advantages

- **Lightweight**: Minimal resource overhead compared to VMs
- **Fast deployment**: Quick container creation and startup
- **Easy management**: Proxmox Web UI for container management
- **Resource efficient**: Shared kernel with host system
- **Backup integration**: Built-in Proxmox backup system
- **Network isolation**: Proper network segmentation

### Proxmox LXC Limitations

- **Kernel dependency**: Must use host kernel
- **Limited customization**: Less flexible than VMs
- **Docker complexity**: Requires special configuration for Docker
- **Storage limitations**: Dependent on host storage

---

**🎉 Your Komga-Suwayomi Sync service is now running in Proxmox LXC!**

Access it at: `http://<container-ip>:3000`

## 🛠️ API Endpoints

The service exposes a REST API for integration:

### Core Endpoints

- `GET /health` - Health check
- `GET /api/stats` - Sync statistics
- `GET /api/config` - Current configuration
- `POST /api/config/:type` - Update configuration
- `GET /api/test-connections` - Test server connections

### Sync Endpoints

- `POST /api/sync-komga-progress` - Sync Komga progress
- `POST /api/sync-suwa-progress` - Sync Suwayomi progress
- `POST /manual-sync` - Trigger full manual sync
- `POST /manual-event-sync` - Trigger event-based sync only
- `POST /manual-full-sync` - Trigger full library sync only

### Mapping Endpoints

### Mapping Endpoints

- `GET /api/mappings/*` - Mapping management endpoints

## ⚡ Performance Optimizations

### Dual Sync System

The service implements a dual sync architecture for optimal performance:

#### Event-Based Sync (Frequent)

- **Interval**: Every 30 seconds (configurable)
- **Scope**: Only recently read manga (within last 24 hours)
- **Purpose**: Real-time progress synchronization
- **API Calls**: Minimal, targeted updates

#### Full Library Sync (Periodic)

- **Interval**: Every 6 hours (configurable)
- **Scope**: Complete library scan
- **Purpose**: Comprehensive data synchronization
- **API Calls**: Full coverage, resource intensive

### Recently Read Detection

- Tracks last read timestamps for both Komga and Suwayomi
- Automatically identifies manga read within configurable window
- Reduces unnecessary API calls by 90%+ for frequent syncs
- Maintains data integrity through periodic full scans

### Configuration Options

```bash
# Event-based sync settings
SYNC_EVENT_INTERVAL=30000          # 30 seconds
SYNC_RECENT_WINDOW=86400000       # 24 hours (recent read window)

# Full sync settings
SYNC_FULL_INTERVAL=21600000        # 6 hours
SYNC_FULL_ENABLED=true            # Enable/disable full sync
```

## 🗄️ Database Schema

### Enhanced Schema for Performance

The database schema has been enhanced to support performance optimizations:

```sql
-- Chapter mappings table with read tracking
CREATE TABLE chapter_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    komga_series_id TEXT NOT NULL,
    komga_chapter_id TEXT NOT NULL,
    suwa_series_id TEXT NOT NULL,
    suwa_chapter_id TEXT NOT NULL,
    last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_komga TIMESTAMP,           -- NEW: Last read in Komga
    last_read_suwa TIMESTAMP,            -- NEW: Last read in Suwayomi
    UNIQUE(komga_series_id, komga_chapter_id),
    UNIQUE(suwa_series_id, suwa_chapter_id)
);

-- Series mappings table with read tracking
CREATE TABLE series_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    komga_series_id TEXT NOT NULL,
    suwa_series_id TEXT NOT NULL,
    last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_komga TIMESTAMP,           -- NEW: Last read in Komga
    last_read_suwa TIMESTAMP,            -- NEW: Last read in Suwayomi
    UNIQUE(komga_series_id),
    UNIQUE(suwa_series_id)
);
```

### Migration Notes

- Existing databases will be automatically migrated on first run
- New `last_read_*` fields track reading activity for performance optimization
- No data loss during migration process

## 🔧 Troubleshooting

### Performance Issues

- **Event sync not triggering**: Check `SYNC_EVENT_INTERVAL` is set correctly
- **Full sync too frequent**: Adjust `SYNC_FULL_INTERVAL` (in milliseconds)
- **High API usage**: Verify `SYNC_RECENT_WINDOW` isn't too large
- **Recently read not detected**: Check timestamp accuracy between servers

### Sync Mode Issues

- **Only full sync running**: Ensure `SYNC_FULL_ENABLED=true`
- **Event sync running too often**: Increase `SYNC_EVENT_INTERVAL`
- **Missing progress updates**: Check recently read detection window

### Database Issues

- **Migration errors**: Check database file permissions
- **Read timestamps not updating**: Verify API connectivity to both servers
- **Performance degradation**: Consider database optimization or interval adjustments

### Logs and Monitoring

```bash
# Check sync mode in logs
tail -f logs/app.log | grep "Sync mode"

# Monitor API call frequency
tail -f logs/app.log | grep "API call"

# View performance metrics
curl http://localhost:3000/api/stats
```

## 📝 Changelog

### v2.1.0 - Performance Optimization Release

- ✨ **Dual Sync System**: Implemented event-based sync (30s) + periodic full sync (6h)
- 🗄️ **Enhanced Database Schema**: Added `last_read_*` fields for read tracking
- ⚡ **Performance Improvements**: 90%+ reduction in API calls for frequent syncs
- 🔧 **New API Endpoints**: Manual event sync and full sync triggers
- ⚙️ **Configurable Intervals**: Flexible sync timing via environment variables
- 📊 **Enhanced Monitoring**: Sync mode identification in logs and stats
- 🔄 **Automatic Migration**: Seamless database schema updates

### Previous Versions

- v2.0.0 - Web UI and real-time updates
- v1.5.0 - Docker support and configuration management
- v1.0.0 - Initial Komga-Suwayomi sync functionality

## � Docker Best Practices

### Security

- **Non-root user**: Application runs as non-root user (appuser)
- **Minimal base image**: Uses slim Node.js image
- **No secrets in image**: Environment variables mounted at runtime
- **Resource limits**: Production deployment includes CPU/memory limits

### Performance

- **Multi-stage builds**: Optimized Dockerfile with separate build stage
- **Layer caching**: Dependencies installed in separate layer
- **Health checks**: Automatic health monitoring
- **Log rotation**: Prevents log files from consuming disk space

### Reliability

- **Restart policies**: Services restart automatically on failure
- **Health checks**: Services only marked healthy when fully ready
- **Graceful shutdown**: Proper signal handling
- **Volume persistence**: Data persists across container restarts

## 🔧 Troubleshooting

### Connection Issues

- ✅ Verify server URLs and ports are correct
- ✅ Check authentication credentials
- ✅ Ensure servers are running and accessible
- ✅ Test connections via the web dashboard

### Sync Issues

- 📋 Check logs for detailed error messages
- 🔍 Verify manga titles match between platforms
- ⚙️ Adjust fuzzy matching threshold if needed
- 🧪 Use dry run mode to test without making changes

### Docker Issues

- 🔄 Restart the container: `docker-compose restart`
- 📊 Check container logs: `docker-compose logs komga-suwa-sync`
- 🔧 Rebuild if needed: `docker-compose up --build`
- 🧹 Clean up: `docker system prune` (removes unused resources)

### Performance Issues

- **High CPU usage**: Check `docker stats` and adjust resource limits
- **Slow sync**: Verify network connectivity to Komga/Suwayomi servers
- **Large logs**: Use `make clean` to remove old containers
- **Disk space**: Monitor `./data` directory size

### Common Docker Commands

```bash
# Debug container
docker compose exec komga-suwa-sync /bin/sh

# View container info
docker compose ps
docker compose top

# Network debugging
docker network ls
docker network inspect komga-suwa-sync_sync-network

# Volume management
docker volume ls
docker volume inspect komga-suwa-sync_data
```

## 📁 Project Structure

```
komga-suwa-sync/
├── src/                    # TypeScript source code
│   ├── index.ts           # Main server file
│   ├── clients/           # API clients for Komga and Suwayomi
│   ├── core/              # Core sync logic
│   └── utils/             # Utility functions
├── public/                 # Static web assets
│   ├── index.html         # Main dashboard
│   ├── css/               # Stylesheets
│   └── js/                # Client-side JavaScript
├── data/                   # SQLite database (auto-created)
├── dist/                   # Compiled JavaScript (build output)
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile             # Docker build configuration
├── .env.example           # Environment variables template
└── README.md              # This file
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Komga](https://komga.org/) - Comic/manga media server
- [Suwayomi](https://github.com/Suwayomi/Suwayomi-Server) - Tachidesk Server
- Docker community for containerization best practices

---

**Happy Reading! 📚**
