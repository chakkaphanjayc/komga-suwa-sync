# Proxmox LXC Quick Setup Guide

## 🚀 One-Command Setup

If you have a Proxmox host ready, you can deploy everything with these commands:

```bash
# 1. Create and configure the LXC container
pct create 100 local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.xz \
    --hostname komga-sync \
    --memory 2048 \
    --cores 2 \
    --net0 name=eth0,bridge=vmbr0,gw=192.168.1.1,ip=192.168.1.100/24 \
    --rootfs local-lvm:20 \
    --swap 1024 \
    --unprivileged 0 \
    --features nesting=1

# 2. Copy the optimized configuration
cp proxmox-lxc.conf /etc/pve/lxc/100.conf

# 3. Start the container
pct start 100

# 4. Enter container and run automated setup
pct enter 100
curl -fsSL https://raw.githubusercontent.com/chakkaphanjayc/komga-suwa-sync/main/proxmox-lxc-setup.sh | bash
```

## 📋 Prerequisites

- Proxmox VE 7.x or 8.x
- Ubuntu 22.04 LXC template downloaded
- Bridge network configured (vmbr0)
- At least 4GB RAM available
- 25GB storage available

## ⚙️ Manual Setup Steps

### Step 1: Create LXC Container

1. **Access Proxmox Web UI**
   - Open https://your-proxmox-ip:8006
   - Login with your credentials

2. **Create New Container**
   - Go to your storage → CT Templates
   - Download `ubuntu-22.04-standard` template
   - Create CT → Select ubuntu-22.04 template
   - Configure:
     - **Hostname**: komga-sync
     - **Password**: Choose a strong password
     - **Storage**: local-lvm or your preferred storage
     - **Disk size**: 20GB minimum
     - **CPU**: 2 cores
     - **Memory**: 2048 MB
     - **Swap**: 1024 MB
     - **Network**: Bridge vmbr0, Static IP

3. **Enable Privileged Mode**
   - Go to container options
   - Set "Unprivileged container" to "No"
   - Enable "Nesting" feature

### Step 2: Configure Container

1. **Copy Configuration**

   ```bash
   cp proxmox-lxc.conf /etc/pve/lxc/<CONTAINER-ID>.conf
   ```

2. **Start Container**

   ```bash
   pct start <CONTAINER-ID>
   ```

3. **Enter Container**
   ```bash
   pct enter <CONTAINER-ID>
   ```

### Step 3: Run Setup Script

```bash
# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/chakkaphanjayc/komga-suwa-sync/main/proxmox-lxc-setup.sh | bash
```

## 🔧 Post-Setup Configuration

### Configure Environment

```bash
cd /opt/komga-suwa-sync
cp .env.example .env
nano .env
```

### Deploy Application

```bash
# Deploy in production mode
./deploy.sh production

# Or use systemd service
systemctl start komga-suwa-sync
```

## 📊 Monitoring & Management

### View Logs

```bash
# Application logs
docker-compose logs -f

# System logs
journalctl -u komga-suwa-sync -f
```

### Resource Monitoring

```bash
# Container resources
pct enter <CONTAINER-ID>
htop

# Docker containers
docker stats
```

### Backup Data

```bash
# Run backup script
cd /opt/komga-suwa-sync
./backup.sh
```

## 🔍 Troubleshooting

### Docker Won't Start

```bash
# Check AppArmor
aa-status | grep lxc

# Check capabilities
capsh --print

# Restart container with debug
pct stop <CONTAINER-ID>
pct start <CONTAINER-ID> --debug
```

### Network Issues

```bash
# Check bridge
brctl show vmbr0

# Check container network
pct enter <CONTAINER-ID>
ip addr show
ping 8.8.8.8
```

### Permission Issues

```bash
# Fix Docker socket permissions
chmod 666 /var/run/docker.sock

# Restart Docker
systemctl restart docker
```

## 🔒 Security Hardening

### Firewall Configuration

```bash
# Allow only necessary ports
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 3000/tcp
ufw --force enable
```

### User Management

```bash
# Create non-root user
useradd -m -s /bin/bash appuser
usermod -aG docker appuser
```

## 📈 Scaling & Performance

### Resource Allocation

```bash
# Increase memory
pct set <CONTAINER-ID> -memory 4096

# Add CPU cores
pct set <CONTAINER-ID> -cores 4
```

### Docker Optimization

```bash
# Limit container resources
docker-compose up -d --scale app=2
```

## 🔄 Updates

### Update Application

```bash
cd /opt/komga-suwa-sync
git pull
docker-compose build --no-cache
docker-compose up -d
```

### Update System

```bash
apt update && apt upgrade -y
pct reboot <CONTAINER-ID>
```

## 📞 Support

If you encounter issues:

1. Check the logs: `docker-compose logs`
2. Verify configuration: `docker-compose config`
3. Test connectivity: `curl localhost:3000`
4. Check Proxmox logs: `pct logs <CONTAINER-ID>`

---

**🎉 Your Komga-Suwayomi Sync is now running in Proxmox LXC!**

Access it at: `http://<CONTAINER-IP>:3000`
