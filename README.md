# Komga-Suwayomi Sync Service

This service synchronizes read progress between Komga and Suwayomi (Tachidesk Server) in a bi-directional manner.

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in the values
3. Run `npm install`
4. Run `npm run build`
5. Run `npm start` or use Docker

## Environment Variables

- `KOMGA_BASE`: Komga base URL
- `KOMGA_USER`: Komga username
- `KOMGA_PASS`: Komga password
- `SUWA_BASE`: Suwayomi base URL
- `SUWA_TOKEN`: Optional Suwayomi token
- `SYNC_INTERVAL_MS`: Sync interval in milliseconds
- `FUZZY_THRESHOLD`: Fuzzy matching threshold
- `DB_PATH`: SQLite database path
- `LOG_LEVEL`: Logging level
- `SYNC_DRY_RUN`: Set to true for dry run mode

## Docker

Build and run with Docker:

```bash
docker-compose up --build
```

## Limitations

- Suwayomi does not support page progress, only read/unread status
- Fuzzy matching may not work for all title variations

## Web Dashboard

The service now includes a comprehensive web-based dashboard for easy configuration and monitoring:

### Features

- **Real-time Dashboard**: View sync statistics, recent activity, and system status
- **Configuration Management**: Update Komga and Suwayomi settings through the web interface
- **Live Logging**: Monitor sync process logs in real-time with filtering options
- **API Debugging**: Test connections and view API responses from both servers
- **Mapping Management**: View and search through series and chapter mappings
- **Sync Control**: Start/stop sync service and run manual matching

### Accessing the Dashboard

1. Start the service: `npm run dev`
2. Open your browser to: `http://localhost:3000`
3. The dashboard will be available with all features enabled

### Dashboard Sections

#### 1. Dashboard Tab

- **Statistics**: Series mappings, chapter mappings, sync cycles, error counts
- **Control Panel**: Start/stop sync, run initial match, test connections
- **Recent Activity**: Real-time activity feed of sync operations

#### 2. Configuration Tab

- **Komga Settings**: Base URL, username, password
- **Suwayomi Settings**: Base URL with choice between:
  - **Bearer Token**: Secure token-based authentication
  - **Basic Auth**: Username/password authentication
- **Sync Settings**: Interval, fuzzy threshold, log level, dry run mode

#### 3. Logs Tab

- **Real-time Logging**: Live log streaming from the sync process
- **Log Filtering**: Filter by log level (error, warn, info, debug)
- **Log Management**: Clear logs, download log files

#### 4. API Debug Tab

- **Connection Status**: Real-time connection status for both servers
- **API Testing**: Test individual API endpoints
- **Quick Tests**: Pre-built tests for common operations
- **Response Viewer**: View formatted API responses

#### 5. Mappings Tab

- **Series Mappings**: View all matched series between Komga and Suwayomi
- **Chapter Mappings**: View all matched chapters with sync status
- **Search Functionality**: Search through mappings by title or ID

### WebSocket Integration

The dashboard uses WebSocket connections for real-time updates:

- Live log streaming
- Real-time statistics updates
- Sync status notifications
- Activity feed updates

### Security Note

The web dashboard currently runs without authentication. For production use, consider:

- Adding authentication middleware
- Using HTTPS in production
- Restricting access to localhost only
- Implementing user sessions

## Environment Setup Guide

Based on research of the Suwayomi Server, Tachiyomi extension, and Komga repositories, here's how to set up your environment for syncing:

### Suwayomi Server Setup

**Installation Options:**

1. **Docker (Recommended):**

   ```bash
   docker run -d -p 4567:4567 --name suwayomi-server \
     -v suwayomi-data:/home/suwayomi/.local/share/Tachidesk \
     ghcr.io/suwayomi/tachidesk:latest
   ```

2. **Direct Download:**
   - Download from: https://github.com/Suwayomi/Suwayomi-Server/releases
   - Supports Windows, macOS, Linux
   - Includes bundled WebUI

3. **Other Methods:**
   - Arch Linux: `yay -S tachidesk`
   - Ubuntu/Debian: PPA available
   - NixOS: `services.suwayomi-server` module

**Default Access:**

- Web UI: http://localhost:4567
- GraphQL API: http://localhost:4567/api/graphql
- No authentication by default (can be configured)

### Komga Server Setup

**Installation Options:**

1. **Docker:**

   ```bash
   docker run -d -p 25600:8080 --name komga \
     -v komga-data:/config \
     -v /path/to/manga:/data \
     gotson/komga
   ```

2. **Direct Download:**
   - Download JAR from: https://github.com/gotson/komga/releases
   - Requires Java 17+
   - Run: `java -jar komga.jar`

**Default Access:**

- Web UI: http://localhost:25600
- REST API: http://localhost:25600/api/v1
- Default credentials: admin/admin (change on first login)

### Suwayomi Authentication

Suwayomi Server supports two authentication methods:

#### 1. Bearer Token Authentication (Default)

- Set `SUWA_TOKEN` environment variable with your token
- Obtain token from Suwayomi Web UI → Settings → Authentication
- More secure for API access

#### 2. Basic Authentication (New)

- Set `SUWA_USER` and `SUWA_PASS` environment variables
- Uses standard HTTP Basic Authentication
- Useful when token-based auth is not available

**Note:** You can only use one authentication method at a time. If both are configured, Bearer token takes precedence.

### Tachiyomi Extension Setup

**Installation:**

1. **Automatic:** Add repository in Tachiyomi

   ```
   https://raw.githubusercontent.com/suwayomi/tachiyomi-extension/repo/index.min.json
   ```

2. **Manual:** Download APK from:
   https://github.com/suwayomi/tachiyomi-extension/tree/repo/apk

**Configuration:**

- Server URL: `http://your-server:4567`
- Optional authentication token
- Enable tracker for progress sync

### API Endpoints for Syncing

#### Suwayomi GraphQL API

**Base URL:** `http://localhost:4567/api/graphql`

**Authentication:** Optional Bearer token header

```javascript
headers: {
  Authorization: `Bearer ${token}`;
}
```

**Key Queries:**

```graphql
# Get library
query {
  library {
    id
    title
  }
}

# Get chapters for a manga
query ($id: ID!) {
  manga(id: $id) {
    chapters {
      id
      number
      read
      lastReadAt
    }
  }
}

# Mark chapter read/unread
mutation ($id: ID!, $read: Boolean!) {
  setChapterRead(id: $id, read: $read)
}
```

#### Komga REST API

**Base URL:** `http://localhost:25600/api/v1`

**Authentication:** Basic Auth or Header

```javascript
// Basic Auth
auth: {
  username: 'your-username',
  password: 'your-password'
}

// Or header
headers: { 'X-Auth-Token': 'your-token' }
```

**Key Endpoints:**

```javascript
// Get series
GET /api/v1/series?size=500

// Get books for a series
GET /api/v1/series/{seriesId}/books?size=1000

// Get read progress
GET /api/v1/books/{bookId}/read-progress

// Update read progress
PATCH /api/v1/books/{bookId}/read-progress
Content-Type: application/json
{
  "page": 0,
  "completed": true
}
```

### Environment Configuration

Update your `.env` file with the correct endpoints:

#### For Local Development (Recommended for testing):

```env
# Komga Configuration
KOMGA_BASE=http://localhost:25600
KOMGA_USER=your-username
KOMGA_PASS=your-password

# Suwayomi Configuration
SUWA_BASE=http://localhost:4567
SUWA_TOKEN=your-optional-token
# Alternative: Use basic authentication instead of token
SUWA_USER=<suwayomi_user>
SUWA_PASS=<suwayomi_pass>

# Sync Configuration
SYNC_INTERVAL_MS=60000
FUZZY_THRESHOLD=0.85
DB_PATH=./data/sync.db
LOG_LEVEL=info
```

#### For Docker Development:

```env
# Komga Configuration
KOMGA_BASE=http://komga:25600
KOMGA_USER=your-username
KOMGA_PASS=your-password

# Suwayomi Configuration
SUWA_BASE=http://suwayomi:4567
SUWA_TOKEN=your-optional-token

# Sync Configuration
SYNC_INTERVAL_MS=60000
FUZZY_THRESHOLD=0.85
DB_PATH=./data/sync.db
LOG_LEVEL=info
```

### Testing Your Setup

#### Quick Configuration Validation:

1. **Validate your configuration:**

   ```bash
   npm run validate
   ```

   This script will check:
   - ✅ .env file exists
   - ✅ No placeholder values remain
   - ✅ Komga server is accessible
   - ✅ Suwayomi server is accessible
   - ✅ Authentication works

2. **Manual server testing:**

   ```bash
   # Test Komga
   curl -u username:password http://localhost:25600/api/v1/series

   # Test Suwayomi
   curl http://localhost:4567/api/graphql \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{"query":"{library{id title}}"}'
   ```

3. **Verify your .env file:**

   ```bash
   cat .env
   # Ensure no placeholder values like <komga_user> remain
   ```

4. **Test the sync service:**
   ```bash
   npm run dev -- --match  # Initial matching
   npm run dev             # Start sync service
   ```

#### Using the Web Dashboard:

1. Start the service: `npm run dev`
2. Open your browser: `http://localhost:3000`
3. Go to **Configuration** tab and verify settings
4. Use **API Debug** tab to test connections
5. Run **Initial Match** from the dashboard

### Troubleshooting

#### Common Connection Issues

##### **Error: `getaddrinfo ENOTFOUND komga`**

```
Solution:
1. Check your .env file configuration
2. For local development, use localhost URLs:
   KOMGA_BASE=http://localhost:25600
   SUWA_BASE=http://localhost:4567
3. For Docker, ensure containers are on the same network
4. Verify servers are running and accessible on specified ports
```

##### **Error: `getaddrinfo ENOTFOUND localhost`**

```
Solution:
1. Ensure your servers are running
2. Check if ports are correct (Komga: 25600, Suwayomi: 4567)
3. Try accessing servers directly in browser first
4. Check firewall settings
```

##### **Authentication Errors**

```
Solution:
1. Replace placeholder values in .env:
   KOMGA_USER=<komga_user> → KOMGA_USER=your_actual_username
   KOMGA_PASS=<komga_pass> → KOMGA_PASS=your_actual_password
2. For Komga, use admin/admin as default (change after first login)
3. For Suwayomi, obtain token from Web UI → Settings → Authentication
```

##### **Docker Network Issues**

```
Solution:
1. Use container names when running in Docker:
   KOMGA_BASE=http://komga:25600
   SUWA_BASE=http://suwayomi:4567
2. Ensure docker-compose.yml has proper service names
3. Check Docker network connectivity: docker network ls
```

#### Other Common Issues:

1. **Suwayomi Connection Refused:**
   - Ensure server is running on port 4567
   - Check firewall settings
   - Verify Docker container is healthy

2. **Komga Authentication Failed:**
   - Verify username/password
   - Check if user has API access
   - Try creating a new user with admin rights

3. **Extension Not Connecting:**
   - Verify server URLs in extension settings
   - Check network connectivity
   - Ensure no SSL certificate issues

4. **Sync Not Working:**
   - Check logs with `LOG_LEVEL=debug`
   - Verify manga titles match between systems
   - Test API endpoints manually first

### Network Considerations

- **Local Network:** Use `http://` with internal IPs
- **Remote Access:** Configure HTTPS and authentication
- **Docker Networking:** Use container names or host networking
- **Port Mapping:** Ensure ports 4567 (Suwayomi) and 25600 (Komga) are accessible

### Performance Optimization

- **Library Size:** Large libraries (>1000 series) may need longer sync intervals
- **Network Latency:** Adjust timeouts for remote servers
- **Database:** Monitor SQLite performance with large datasets
- **Memory:** Suwayomi may need more memory for large libraries

This setup provides a solid foundation for your Komga-Suwayomi sync service!
