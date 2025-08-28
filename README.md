# Komga-Suwayomi Sync Service

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

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

## 📋 Environment Variables

| Variable                 | Description                                        | Required   | Default       |
| ------------------------ | -------------------------------------------------- | ---------- | ------------- |
| `KOMGA_BASE`             | Komga server URL with port                         | Yes        | -             |
| `KOMGA_USER`             | Komga username                                     | Yes        | -             |
| `KOMGA_PASS`             | Komga password                                     | Yes        | -             |
| `SUWA_BASE`              | Suwayomi server URL with port                      | Yes        | -             |
| `SUWA_USER`              | Suwayomi username (basic auth)                     | Optional\* | -             |
| `SUWA_PASS`              | Suwayomi password (basic auth)                     | Optional\* | -             |
| `EVENT_SYNC_INTERVAL_MS` | Event-based sync interval (frequent updates)       | No         | 30000 (30s)   |
| `FULL_SYNC_INTERVAL_MS`  | Full library sync interval (comprehensive updates) | No         | 21600000 (6h) |
| `RECENT_READ_HOURS`      | Hours to look back for recently read manga         | No         | 24            |
| `SYNC_INTERVAL_MS`       | Legacy sync interval (backward compatibility)      | No         | 60000 (1min)  |
| `FUZZY_THRESHOLD`        | Fuzzy matching threshold (0-1)                     | No         | 0.85          |
| `LOG_LEVEL`              | Logging level                                      | No         | info          |
| `SYNC_DRY_RUN`           | Enable dry run mode                                | No         | false         |

### 3. Verify Your Configuration

Before deploying, run the health check script to verify your setup:

```bash
# Linux/macOS
./health-check.sh

# Windows
health-check.bat
```

This script will:

- ✅ Check if Docker is running
- ✅ Verify configuration files exist
- ✅ Validate environment variables
- ✅ Test server connectivity
- ✅ Create necessary directories

### 4. Deploy with Docker Compose

```bash
# Build and start the service
docker-compose up --build

# Or run in background
docker-compose up --build -d
```

### 4. Access the Dashboard

Open your browser and navigate to: **http://localhost:3000**

## 🐳 Docker Commands

```bash
# View logs
docker-compose logs -f komga-suwa-sync

# Stop the service
docker-compose down

# Rebuild after changes
docker-compose up --build

# Update the service
docker-compose pull && docker-compose up --build -d
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

## 🔧 Development Setup

If you prefer to run without Docker:

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Start the service
npm start

# Or run in development mode with auto-reload
npm run dev
```

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

## 🔍 Troubleshooting

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
