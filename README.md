# Komga-Suwayomi Sync Service

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A bi-directional sync service for synchronizing read progress between Komga and Suwayomi (Tachidesk Server) with a beautiful web dashboard.

## ✨ Features

- **🔄 Bi-directional Sync**: Automatically syncs read progress between both platforms
- **🌐 Web Dashboard**: Modern, responsive web interface for configuration and monitoring
- **📊 Real-time Updates**: Live logging and status updates via WebSocket
- **🎯 Smart Matching**: Intelligent title matching with configurable fuzzy threshold
- **🐳 Docker Ready**: Easy deployment with Docker Compose
- **🔒 Secure**: Environment-based configuration with secure credential management
- **📈 Progress Tracking**: Detailed sync statistics and progress monitoring

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

## 📋 Environment Variables

| Variable           | Description                    | Required   | Default |
| ------------------ | ------------------------------ | ---------- | ------- |
| `KOMGA_BASE`       | Komga server URL with port     | Yes        | -       |
| `KOMGA_USER`       | Komga username                 | Yes        | -       |
| `KOMGA_PASS`       | Komga password                 | Yes        | -       |
| `SUWA_BASE`        | Suwayomi server URL with port  | Yes        | -       |
| `SUWA_USER`        | Suwayomi username (basic auth) | Optional\* | -       |
| `SUWA_PASS`        | Suwayomi password (basic auth) | Optional\* | -       |
| `SYNC_INTERVAL_MS` | Sync interval in milliseconds  | No         | 60000   |
| `FUZZY_THRESHOLD`  | Fuzzy matching threshold (0-1) | No         | 0.85    |
| `LOG_LEVEL`        | Logging level                  | No         | info    |
| `SYNC_DRY_RUN`     | Enable dry run mode            | No         | false   |

\*Either `SUWA_TOKEN` or both `SUWA_USER`/`SUWA_PASS` must be provided

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

- `GET /health` - Health check
- `GET /api/stats` - Sync statistics
- `GET /api/config` - Current configuration
- `POST /api/config/:type` - Update configuration
- `GET /api/test-connections` - Test server connections
- `POST /api/sync-komga-progress` - Sync Komga progress
- `POST /api/sync-suwa-progress` - Sync Suwayomi progress
- `GET /api/mappings/*` - Mapping management endpoints

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
