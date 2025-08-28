# =================================================================
# Komga-Suwayomi Sync - Docker Development Commands
# =================================================================
# This Makefile provides convenient commands for Docker operations
# Run 'make help' to see all available commands

.PHONY: help build up down restart logs clean health-check test deploy-prod

# Default target
help: ## Show this help message
	@echo "🚀 Komga-Suwayomi Sync - Docker Commands"
	@echo ""
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development commands
build: ## Build the Docker image
	@echo "🔨 Building Docker image..."
	docker compose build

up: ## Start the service in background
	@echo "🚀 Starting service..."
	docker compose up -d

up-logs: ## Start the service and show logs
	@echo "🚀 Starting service with logs..."
	docker compose up

down: ## Stop the service
	@echo "🛑 Stopping service..."
	docker compose down

restart: ## Restart the service
	@echo "🔄 Restarting service..."
	docker compose restart

logs: ## Show service logs
	@echo "📋 Showing logs..."
	docker compose logs -f komga-suwa-sync

logs-tail: ## Show last 100 lines of logs
	@echo "📋 Showing recent logs..."
	docker compose logs --tail=100 komga-suwa-sync

# Maintenance commands
clean: ## Remove containers, networks, and images
	@echo "🧹 Cleaning up Docker resources..."
	docker compose down --rmi all --volumes --remove-orphans

clean-data: ## Remove containers and volumes (keeps images)
	@echo "🧹 Cleaning up containers and volumes..."
	docker compose down --volumes

rebuild: ## Rebuild and restart the service
	@echo "🔨 Rebuilding and restarting..."
	docker compose down
	docker compose build --no-cache
	docker compose up -d

# Health and testing
health-check: ## Run health check script
	@echo "🔍 Running health check..."
	@if [ -f "health-check.sh" ]; then \
		chmod +x health-check.sh && ./health-check.sh; \
	elif [ -f "health-check.bat" ]; then \
		./health-check.bat; \
	else \
		echo "❌ No health check script found"; \
		exit 1; \
	fi

test: ## Run tests in container
	@echo "🧪 Running tests..."
	docker compose exec komga-suwa-sync npm test

shell: ## Open shell in running container
	@echo "🐚 Opening shell..."
	docker compose exec komga-suwa-sync /bin/sh

# Production commands
deploy-prod: ## Deploy using production configuration
	@echo "🚀 Deploying to production..."
	docker compose -f docker-compose.prod.yml up -d --build

stop-prod: ## Stop production deployment
	@echo "🛑 Stopping production..."
	docker compose -f docker-compose.prod.yml down

# Utility commands
status: ## Show service status
	@echo "📊 Service status:"
	docker compose ps

env-check: ## Check environment configuration
	@echo "🔧 Environment check:"
	@if [ -f ".env" ]; then \
		echo "✅ .env file exists"; \
		echo "📋 Required variables:"; \
		grep -E "^(KOMGA_BASE|KOMGA_USER|KOMGA_PASS|SUWA_BASE|SUWA_TOKEN|SUWA_USER|SUWA_PASS)=" .env || echo "   ⚠️  Some variables may be missing"; \
	else \
		echo "❌ .env file not found. Copy from .env.example"; \
	fi

setup: ## Initial setup - copy env file and create directories
	@echo "⚙️  Initial setup..."
	@if [ ! -f ".env" ]; then \
		cp .env.example .env; \
		echo "✅ Created .env from template"; \
		echo "📝 Please edit .env with your configuration"; \
	else \
		echo "✅ .env already exists"; \
	fi
	@if [ ! -d "data" ]; then \
		mkdir -p data; \
		echo "✅ Created data directory"; \
	else \
		echo "✅ Data directory already exists"; \
	fi
	@echo "🎉 Setup complete! Run 'make health-check' next."

# Quick fix commands
fix-permissions: ## Fix Docker permission issues
	@echo "🔧 Fixing permissions..."
	@if [ -f "fix-permissions.sh" ]; then \
		chmod +x fix-permissions.sh; \
		./fix-permissions.sh; \
	else \
		echo "❌ fix-permissions.sh not found"; \
		exit 1; \
	fi

quick-fix: ## Quick fix and restart service
	@echo "🔧 Quick fix and restart..."
	@if [ -f "quick-fix.sh" ]; then \
		chmod +x quick-fix.sh; \
		./quick-fix.sh; \
	else \
		echo "❌ quick-fix.sh not found"; \
		exit 1; \
	fi

# Quick start commands
dev: ## Quick development start (build + up + logs)
	@echo "🚀 Starting development environment..."
	make build
	make up
	make logs

prod: ## Quick production start
	@echo "🚀 Starting production environment..."
	make deploy-prod
	@echo "📊 Service will be available at http://localhost:3000"

# Update commands
update: ## Pull latest changes and rebuild
	@echo "🔄 Updating service..."
	git pull
	make rebuild

# Backup commands
backup-data: ## Backup data directory
	@echo "💾 Backing up data..."
	@if [ -d "data" ]; then \
		BACKUP_FILE="backup-data-$$(date +%Y%m%d-%H%M%S).tar.gz"; \
		tar -czf "$$BACKUP_FILE" data/; \
		echo "✅ Backup created: $$BACKUP_FILE"; \
	else \
		echo "❌ No data directory found"; \
	fi

# Monitoring commands
monitor: ## Monitor container resources
	@echo "📊 Monitoring resources..."
	docker stats komga-suwa-sync

# Debug commands
debug-logs: ## Show debug logs
	@echo "🐛 Showing debug logs..."
	docker compose exec komga-suwa-sync tail -f /app/logs/app.log 2>/dev/null || docker compose logs -f komga-suwa-sync
