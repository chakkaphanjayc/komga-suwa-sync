# Testing Guide for Komga-Suwayomi Sync Service

This document provides comprehensive testing procedures for the Komga-Suwayomi Sync Service.

## Table of Contents

1. [Unit Tests](#unit-tests)
2. [Integration Tests](#integration-tests)
3. [Manual Testing](#manual-testing)
4. [Test Environment Setup](#test-environment-setup)
5. [Test Data](#test-data)
6. [Performance Testing](#performance-testing)
7. [Troubleshooting](#troubleshooting)

## Unit Tests

### Running Unit Tests

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Structure

The unit tests cover the following components:

#### Matcher Tests (`tests/matcher.test.ts`)

Tests the title and chapter matching logic:

- **Exact title matching**: Verifies identical titles match
- **Fuzzy title matching**: Tests Levenshtein distance algorithm with configurable threshold
- **Chapter matching**: Validates float comparison for chapter numbers
- **Edge cases**: Special characters, case sensitivity, empty strings

#### Mapping Repository Tests (`tests/mappingRepo.test.ts`)

Tests the SQLite database operations:

- **Series mapping**: Insert and retrieve series mappings
- **Chapter mapping**: Insert and retrieve chapter mappings
- **Database initialization**: Ensures tables are created correctly
- **Async operations**: Validates promise-based database operations

### Test Coverage Goals

- **Matcher**: 95%+ coverage
- **MappingRepository**: 90%+ coverage
- **Overall**: 85%+ coverage

## Integration Tests

### Prerequisites

1. **Komga Server**: Running instance with test manga library
2. **Suwayomi Server**: Running instance with matching manga library
3. **Test Data**: Pre-populated manga series with known read states

### Setup Test Environment

```bash
# 1. Start Komga server
docker run -d -p 25600:8080 -v komga-data:/config gotson/komga

# 2. Start Suwayomi server
docker run -d -p 4567:4567 ghcr.io/suwayomi/tachidesk:latest

# 3. Configure test data
# - Add manga series to both servers
# - Set different read states for testing
```

### Integration Test Scenarios

#### Scenario 1: Initial Matching

```bash
# Run initial matching
npm run dev -- --match

# Verify mappings in database
sqlite3 data/sync.db "SELECT * FROM series_map;"
sqlite3 data/sync.db "SELECT * FROM chapter_map;"
```

#### Scenario 2: Bi-directional Sync

```bash
# 1. Mark chapter as read in Komga
# 2. Wait for sync interval or trigger manually
# 3. Verify Suwayomi shows chapter as read

# 4. Mark chapter as read in Suwayomi
# 5. Wait for sync interval
# 6. Verify Komga shows chapter as completed
```

#### Scenario 3: Conflict Resolution

```bash
# 1. Create conflicting read states
# 2. Run sync
# 3. Verify last-write-wins behavior
# 4. Check timestamps in database
```

### Manual Testing Checklist

#### Pre-sync Setup

- [ ] Both servers running and accessible
- [ ] Test manga series added to both servers
- [ ] Environment variables configured correctly
- [ ] Database file permissions correct
- [ ] Log level set to 'debug' for detailed output

#### Initial Matching Tests

- [ ] Series matching accuracy ≥ 90%
- [ ] Chapter matching accuracy ≥ 95%
- [ ] Special characters handled correctly
- [ ] Case-insensitive matching works
- [ ] Fuzzy matching with threshold respected
- [ ] Manual mapping commands work

#### Sync Functionality Tests

- [ ] Komga → Suwayomi sync within 2 cycles
- [ ] Suwayomi → Komga sync within 2 cycles
- [ ] Progress preservation (page numbers)
- [ ] Completion status synchronization
- [ ] Conflict resolution (last-write-wins)
- [ ] Loop prevention (timestamps updated)

#### Error Handling Tests

- [ ] Network failures handled gracefully
- [ ] Invalid API responses handled
- [ ] Database connection issues handled
- [ ] Service continues running after errors
- [ ] Appropriate error logging

#### Performance Tests

- [ ] Large libraries (1000+ series)
- [ ] High-frequency sync intervals
- [ ] Memory usage monitoring
- [ ] Database query performance

## Test Environment Setup

### Docker Compose for Testing

```yaml
version: '3.8'
services:
  komga-test:
    image: gotson/komga
    ports:
      - '25601:8080'
    volumes:
      - komga-test-data:/config
    environment:
      - KOMGA_USER=testuser
      - KOMGA_PASS=testpass

  suwayomi-test:
    image: ghcr.io/suwayomi/tachidesk:latest
    ports:
      - '4568:4567'
    volumes:
      - suwayomi-test-data:/home/suwayomi/.local/share/Tachidesk

  sync-test:
    build: .
    environment:
      - KOMGA_BASE=http://komga-test:8080
      - KOMGA_USER=testuser
      - KOMGA_PASS=testpass
      - SUWA_BASE=http://suwayomi-test:4567
      - SYNC_INTERVAL_MS=10000
      - LOG_LEVEL=debug
    depends_on:
      - komga-test
      - suwayomi-test
```

### Test Data Preparation

#### Sample Manga Series for Testing

```
Test Series 1:
- Komga: "One Piece"
- Suwayomi: "One Piece"
- Expected: Exact match

Test Series 2:
- Komga: "Naruto Shippuden"
- Suwayomi: "Naruto: Shippuden"
- Expected: Fuzzy match (similarity > 0.85)

Test Series 3:
- Komga: "Attack on Titan"
- Suwayomi: "Shingeki no Kyojin"
- Expected: Manual mapping required

Test Series 4:
- Komga: "My Hero Academia"
- Suwayomi: "Boku no Hero Academia"
- Expected: Fuzzy match
```

#### Chapter Number Test Cases

```
Test Case 1:
- Komga: Chapter 1.0
- Suwayomi: Chapter 1.0
- Expected: Match

Test Case 2:
- Komga: Chapter 1.5 (special)
- Suwayomi: Chapter 1.0
- Expected: No match (difference > 0.001)

Test Case 3:
- Komga: Chapter 10.0
- Suwayomi: Chapter 10.1
- Expected: No match (difference > 0.001)
```

## Performance Testing

### Load Testing

```bash
# Using Apache Bench for health endpoint
ab -n 1000 -c 10 http://localhost:3000/health

# Monitor memory usage
node --expose-gc --max-old-space-size=4096 dist/index.js
```

### Database Performance

```sql
-- Check query performance
EXPLAIN QUERY PLAN SELECT * FROM chapter_map WHERE komgaBookId = ?;
EXPLAIN QUERY PLAN SELECT * FROM series_map WHERE suwaMangaId = ?;
```

### Sync Performance Benchmarks

- **Small library** (< 100 series): < 30 seconds
- **Medium library** (100-500 series): < 2 minutes
- **Large library** (500+ series): < 5 minutes

## Troubleshooting

### Common Test Issues

#### Issue: Series not matching

```
Solution:
1. Check title normalization
2. Adjust FUZZY_THRESHOLD
3. Use manual mapping
4. Verify API responses
```

#### Issue: Sync not working

```
Solution:
1. Check network connectivity
2. Verify API credentials
3. Check timestamps in database
4. Review error logs
```

#### Issue: Database errors

```
Solution:
1. Check file permissions
2. Verify SQLite installation
3. Check database file corruption
4. Review connection string
```

#### Issue: Memory leaks

```
Solution:
1. Monitor heap usage
2. Check for unclosed connections
3. Review async/await patterns
4. Implement connection pooling
```

### Debug Commands

```bash
# Check service health
curl http://localhost:3000/health

# View recent logs
tail -f logs/app.log

# Inspect database
sqlite3 data/sync.db ".schema"
sqlite3 data/sync.db "SELECT COUNT(*) FROM series_map;"
sqlite3 data/sync.db "SELECT COUNT(*) FROM chapter_map;"

# Test API connectivity
curl -u user:pass http://komga:25600/api/v1/series
curl http://suwayomi:4567/api/graphql -X POST -H "Content-Type: application/json" -d '{"query":"{library{id title}}"}'
```

## Real API Environment Testing

This section provides practical examples for testing against real Komga and Suwayomi server instances with actual authentication and data.

### Komga API Testing

#### Authentication Setup

```bash
# Test Basic Authentication
curl -u username:password http://localhost:8080/api/v1/series

# Test with X-Auth-Token (if configured)
curl -H "X-Auth-Token: your-token-here" http://localhost:8080/api/v1/series
```

#### Common Komga Endpoints

```bash
# Get all series
curl -u user:pass http://localhost:8080/api/v1/series

# Get specific series by ID
curl -u user:pass http://localhost:8080/api/v1/series/{series-id}

# Get books for a series
curl -u user:pass http://localhost:8080/api/v1/series/{series-id}/books

# Get read progress for a book
curl -u user:pass http://localhost:8080/api/v1/books/{book-id}/read-progress

# Update read progress
curl -u user:pass -X PATCH http://localhost:8080/api/v1/books/{book-id}/read-progress \
  -H "Content-Type: application/json" \
  -d '{"page": 10, "completed": false}'

# Mark book as completed
curl -u user:pass -X PATCH http://localhost:8080/api/v1/books/{book-id}/read-progress \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```

#### Expected Komga Responses

```json
// Series list response
{
  "content": [
    {
      "id": "series-uuid",
      "name": "One Piece",
      "url": "/api/v1/series/series-uuid",
      "booksMetadata": {
        "authors": ["Eiichiro Oda"],
        "tags": ["Action", "Adventure"]
      }
    }
  ],
  "pageable": {
    "pageNumber": 0,
    "pageSize": 20
  }
}

// Read progress response
{
  "bookId": "book-uuid",
  "page": 15,
  "completed": false,
  "readDate": "2024-01-15T10:30:00Z"
}
```

### Suwayomi API Testing

#### Authentication Setup

```bash
# Test without authentication (default)
curl http://localhost:4567/api/graphql

# Test with Bearer token (if configured)
curl -H "Authorization: Bearer your-token-here" http://localhost:4567/api/graphql
```

#### Common Suwayomi GraphQL Queries

```bash
# Get library information
curl http://localhost:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{library{id title}}"}'

# Get manga details
curl http://localhost:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{manga(id: \"123\"){id title chapters{id chapterNumber isRead}}}"}'

# Get chapter details
curl http://localhost:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{chapter(id: \"456\"){id chapterNumber isRead lastPageRead}}"}'

# Update chapter read status
curl http://localhost:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation{updateChapter(id: \"456\", isRead: true){id isRead}}"}'

# Update last page read
curl http://localhost:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation{updateChapter(id: \"456\", lastPageRead: 10){id lastPageRead}}"}'
```

#### Expected Suwayomi Responses

```json
// Library response
{
  "data": {
    "library": {
      "id": "library-id",
      "title": "My Library"
    }
  }
}

// Manga with chapters response
{
  "data": {
    "manga": {
      "id": "123",
      "title": "One Piece",
      "chapters": [
        {
          "id": "chapter-1",
          "chapterNumber": 1.0,
          "isRead": true
        },
        {
          "id": "chapter-2",
          "chapterNumber": 2.0,
          "isRead": false
        }
      ]
    }
  }
}

// Chapter update response
{
  "data": {
    "updateChapter": {
      "id": "456",
      "isRead": true
    }
  }
}
```

### Integration Testing Commands

#### End-to-End Sync Test

```bash
# 1. Get series from both servers
curl -u user:pass http://komga:8080/api/v1/series | jq '.content[0]'

curl http://suwayomi:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{getLibraryManga(libraryId: \"0\"){id title}}"}' | jq '.data.getLibraryManga[0]'

# 2. Test chapter matching
curl -u user:pass http://komga:8080/api/v1/series/{komga-series-id}/books | jq '.content[] | {id, name, number}'

curl http://suwayomi:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{manga(id: \"{suwa-manga-id}\"){chapters{id chapterNumber name}}}"}' | jq '.data.manga.chapters[]'

# 3. Simulate read progress sync
# Mark chapter as read in Komga
curl -u user:pass -X PATCH http://komga:8080/api/v1/books/{book-id}/read-progress \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'

# Check if Suwayomi reflects the change
curl http://suwayomi:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{chapter(id: \"{chapter-id}\"){isRead}}"}'
```

### Environment Validation Tests

#### Network Connectivity

```bash
# Test Komga connectivity
nc -zv komga-server 8080

# Test Suwayomi connectivity
nc -zv suwayomi-server 4567

# Test with authentication
curl -f -u user:pass http://komga-server:8080/api/v1/series >/dev/null && echo "Komga OK" || echo "Komga FAIL"
curl -f http://suwayomi-server:4567/api/graphql >/dev/null && echo "Suwayomi OK" || echo "Suwayomi FAIL"
```

#### Data Consistency Checks

```bash
# Compare series counts
komga_count=$(curl -s -u user:pass http://komga:8080/api/v1/series | jq '.totalElements')
suwa_count=$(curl -s http://suwayomi:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{getLibraryManga(libraryId: \"0\"){id}}"}' | jq '.data.getLibraryManga | length')

echo "Komga series: $komga_count"
echo "Suwayomi series: $suwa_count"

# Check for common series titles
curl -s -u user:pass http://komga:8080/api/v1/series | jq '.content[].name' | sort
curl -s http://suwayomi:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{getLibraryManga(libraryId: \"0\"){title}}"}' | jq '.data.getLibraryManga[].title' | sort
```

### Common API Testing Issues

#### Authentication Problems

```bash
# Test different auth methods
# Basic Auth
curl -u wronguser:wrongpass http://komga:8080/api/v1/series
# Should return 401 Unauthorized

# Bearer Token
curl -H "Authorization: Bearer invalid-token" http://suwayomi:4567/api/graphql
# Should return authentication error

# Missing Auth
curl http://komga:8080/api/v1/series
# Should return 401 or redirect to login
```

#### Network and Timeout Issues

```bash
# Test with timeout
curl --max-time 5 http://slow-server:8080/api/v1/series

# Test with retry
curl --retry 3 --retry-delay 2 http://unstable-server:8080/api/v1/series

# Test CORS (if applicable)
curl -H "Origin: http://localhost:3000" http://komga:8080/api/v1/series
```

#### Data Format Issues

```bash
# Test malformed JSON
curl -u user:pass -X PATCH http://komga:8080/api/v1/books/{id}/read-progress \
  -H "Content-Type: application/json" \
  -d '{"page": "invalid", "completed": "not-boolean"}'

# Test invalid GraphQL
curl http://suwayomi:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{invalid{field}"}'

# Test with missing required fields
curl http://suwayomi:4567/api/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{manga{title}}"}'  # Missing id parameter
```

### Logging Levels

- **error**: Critical errors only
- **warn**: Warnings and potential issues
- **info**: General information and sync operations
- **debug**: Detailed debugging information

Set `LOG_LEVEL=debug` for comprehensive testing logs.

## Acceptance Criteria Validation

### Functional Requirements

- [ ] Service starts without crashing
- [ ] Scans ≥ 1 series from both servers
- [ ] Series matching accuracy ≥ 90%
- [ ] Chapter matching accuracy ≥ 95%
- [ ] Komga → Suwayomi sync within 2 cycles
- [ ] Suwayomi → Komga sync within 2 cycles
- [ ] Dry-run mode works correctly
- [ ] Manual mapping commands functional

### Non-Functional Requirements

- [ ] Logging provides clear operation tracking
- [ ] Error handling prevents service crashes
- [ ] Configurable timeouts implemented
- [ ] Reasonable concurrency limits
- [ ] Health endpoint responsive
- [ ] Docker containerization works
- [ ] SQLite database properly structured

### Documentation Requirements

- [ ] README with setup instructions
- [ ] Environment variables documented
- [ ] Docker usage explained
- [ ] Limitations clearly stated
- [ ] Debugging guide provided
