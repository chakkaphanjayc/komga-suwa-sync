@echo off
REM =================================================================
REM Komga-Suwayomi Sync - Deployment Script (Windows)
REM =================================================================
REM This script helps deploy the application with different configurations
REM Usage: deploy.bat [environment] [options]

setlocal enabledelayedexpansion

REM Default values
set ENVIRONMENT=development
set SKIP_BUILD=false
set SKIP_HEALTH_CHECK=false
set PRODUCTION=false

REM Colors (if supported)
set RED=[91m
set GREEN=[92m
set YELLOW=[93m
set BLUE=[94m
set RESET=[0m

goto :parse_args

:log_info
echo [INFO] %~1
goto :eof

:log_success
echo [SUCCESS] %~1
goto :eof

:log_warning
echo [WARNING] %~1
goto :eof

:log_error
echo [ERROR] %~1
goto :eof

:show_help
echo 🚀 Komga-Suwayomi Sync - Deployment Script
echo.
echo Usage: %0 [environment] [options]
echo.
echo Environments:
echo   development    Deploy in development mode (default)
echo   production     Deploy in production mode
echo.
echo Options:
echo   --skip-build           Skip Docker build step
echo   --skip-health-check    Skip health check
echo   --help                 Show this help message
echo.
echo Examples:
echo   %0                      # Deploy development environment
echo   %0 production           # Deploy production environment
echo   %0 development --skip-build  # Deploy dev without rebuilding
goto :eof

:check_dependencies
call :log_info "Checking dependencies..."

REM Check Docker
docker --version >nul 2>&1
if errorlevel 1 (
    call :log_error "Docker is not installed or not in PATH"
    exit /b 1
)

REM Check Docker Compose
docker-compose --version >nul 2>&1
if errorlevel 1 (
    docker compose version >nul 2>&1
    if errorlevel 1 (
        call :log_error "Docker Compose is not installed or not in PATH"
        exit /b 1
    )
)

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    call :log_error "Docker daemon is not running"
    exit /b 1
)

call :log_success "Dependencies check passed"
goto :eof

:setup_environment
call :log_info "Setting up environment..."

REM Create .env if it doesn't exist
if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env >nul
        call :log_warning ".env file created from template. Please edit it with your configuration."
        call :log_info "Edit .env file and run this script again."
        pause
        exit /b 1
    ) else (
        call :log_error ".env.example not found"
        exit /b 1
    )
)

REM Create data directory
if not exist "data" (
    mkdir data
    call :log_success "Created data directory"
)

REM Create logs directory for production
if "%PRODUCTION%"=="true" (
    if not exist "logs" (
        mkdir logs
        call :log_success "Created logs directory"
    )
)

goto :eof

:run_health_check
if "%SKIP_HEALTH_CHECK%"=="true" (
    call :log_info "Skipping health check..."
    goto :eof
)

call :log_info "Running health check..."

if exist "health-check.bat" (
    call health-check.bat
    if errorlevel 1 (
        call :log_error "Health check failed"
        exit /b 1
    )
) else (
    call :log_warning "No health check script found, skipping..."
)
goto :eof

:build_and_deploy
set COMPOSE_FILE=docker-compose.yml

if "%PRODUCTION%"=="true" (
    set COMPOSE_FILE=docker-compose.prod.yml
    if not exist "%COMPOSE_FILE%" (
        call :log_error "Production compose file not found: %COMPOSE_FILE%"
        exit /b 1
    )
)

REM Build the image
if "%SKIP_BUILD%"=="false" (
    call :log_info "Building Docker image..."
    if "%PRODUCTION%"=="true" (
        docker compose -f "%COMPOSE_FILE%" build --no-cache
    ) else (
        docker compose -f "%COMPOSE_FILE%" build
    )
) else (
    call :log_info "Skipping build step..."
)

REM Stop existing containers
call :log_info "Stopping existing containers..."
docker compose -f "%COMPOSE_FILE%" down

REM Start the services
call :log_info "Starting services..."
docker compose -f "%COMPOSE_FILE%" up -d

REM Wait for health check
call :log_info "Waiting for service to be healthy..."
set MAX_ATTEMPTS=30
set /a attempt=1

:health_check_loop
docker compose -f "%COMPOSE_FILE%" ps | findstr "healthy" >nul
if not errorlevel 1 (
    call :log_success "Service is healthy!"
    goto :eof
)

call :log_info "Waiting... (attempt !attempt!/%MAX_ATTEMPTS%)"
timeout /t 10 /nobreak >nul
set /a attempt+=1

if !attempt! leq %MAX_ATTEMPTS% goto :health_check_loop

call :log_warning "Service may not be fully healthy yet, but continuing..."
goto :eof

:show_deployment_info
set PORT=3000

call :log_success "Deployment completed!"
echo.
echo 📊 Service Information:
echo    🌐 URL: http://localhost:%PORT%
echo    📋 Logs: docker compose logs -f
echo    🛑 Stop: docker compose down
echo    🔄 Restart: docker compose restart
echo.

if "%PRODUCTION%"=="true" (
    echo 🔒 Production Notes:
    echo    📁 Data persisted in: ./data
    echo    📋 Logs available in: ./logs
    echo    🔧 Configuration: .env
    echo.
)
goto :eof

:parse_args
if "%~1"=="" goto :main
if "%~1"=="development" (
    set ENVIRONMENT=development
    set PRODUCTION=false
    shift & goto :parse_args
)
if "%~1"=="dev" (
    set ENVIRONMENT=development
    set PRODUCTION=false
    shift & goto :parse_args
)
if "%~1"=="production" (
    set ENVIRONMENT=production
    set PRODUCTION=true
    shift & goto :parse_args
)
if "%~1"=="prod" (
    set ENVIRONMENT=production
    set PRODUCTION=true
    shift & goto :parse_args
)
if "%~1"=="--skip-build" (
    set SKIP_BUILD=true
    shift & goto :parse_args
)
if "%~1"=="--skip-health-check" (
    set SKIP_HEALTH_CHECK=true
    shift & goto :parse_args
)
if "%~1"=="--help" (
    call :show_help
    exit /b 0
)
if "%~1"=="-h" (
    call :show_help
    exit /b 0
)

call :log_error "Unknown argument: %~1"
call :show_help
exit /b 1

:main
echo 🚀 Komga-Suwayomi Sync - Deployment Script
echo ==========================================
echo Environment: %ENVIRONMENT%
echo Skip Build: %SKIP_BUILD%
echo Skip Health Check: %SKIP_HEALTH_CHECK%
echo.

call :check_dependencies
call :setup_environment
call :run_health_check
call :build_and_deploy
call :show_deployment_info

call :log_success "Deployment script completed successfully!"
pause
