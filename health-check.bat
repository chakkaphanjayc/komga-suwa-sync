@echo off
REM =================================================================
REM Komga-Suwayomi Sync - Windows Health Check Script
REM =================================================================
REM This script performs basic health checks for Windows users
REM Run with: health-check.bat

echo 🚀 Komga-Suwayomi Sync - Health Check
echo =====================================

REM Check if Docker is running
echo [INFO] Checking Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed or not running
    goto :error
)
echo [SUCCESS] Docker is available

REM Check if docker-compose is available
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker Compose is not available
    goto :error
)
echo [SUCCESS] Docker Compose is available

REM Check if .env file exists
if not exist ".env" (
    echo [ERROR] .env file not found. Copy from .env.example
    goto :error
)
echo [SUCCESS] .env file exists

REM Check if data directory exists
if not exist "data" (
    echo [WARNING] Data directory not found
) else (
    echo [SUCCESS] Data directory exists
)

REM Check if service is running
echo [INFO] Checking service status...
docker-compose ps | findstr "Up" >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Service is not running
    echo [INFO] Start with: docker-compose up -d
    goto :end
)
echo [SUCCESS] Service is running

REM Try to access health endpoint
echo [INFO] Checking health endpoint...
curl -f -s http://localhost:3000/health >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Health endpoint not responding
) else (
    echo [SUCCESS] Health endpoint is responding
)

echo.
echo [SUCCESS] Basic health checks completed!
echo [INFO] Service should be available at: http://localhost:3000
goto :end

:error
echo.
echo [ERROR] Health check failed. Please fix the issues above.
exit /b 1

:end
echo.
echo [INFO] For detailed Linux health checks, use health-check.sh on Linux
