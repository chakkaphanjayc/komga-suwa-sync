#!/bin/bash
# =================================================================
# Komga-Suwayomi Sync - Health Check Script
# =================================================================
# This script performs comprehensive health checks for the service
# Run with: chmod +x health-check.sh && ./health-check.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICE_URL="http://localhost:3000"
SERVICE_NAME="komga-suwa-sync"

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

check_service_running() {
    log_info "Checking if service is running..."

    if ! docker-compose ps | grep -q "Up"; then
        log_error "Service is not running"
        log_info "Start the service with: docker-compose up -d"
        return 1
    fi

    log_success "Service is running"
    return 0
}

check_http_endpoint() {
    local url=$1
    local expected_code=${2:-200}
    local description=$3

    log_info "Checking $description..."

    if ! curl -f -s "$url" > /dev/null 2>&1; then
        log_error "$description failed (HTTP check)"
        return 1
    fi

    local actual_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    if [ "$actual_code" != "$expected_code" ]; then
        log_warning "$description returned HTTP $actual_code (expected $expected_code)"
        return 1
    fi

    log_success "$description is healthy"
    return 0
}

check_service_health() {
    log_info "Checking service health endpoint..."

    local health_response=$(curl -s "$SERVICE_URL/health" 2>/dev/null)
    if [ $? -ne 0 ]; then
        log_error "Health endpoint is not responding"
        return 1
    fi

    # Parse JSON response
    local status=$(echo "$health_response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    local is_running=$(echo "$health_response" | grep -o '"isRunning":[^,}]*' | cut -d':' -f2 | tr -d ' ')

    if [ "$status" != "ok" ]; then
        log_warning "Service status: $status"
    else
        log_success "Service status: $status"
    fi

    if [ "$is_running" = "true" ]; then
        log_success "Sync service is running"
    else
        log_warning "Sync service is not running (this is normal for initial setup)"
    fi

    return 0
}

check_environment() {
    log_info "Checking environment configuration..."

    if [ ! -f ".env" ]; then
        log_error ".env file not found"
        return 1
    fi

    log_success ".env file exists"

    # Check for required variables
    local required_vars=("KOMGA_BASE" "KOMGA_USER" "KOMGA_PASS" "SUWA_BASE")
    local auth_vars=("SUWA_TOKEN" "SUWA_USER")

    local missing_required=0
    local has_auth=0

    for var in "${required_vars[@]}"; do
        if ! grep -q "^$var=" .env; then
            log_error "Required variable $var not found in .env"
            missing_required=1
        fi
    done

    for var in "${auth_vars[@]}"; do
        if grep -q "^$var=" .env && ! grep -q "^$var=$" .env; then
            has_auth=1
            break
        fi
    done

    if [ $missing_required -eq 1 ]; then
        log_error "Missing required configuration variables"
        return 1
    fi

    if [ $has_auth -eq 0 ]; then
        log_warning "No Suwayomi authentication configured (SUWA_TOKEN or SUWA_USER/SUWA_PASS)"
    else
        log_success "Authentication configuration found"
    fi

    return 0
}

check_data_directory() {
    log_info "Checking data directory..."

    if [ ! -d "data" ]; then
        log_warning "Data directory not found"
        return 1
    fi

    if [ ! -w "data" ]; then
        log_error "Data directory is not writable"
        return 1
    fi

    log_success "Data directory is accessible"

    # Check for database file
    if [ -f "data/sync.db" ]; then
        log_success "Database file exists"
    else
        log_info "Database file not found (will be created on first run)"
    fi

    return 0
}

show_service_info() {
    log_info "Service Information:"
    echo "  URL: $SERVICE_URL"
    echo "  Dashboard: $SERVICE_URL"
    echo "  Health: $SERVICE_URL/health"
    echo "  API: $SERVICE_URL/api/"
    echo
    log_info "Container Information:"
    docker-compose ps
}

main() {
    echo "🔍 Komga-Suwayomi Sync - Health Check"
    echo "====================================="

    local all_checks_passed=true

    # Run all checks
    check_environment || all_checks_passed=false
    check_data_directory || all_checks_passed=false
    check_service_running || all_checks_passed=false

    if check_service_running; then
        check_http_endpoint "$SERVICE_URL" 200 "Main dashboard" || all_checks_passed=false
        check_service_health || all_checks_passed=false
    fi

    echo
    if [ "$all_checks_passed" = true ]; then
        log_success "All health checks passed!"
    else
        log_warning "Some health checks failed. Please review the output above."
    fi

    echo
    show_service_info

    if [ "$all_checks_passed" = false ]; then
        echo
        log_info "Troubleshooting tips:"
        echo "1. Check service logs: docker-compose logs -f"
        echo "2. Verify .env configuration"
        echo "3. Ensure Komga and Suwayomi servers are running"
        echo "4. Check network connectivity"
        exit 1
    fi
}

# Run main function
main "$@"
