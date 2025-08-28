@echo off
REM =================================================================
REM Komga-Suwayomi Sync Health Check Script (Windows)
REM =================================================================
REM This script helps verify your Docker Compose setup

echo 🔍 Komga-Suwayomi Sync - Health Check
echo =====================================

REM Check if Docker is running
echo 📋 Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker first.
    pause
    exit /b 1
)
echo ✅ Docker is running

REM Check if docker-compose.yml exists
if not exist "docker-compose.yml" (
    echo ❌ docker-compose.yml not found in current directory
    pause
    exit /b 1
)
echo ✅ docker-compose.yml found

REM Check if .env file exists
if not exist ".env" (
    echo ❌ .env file not found. Please copy .env.example to .env and configure it.
    pause
    exit /b 1
)
echo ✅ .env file found

REM Check if required environment variables are set
echo 🔧 Checking environment variables...
set MISSING_VARS=
set KOMGA_CONFIGURED=0
set SUWA_CONFIGURED=0

REM Check Komga variables
findstr /r "^KOMGA_BASE=" .env >nul
if errorlevel 1 (
    set MISSING_VARS=%MISSING_VARS% KOMGA_BASE
) else (
    findstr /r "^KOMGA_BASE=.*<.*>$" .env >nul
    if errorlevel 1 set KOMGA_CONFIGURED=1
)

findstr /r "^KOMGA_USER=" .env >nul
if errorlevel 1 (
    set MISSING_VARS=%MISSING_VARS% KOMGA_USER
) else (
    findstr /r "^KOMGA_USER=.*<.*>$" .env >nul
    if errorlevel 1 if !KOMGA_CONFIGURED! equ 1 set KOMGA_CONFIGURED=1
)

findstr /r "^KOMGA_PASS=" .env >nul
if errorlevel 1 (
    set MISSING_VARS=%MISSING_VARS% KOMGA_PASS
) else (
    findstr /r "^KOMGA_PASS=.*<.*>$" .env >nul
    if errorlevel 1 if !KOMGA_CONFIGURED! equ 1 set KOMGA_CONFIGURED=1
)

REM Check Suwayomi variables
findstr /r "^SUWA_BASE=" .env >nul
if errorlevel 1 (
    set MISSING_VARS=%MISSING_VARS% SUWA_BASE
) else (
    findstr /r "^SUWA_BASE=.*<.*>$" .env >nul
    if errorlevel 1 set SUWA_CONFIGURED=1
)

REM Check if either SUWA_TOKEN or SUWA_USER/SUWA_PASS are configured
findstr /r "^SUWA_TOKEN=" .env >nul
if errorlevel 1 (
    REM Check for basic auth
    findstr /r "^SUWA_USER=" .env >nul
    if errorlevel 1 (
        set MISSING_VARS=%MISSING_VARS% SUWA_TOKEN_or_SUWA_USER/SUWA_PASS
    ) else (
        findstr /r "^SUWA_USER=.*<.*>$" .env >nul
        if errorlevel 1 (
            findstr /r "^SUWA_PASS=" .env >nul
            if errorlevel 1 (
                set MISSING_VARS=%MISSING_VARS% SUWA_PASS
            ) else (
                findstr /r "^SUWA_PASS=.*<.*>$" .env >nul
                if errorlevel 1 set SUWA_CONFIGURED=1
            )
        )
    )
) else (
    findstr /r "^SUWA_TOKEN=.*<.*>$" .env >nul
    if errorlevel 1 set SUWA_CONFIGURED=1
)

if defined MISSING_VARS (
    echo ❌ Missing or placeholder environment variables:
    for %%v in (%MISSING_VARS%) do echo    - %%v
    echo    Please edit your .env file with actual values.
    pause
    exit /b 1
)
echo ✅ Environment variables configured

REM Check if data directory exists
if not exist "data" (
    echo 📁 Creating data directory...
    mkdir data
)
echo ✅ Data directory ready

echo.
echo 🎉 Health check completed!
echo.
echo 🚀 You can now run: docker-compose up --build
echo 📊 Then visit: http://localhost:3000
echo.
echo 📖 For more information, see README.md
echo.
pause
