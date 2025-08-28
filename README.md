# Komga-Suwayomi Sync Service

A bi-directional sync service for synchronizing read progress between Komga and Suwayomi (Tachidesk Server).

## Features

- **Bi-directional Sync**: Automatically syncs read progress between both platforms
- **Web Dashboard**: Comprehensive web interface for configuration and monitoring
- **Real-time Updates**: Live logging and status updates via WebSocket
- **Fuzzy Matching**: Intelligent title matching with configurable threshold
- **Docker Support**: Easy deployment with Docker Compose

## Quick Start

1. **Clone and setup:**

   ```bash
   git clone <repository-url>
   cd komga-suwa-sync
   cp .env.example .env
   ```

2. **Configure environment:**
   Edit `.env` with your server details:

   ```env
   KOMGA_BASE=https://your-komga-server.com
   KOMGA_USER=your-username
   KOMGA_PASS=your-password

   SUWA_BASE=https://your-suwayomi-server.com
   SUWA_TOKEN=your-token
   # Or use basic auth:
   SUWA_USER=username
   SUWA_PASS=password
   ```

3. **Install and run:**

   ```bash
   npm install
   npm run build
   npm start
   ```

4. **Access dashboard:**
   Open `http://localhost:3000` in your browser

## Environment Variables

| Variable           | Description                           | Required                     |
| ------------------ | ------------------------------------- | ---------------------------- |
| `KOMGA_BASE`       | Komga server URL                      | Yes                          |
| `KOMGA_USER`       | Komga username                        | Yes                          |
| `KOMGA_PASS`       | Komga password                        | Yes                          |
| `SUWA_BASE`        | Suwayomi server URL                   | Yes                          |
| `SUWA_TOKEN`       | Suwayomi bearer token                 | Optional\*                   |
| `SUWA_USER`        | Suwayomi username (basic auth)        | Optional\*                   |
| `SUWA_PASS`        | Suwayomi password (basic auth)        | Optional\*                   |
| `SYNC_INTERVAL_MS` | Sync interval in milliseconds         | No (default: 60000)          |
| `FUZZY_THRESHOLD`  | Fuzzy matching threshold (0-1)        | No (default: 0.85)           |
| `DB_PATH`          | SQLite database path                  | No (default: ./data/sync.db) |
| `LOG_LEVEL`        | Logging level (error/warn/info/debug) | No (default: info)           |
| `SYNC_DRY_RUN`     | Enable dry run mode                   | No (default: false)          |

\*Either `SUWA_TOKEN` or both `SUWA_USER`/`SUWA_PASS` must be provided

## Docker Deployment

```bash
docker-compose up --build
```

## Web Dashboard

The service includes a comprehensive web dashboard with:

### Dashboard Tab

- Real-time sync statistics
- Service control (start/stop sync)
- Recent activity feed
- Connection testing

### Configuration Tab

- Update server settings
- Authentication configuration
- Sync parameters

### Logs Tab

- Real-time log streaming
- Log filtering and search
- Log management

### API Debug Tab

- Test API connections
- View API responses
- Debug GraphQL queries

### Mappings Tab

- View series and chapter mappings
- Search and filter mappings
- Manual mapping management

## Development

```bash
# Development mode with auto-reload
npm run dev

# Run initial matching only
npm run dev -- --match

# Run tests
npm test

# Run linter
npm run lint

# Format code
npm run format
```

## API Endpoints

The service exposes several REST endpoints:

- `GET /health` - Health check
- `GET /api/stats` - Sync statistics
- `GET /api/config` - Current configuration
- `POST /api/config/:type` - Update configuration
- `GET /api/test-connections` - Test server connections
- `POST /api/sync-komga-progress` - Sync Komga progress
- `POST /api/sync-suwa-progress` - Sync Suwayomi progress
- `GET /api/mappings/*` - Mapping management

## Troubleshooting

### Connection Issues

- Verify server URLs and ports are correct
- Check authentication credentials
- Ensure servers are running and accessible
- Test connections via the web dashboard

### Sync Issues

- Check logs for detailed error messages
- Verify manga titles match between platforms
- Adjust fuzzy matching threshold if needed
- Use dry run mode to test without making changes

### Performance

- Large libraries may need longer sync intervals
- Monitor database size and performance
- Adjust log levels to reduce noise

## Limitations

- Fuzzy matching may not work for all title variations
- Requires both servers to be accessible from the sync service
- SQLite database may need optimization for very large libraries

## License

MIT License
