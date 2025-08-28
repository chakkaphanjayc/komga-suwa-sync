// Komga-Suwayomi Sync Dashboard JavaScript
// This is a JavaScript file - not TypeScript

// Polyfill for crypto.randomUUID if not available
if (!crypto.randomUUID) {
    crypto.randomUUID = function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };
}

class SyncDashboard {
    constructor() {
        this.socket = null;
        this.currentTab = localStorage.getItem('currentTab') || 'dashboard';
        this.logs = [];
        this.activityLog = [];
        this.komgaManga = []; // Store full Komga manga data
        this.suwayomiManga = []; // Store full Suwayomi manga data
        this.syncTimer = null;
        this.countdownInterval = null;
        this.theme = localStorage.getItem('theme') || 'dark';
        this.init();
    }

    init() {
        this.connectWebSocket();
        this.setupEventListeners();
        this.loadInitialData();
        this.startStatusUpdates();
        this.loadConfig();
        this.applyTheme();
        this.showTab(this.currentTab);
        this.startAutoSync();
        this.updateSyncDirectionFromConfig();
    }

    connectWebSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateStatus('Connected', 'connected');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateStatus('Disconnected', 'error');
        });

        this.socket.on('log', (data) => {
            this.handleLog(data);
        });

        this.socket.on('stats-update', (data) => {
            this.updateStats(data);
        });

        this.socket.on('sync-status', (data) => {
            this.updateSyncStatus(data);
            // Update sync direction if provided in the data
            if (data.direction) {
                this.updateSyncDirectionStatus(data.direction);
            }
            // Countdown timer is now handled in updateSyncStatus
        });

        this.socket.on('activity', (data) => {
            this.addActivity(data);
        });

        // Update sync direction after WebSocket connection is established
        this.updateSyncDirectionFromConfig();
    }

    setupEventListeners() {
        // Tab switching - use data-tab attributes instead of onclick
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.target.closest('.tab-btn').dataset.tab;
                if (tabId) {
                    this.showTab(tabId);
                }
            });
        });

        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }

        // URL buttons
        const komgaUrlBtn = document.getElementById('open-komga');
        const suwayomiUrlBtn = document.getElementById('open-suwayomi');

        if (komgaUrlBtn) {
            komgaUrlBtn.addEventListener('click', () => {
                this.openKomgaUrl();
            });
        }
        if (suwayomiUrlBtn) {
            suwayomiUrlBtn.addEventListener('click', () => {
                this.openSuwayomiUrl();
            });
        }

        // Configuration forms
        document.getElementById('komga-config').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveConfig('komga');
        });

        document.getElementById('suwa-config').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveConfig('suwa');
        });

        document.getElementById('sync-config').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveConfig('sync');
        });

        // Control buttons - only add listeners if elements exist
        const startSyncBtn = document.getElementById('start-sync');
        const stopSyncBtn = document.getElementById('stop-sync');
        const runMatchBtn = document.getElementById('run-match');
        const testConnectionsBtn = document.getElementById('test-connections');
        const refreshMatchedBtn = document.getElementById('refresh-matched');

        if (startSyncBtn) {
            startSyncBtn.addEventListener('click', () => {
                this.sendCommand('start-sync');
            });
        }
        if (stopSyncBtn) {
            stopSyncBtn.addEventListener('click', () => {
                this.sendCommand('stop-sync');
            });
        }
        if (runMatchBtn) {
            runMatchBtn.addEventListener('click', () => {
                this.sendCommand('run-match');
            });
        }
        if (testConnectionsBtn) {
            testConnectionsBtn.addEventListener('click', () => {
                this.testConnections();
            });
        }
        if (refreshMatchedBtn) {
            refreshMatchedBtn.addEventListener('click', () => {
                this.loadMatchedManga();
            });
        }

        // Logs controls
        document.getElementById('clear-logs').addEventListener('click', () => {
            this.clearLogs();
        });

        document.getElementById('download-logs').addEventListener('click', () => {
            this.downloadLogs();
        });

        document.getElementById('log-filter').addEventListener('change', (e) => {
            this.filterLogs(e.target.value);
        });

        // API Debug buttons - only add listeners if elements exist
        const testKomgaBtn = document.getElementById('test-komga');
        const testSuwaBtn = document.getElementById('test-suwa');
        const openKomgaBtn = document.getElementById('open-komga');
        const openSuwayomiBtn = document.getElementById('open-suwayomi');

        if (testKomgaBtn) {
            testKomgaBtn.addEventListener('click', () => {
                this.testAPI('komga');
            });
        }
        if (testSuwaBtn) {
            testSuwaBtn.addEventListener('click', () => {
                this.testAPI('suwa');
            });
        }
        if (openKomgaBtn) {
            openKomgaBtn.addEventListener('click', () => {
                this.openKomgaUrl();
            });
        }
        if (openSuwayomiBtn) {
            openSuwayomiBtn.addEventListener('click', () => {
                this.openSuwayomiUrl();
            });
        }

        // Search functionality
        const activitySearch = document.getElementById('activity-search');
        const syncLogSearch = document.getElementById('sync-log-search');

        if (activitySearch) {
            activitySearch.addEventListener('input', (e) => {
                this.filterActivity(e.target.value);
            });
        }
        if (syncLogSearch) {
            syncLogSearch.addEventListener('input', (e) => {
                this.filterSyncLog();
            });
        }

        // Sync log controls
        document.getElementById('refresh-sync-log').addEventListener('click', () => {
            this.loadSyncLog();
        });

        document.getElementById('trigger-manual-sync').addEventListener('click', () => {
            this.triggerManualSync();
        });

        document.getElementById('clear-sync-log').addEventListener('click', () => {
            this.clearSyncLog();
        });

        // New directional sync buttons
        document.getElementById('sync-komga-to-suwa').addEventListener('click', () => {
            this.syncKomgaToSuwa();
        });

        document.getElementById('sync-suwa-to-komga').addEventListener('click', () => {
            this.syncSuwaToKomga();
        });

        // Manga lists - only add listeners if elements exist
        const komgaMangaBtn = document.getElementById('refresh-komga-manga');
        const suwayomiMangaBtn = document.getElementById('refresh-suwayomi-manga');
        const komgaSearch = document.getElementById('komga-search');
        const suwayomiSearch = document.getElementById('suwayomi-search');
        
        if (komgaMangaBtn) {
            komgaMangaBtn.addEventListener('click', () => {
                this.loadKomgaManga();
            });
        }
        if (suwayomiMangaBtn) {
            suwayomiMangaBtn.addEventListener('click', () => {
                this.loadSuwayomiManga();
            });
        }
        if (komgaSearch) {
            komgaSearch.addEventListener('input', (e) => {
                this.filterKomgaManga(e.target.value);
            });
        }
        if (suwayomiSearch) {
            suwayomiSearch.addEventListener('input', (e) => {
                this.filterSuwayomiManga(e.target.value);
            });
        }
    }

    showTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeTabBtn = document.querySelector(`[data-tab="${tabId}"]`);
        if (activeTabBtn) {
            activeTabBtn.classList.add('active');
        }

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');

        this.currentTab = tabId;
        localStorage.setItem('currentTab', tabId);

        // Log navigation event
        this.logUserEvent('navigation', {
            tab: tabId,
            previousTab: this.previousTab
        });
        this.previousTab = tabId;

        // Load tab-specific data
        if (tabId === 'configuration') {
            this.loadConfig();
            this.updateSyncDirectionFromConfig();
            this.checkAPIStatus();
        } else if (tabId === 'mappings') {
            this.loadMappings();
        } else if (tabId === 'manga-lists') {
            this.loadKomgaManga();
            this.loadSuwayomiManga();
        } else if (tabId === 'sync-log') {
            this.loadSyncLog();
        }
    }

    async loadInitialData() {
        try {
            // Load stats first
            const statsResponse = await fetch('/api/stats');
            const stats = await statsResponse.json();
            this.updateStats(stats);

            // Update sync direction status on initial load
            this.updateSyncDirectionFromConfig();
        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
    }

    startStatusUpdates() {
        setInterval(() => {
            this.checkAPIStatus();
        }, 30000); // Check every 30 seconds
    }

    updateStatus(message, type) {
        if (typeof type === 'undefined') {
            type = 'info';
        }
        const statusText = document.querySelector('#sync-status .status-text');
        statusText.textContent = message;
        statusText.className = `status-text ${type}`;
    }

    updateSyncStatus(data) {
        const lastSyncText = document.querySelector('#last-sync .status-text');
        if (data.lastSync) {
            lastSyncText.textContent = new Date(data.lastSync).toLocaleString();
        } else if (data.lastFullSync) {
            // If no regular sync but we have a full sync time, show that
            lastSyncText.textContent = `Full: ${new Date(data.lastFullSync).toLocaleString()}`;
        } else {
            lastSyncText.textContent = 'Never';
        }

        if (data.isRunning !== undefined) {
            this.updateStatus(data.isRunning ? 'Running' : 'Stopped', data.isRunning ? 'connected' : 'error');
        }

        // Calculate remaining time based on last sync and interval
        if (data.isRunning && data.intervalMs && data.lastSync) {
            const lastSyncTime = new Date(data.lastSync).getTime();
            const now = Date.now();
            const elapsed = now - lastSyncTime;
            const remaining = Math.max(0, data.intervalMs - elapsed);

            if (remaining > 0) {
                this.startCountdownTimer(remaining);
            } else {
                // If already past the interval, show syncing
                const countdownElement = document.getElementById('sync-countdown');
                if (countdownElement) {
                    countdownElement.textContent = 'Syncing...';
                }
            }
        } else if (!data.isRunning) {
            // Clear countdown if sync stopped
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
                const countdownElement = document.getElementById('sync-countdown');
                if (countdownElement) {
                    countdownElement.textContent = '';
                }
            }
        }
    }

    updateSyncDirectionStatus(direction) {
        const directionText = document.getElementById('sync-direction-text');
        if (directionText) {
            let displayText = 'Bidirectional';
            if (direction === 'komga-to-suwa') {
                displayText = 'Komga → Suwayomi';
            } else if (direction === 'suwa-to-komga') {
                displayText = 'Suwayomi → Komga';
            }
            directionText.textContent = displayText;
        }
    }

    updateStats(stats) {
        document.getElementById('series-count').textContent = stats.seriesMappings || 0;
        document.getElementById('chapter-count').textContent = stats.chapterMappings || 0;
        document.getElementById('sync-cycles').textContent = stats.syncCycles || 0;
        document.getElementById('error-count').textContent = stats.errors || 0;
    }

    handleLog(data) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: data.level || 'info',
            message: data.message || data,
            ...data
        };

        this.logs.push(logEntry);
        this.displayLog(logEntry);
    }

    displayLog(logEntry) {
        const logsContainer = document.getElementById('logs-container');
        const logElement = document.createElement('div');
        logElement.className = `log-entry log-${logEntry.level}`;

        const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
        logElement.textContent = `[${timestamp}] ${logEntry.level.toUpperCase()}: ${logEntry.message}`;

        logsContainer.appendChild(logElement);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    addActivity(data) {
        const activityItem = {
            timestamp: new Date().toISOString(),
            ...data
        };

        this.activityLog.unshift(activityItem);
        if (this.activityLog.length > 50) {
            this.activityLog.pop();
        }

        this.displayActivity();
    }

    displayActivity() {
        const activityContainer = document.getElementById('activity-log');
        activityContainer.innerHTML = '';

        this.activityLog.slice(0, 20).forEach(activity => {
            const item = document.createElement('div');
            item.className = 'activity-item';

            const timestamp = new Date(activity.timestamp).toLocaleString();
            item.innerHTML = `
                <div>${activity.message}</div>
                <div class="timestamp">${timestamp}</div>
            `;

            activityContainer.appendChild(item);
        });
    }

    // Theme management
    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            const icon = themeToggle.querySelector('i');
            if (this.theme === 'dark') {
                icon.className = 'fas fa-sun';
                themeToggle.title = 'Switch to Light Mode';
            } else {
                icon.className = 'fas fa-moon';
                themeToggle.title = 'Switch to Dark Mode';
            }
        }
    }

    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', this.theme);
        this.applyTheme();
        this.showNotification(`Switched to ${this.theme} mode`, 'info');
    }

    // URL opening
    openKomgaUrl() {
        this.loadConfig().then(config => {
            if (config.komga && config.komga.base) {
                window.open(config.komga.base, '_blank');
            } else {
                this.showNotification('Komga URL not configured', 'error');
            }
        });
    }

    openSuwayomiUrl() {
        this.loadConfig().then(config => {
            if (config.suwa && config.suwa.base) {
                window.open(config.suwa.base, '_blank');
            } else {
                this.showNotification('Suwayomi URL not configured', 'error');
            }
        });
    }

    // Auto-start functionality
    startAutoSync() {
        // Load configuration and start auto-sync if enabled
        this.loadConfig().then(config => {
            if (config.sync && config.sync.autoStart !== false) {
                this.showNotification('Auto-starting connections and sync...', 'info');
                setTimeout(() => {
                    this.testConnectionsAndSync();
                }, 2000); // Wait 2 seconds for page to load
            }
        });
    }

    // Countdown timer for sync
    startCountdownTimer(intervalMs) {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }

        const countdownElement = document.getElementById('sync-countdown');
        if (!countdownElement) return;

        let remaining = intervalMs;

        this.countdownInterval = setInterval(() => {
            remaining -= 1000;

            if (remaining <= 0) {
                countdownElement.textContent = 'Syncing...';
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
                return;
            }

            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            countdownElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    // Load configuration from env file
    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();

            // Populate form fields
            Object.keys(config).forEach(section => {
                Object.keys(config[section]).forEach(key => {
                    // Map server config keys to HTML form field names
                    let fieldName;
                    if (section === 'komga') {
                        fieldName = `komga-${key}`;
                    } else if (section === 'suwa') {
                        fieldName = `suwa-${key}`;
                    } else if (section === 'sync') {
                        const syncFieldMapping = {
                            interval: 'sync-interval',
                            fullSyncInterval: 'full-sync-interval',
                            threshold: 'fuzzy-threshold',
                            level: 'log-level',
                            dryRun: 'dry-run',
                            direction: 'sync-direction'
                        };
                        fieldName = syncFieldMapping[key] || `sync-${key}`;
                    }

                    const element = document.getElementById(fieldName);
                    if (element) {
                        // Ensure input attributes reflect displayed units
                        if (fieldName === 'sync-interval') {
                            element.placeholder = element.placeholder || '30';
                            element.min = 1;
                            element.step = 1;
                        } else if (fieldName === 'full-sync-interval') {
                            element.placeholder = element.placeholder || '6';
                            element.min = 1;
                            element.step = 1;
                        }
                        // Convert stored ms values to user-friendly units for display
                        if (section === 'sync' && key === 'interval') {
                            // Event sync interval stored in ms, display in seconds
                            const ms = parseInt(config[section][key] || '0', 10) || 0;
                            element.value = ms > 0 ? String(Math.round(ms / 1000)) : '';
                            // If value looks like milliseconds (very large) but user-facing units are seconds,
                            // clamp or convert if necessary (defensive). Already converted above.
                        } else if (section === 'sync' && key === 'fullSyncInterval') {
                            // Full sync interval stored in ms, display in hours
                            const ms = parseInt(config[section][key] || '0', 10) || 0;
                            element.value = ms > 0 ? String(Math.round(ms / 3600000)) : '';
                        } else if (element.type === 'checkbox') {
                            element.checked = config[section][key] === 'true' || config[section][key] === true;
                        } else {
                            element.value = config[section][key] || '';
                        }
                    }
                });
            });

            return config;
        } catch (error) {
            console.error('Load config error:', error);
            return {};
        }
    }

    // Filter activity log
    filterActivity(searchTerm) {
        const activityContainer = document.getElementById('activity-log');
        const items = activityContainer.querySelectorAll('.activity-item');

        if (!searchTerm.trim()) {
            items.forEach(item => item.style.display = 'block');
            return;
        }

        const searchLower = searchTerm.toLowerCase().trim();
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(searchLower) ? 'block' : 'none';
        });
    }

    // Filter sync log
    filterSyncLog() {
        const searchInput = document.getElementById('sync-log-search');
        const filterSelect = document.getElementById('sync-log-filter');

        if (!searchInput || !filterSelect) return;

        const searchTerm = searchInput.value.toLowerCase().trim();
        const filterValue = filterSelect.value;

        const containers = ['komga-sync-entries', 'suwayomi-sync-entries'];
        containers.forEach(containerId => {
            const container = document.getElementById(containerId);
            if (!container) return;

            const items = container.querySelectorAll('.sync-activity-item');
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                const matchesSearch = !searchTerm || text.includes(searchTerm);
                const matchesFilter = filterValue === 'all' || item.classList.contains(`status-${filterValue}`);

                item.style.display = (matchesSearch && matchesFilter) ? 'block' : 'none';
            });
        });
    }

    async saveConfig(type) {
        const form = document.getElementById(`${type}-config`);
        const formData = new FormData(form);
        const config = {};

        for (let [key, value] of formData.entries()) {
            // Skip empty values so we don't overwrite with blanks
            if (value === '') continue;

            // Map HTML form field names back to server config keys
            let configKey = key;
            if (type === 'komga') {
                configKey = key.replace('komga-', '');
            } else if (type === 'suwa') {
                configKey = key.replace('suwa-', '');
            } else if (type === 'sync') {
                // Map HTML field names back to server config keys (keep dash-style keys expected by backend)
                const reverseSyncFieldMapping = {
                    'sync-interval': 'sync-interval',
                    'full-sync-interval': 'full-sync-interval',
                    'fuzzy-threshold': 'fuzzy-threshold',
                    'log-level': 'log-level',
                    'dry-run': 'dry-run',
                    'sync-direction': 'sync-direction'
                };
                configKey = reverseSyncFieldMapping[key] || key.replace('sync-', '');

                // Validate numeric inputs before conversion
                if (configKey === 'sync-interval') {
                    // User provides seconds -> convert to ms
                    const secs = parseFloat(value);
                    if (Number.isNaN(secs) || secs <= 0) {
                        this.showNotification('Event Sync Interval must be a positive number (seconds)', 'error');
                        return;
                    }
                    config[configKey] = String(Math.round(secs * 1000));
                    continue;
                }

                if (configKey === 'full-sync-interval') {
                    // User provides hours -> convert to ms
                    const hours = parseFloat(value);
                    if (Number.isNaN(hours) || hours <= 0) {
                        this.showNotification('Full Sync Interval must be a positive number (hours)', 'error');
                        return;
                    }
                    config[configKey] = String(Math.round(hours * 3600000));
                    continue;
                }

                if (configKey === 'dry-run') {
                    // For checkboxes, FormData includes only checked boxes; but we handle explicit below. If present treat as true
                    config[configKey] = true;
                    continue;
                }
            }

            config[configKey] = value;
        }

        // Handle authentication method selection for Suwayomi
        if (type === 'suwa') {
            // Only basic auth is supported now
            config['token'] = '';
        }

        // Ensure dry-run checkbox is explicitly sent (false if unchecked)
        if (type === 'sync') {
            const dryRunEl = document.getElementById('dry-run');
            if (dryRunEl) {
                config['dry-run'] = (dryRunEl.checked === true) ? true : false;
            }
        }

        try {
            const response = await fetch(`/api/config/${type}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                this.showNotification('Configuration saved successfully', 'success');
                // Reload configuration to update forms
                await this.loadConfig();
                this.updateSyncDirectionFromConfig();
            } else {
                throw new Error('Failed to save configuration');
            }
        } catch (error) {
            console.error('Save config error:', error);
            this.showNotification('Failed to save configuration', 'error');
        }
    }

    // Update sync direction status when config is loaded
    updateSyncDirectionFromConfig() {
        this.loadConfig().then(config => {
            const direction = config.sync && config.sync.direction ? config.sync.direction : 'bidirectional';
            this.updateSyncDirectionStatus(direction);
        }).catch(error => {
            console.error('Error loading config for sync direction:', error);
        });
    }

    sendCommand(command) {
        this.socket.emit('command', { command });
        this.showNotification(`Command sent: ${command}`, 'info');
    }

    async testConnections() {
        this.showNotification('Testing connections...', 'info');

        try {
            const response = await fetch('/api/test-connections');
            const results = await response.json();

            let message = 'Connection test results:\n';
            message += `Komga: ${results.komga ? '✓ Connected' : '✗ Failed'}\n`;
            message += `Suwayomi: ${results.suwa ? '✓ Connected' : '✗ Failed'}`;

            this.showNotification(message, results.komga && results.suwa ? 'success' : 'error');
        } catch (error) {
            this.showNotification('Connection test failed', 'error');
        }
    }

    clearLogs() {
        this.logs = [];
        document.getElementById('logs-container').innerHTML = '';
    }

    downloadLogs() {
        const logText = this.logs.map(log =>
            `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`
        ).join('\n');

        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sync-logs-${new Date().toISOString()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    filterLogs(level) {
        const logsContainer = document.getElementById('logs-container');
        logsContainer.innerHTML = '';

        const filteredLogs = level === 'all' ?
            this.logs :
            this.logs.filter(log => {
                const levels = ['debug', 'info', 'warn', 'error'];
                return levels.indexOf(log.level) >= levels.indexOf(level);
            });

        filteredLogs.forEach(log => this.displayLog(log));
    }

    async checkAPIStatus() {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();

            this.updateAPIStatus('komga', status.komga);
            this.updateAPIStatus('suwa', status.suwa);
        } catch (error) {
            console.error('Status check error:', error);
        }
    }

    updateAPIStatus(api, status) {
        const dot = document.getElementById(`${api}-dot`);
        const text = document.getElementById(`${api}-status-text`);
        const details = document.getElementById(`${api}-details`);

        if (status.connected) {
            dot.className = 'status-dot connected';
            text.textContent = 'Connected';
            details.textContent = JSON.stringify(status.details, null, 2);
        } else {
            dot.className = 'status-dot error';
            text.textContent = 'Disconnected';
            details.textContent = status.error || 'Connection failed';
        }
    }

    async testAPI(api) {
        const dot = document.getElementById(`${api}-dot`);
        const text = document.getElementById(`${api}-status-text`);

        dot.className = 'status-dot loading';
        text.textContent = 'Testing...';

        try {
            // Create a timeout promise that rejects after 10 seconds
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Request timeout')), 10000);
            });

            // Race the fetch request against the timeout
            const response = await Promise.race([
                fetch(`/api/test-${api}`),
                timeoutPromise
            ]);

            const result = await response.json();

            if (result.success) {
                dot.className = 'status-dot connected';
                text.textContent = 'Connected';
                document.getElementById(`${api}-details`).textContent = JSON.stringify(result.data, null, 2);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            dot.className = 'status-dot error';
            text.textContent = 'Failed';
            document.getElementById(`${api}-details`).textContent = error.message;
        }
    }

    async quickAPITest(testType) {
        const responseElement = document.getElementById('api-response');

        try {
            const response = await fetch(`/api/quick-test/${testType}`);
            const result = await response.json();

            responseElement.textContent = JSON.stringify(result, null, 2);
        } catch (error) {
            responseElement.textContent = `Error: ${error.message}`;
        }
    }

    async getSchemaInfo() {
        const responseElement = document.getElementById('api-response');

        try {
            const response = await fetch('/api/schema-info');
            const result = await response.json();

            responseElement.textContent = JSON.stringify(result, null, 2);
        } catch (error) {
            responseElement.textContent = `Error: ${error.message}`;
        }
    }

    async loadMappings() {
        try {
            const [seriesResponse, chapterResponse] = await Promise.all([
                fetch('/api/mappings/series'),
                fetch('/api/mappings/chapters')
            ]);

            const seriesMappings = await seriesResponse.json();
            const chapterMappings = await chapterResponse.json();

            this.displaySeriesMappings(seriesMappings);
            this.displayChapterMappings(chapterMappings);
        } catch (error) {
            console.error('Load mappings error:', error);
        }
    }

    displaySeriesMappings(mappings) {
        const tbody = document.getElementById('series-tbody');
        tbody.innerHTML = '';

        mappings.forEach(mapping => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${mapping.komgaSeriesId}</td>
                <td>${mapping.suwaMangaId}</td>
                <td>${mapping.titleNorm}</td>
                <td>
                    <button class="btn btn-small btn-danger" onclick="deleteMapping('series', '${mapping.id}')">
                        Delete
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    displayChapterMappings(mappings) {
        const tbody = document.getElementById('chapter-tbody');
        tbody.innerHTML = '';

        mappings.forEach(mapping => {
            const row = document.createElement('tr');
            const lastSync = mapping.lastPushedKomga || mapping.lastPushedSuwa;
            const lastSyncFormatted = lastSync ? new Date(lastSync).toLocaleString() : 'Never';

            row.innerHTML = `
                <td>${mapping.komgaBookId}</td>
                <td>${mapping.suwaChapterId}</td>
                <td>${mapping.chapter}</td>
                <td>${lastSyncFormatted}</td>
            `;
            tbody.appendChild(row);
        });
    }

    switchAuthMethod(method) {
        // This method is deprecated - only basic auth is now supported for Suwayomi
        console.warn('switchAuthMethod is deprecated - only basic auth is supported');
    }

    async loadMatchedManga() {
        try {
            const response = await fetch('/api/matched-manga');
            const data = await response.json();

            this.displayMatchedManga(data.matched || [], data.invalid || []);
            document.getElementById('matched-count').textContent = `${data.total || 0} matched series${data.invalidCount ? ` (${data.invalidCount} invalid)` : ''}`;
        } catch (error) {
            console.error('Load matched manga error:', error);
            this.showNotification('Failed to load matched manga', 'error');
        }
    }

    displayMatchedManga(matched, invalid = []) {
        const container = document.getElementById('matched-manga-list');
        container.innerHTML = '';

        // Add cleanup button if there are invalid mappings
        if (invalid.length > 0) {
            const cleanupSection = document.createElement('div');
            cleanupSection.className = 'cleanup-section';
            cleanupSection.innerHTML = `
                <div class="cleanup-warning">
                    <strong>⚠️ ${invalid.length} Invalid Mapping(s) Found</strong>
                    <p>Some mappings reference manga that no longer exist in your libraries.</p>
                    <button class="btn btn-danger" onclick="cleanupMappings()">
                        Clean Up Invalid Mappings
                    </button>
                </div>
            `;
            container.appendChild(cleanupSection);
        }

        // Display invalid mappings first
        invalid.forEach(match => {
            const item = document.createElement('div');
            item.className = 'matched-item invalid-mapping';

            const komgaTitle = match.komga ? match.komga.metadata.title : 'Unknown (Deleted)';
            const suwaTitle = match.suwa ? match.suwa.title : 'Unknown (Deleted)';

            item.innerHTML = `
                <div class="matched-header invalid">
                    <strong>${komgaTitle}</strong> ↔ <strong>${suwaTitle}</strong>
                    <span class="status-badge invalid">INVALID</span>
                </div>
                <div class="matched-details">
                    <div>Komga ID: ${match.mapping.komgaSeriesId}</div>
                    <div>Suwayomi ID: ${match.mapping.suwaMangaId}</div>
                    <div>Issues: ${match.issues.join(', ')}</div>
                    <div>Created: ${new Date(match.mapping.createdAt).toLocaleString()}</div>
                </div>
            `;

            container.appendChild(item);
        });

        // Display valid mappings
        if (matched.length === 0 && invalid.length === 0) {
            container.innerHTML = '<p>No matched manga found.</p>';
            return;
        }

        matched.forEach(match => {
            const item = document.createElement('div');
            item.className = 'matched-item valid-mapping';

            const komgaTitle = match.komga ? match.komga.metadata.title : 'Unknown';
            const suwaTitle = match.suwa ? match.suwa.title : 'Unknown';

            item.innerHTML = `
                <div class="matched-header valid">
                    <strong>${komgaTitle}</strong> ↔ <strong>${suwaTitle}</strong>
                    <span class="status-badge valid">VALID</span>
                </div>
                <div class="matched-details">
                    <div>Komga ID: ${match.mapping.komgaSeriesId}</div>
                    <div>Suwayomi ID: ${match.mapping.suwaMangaId}</div>
                    <div>Normalized: ${match.mapping.titleNorm}</div>
                    <div>Created: ${new Date(match.mapping.createdAt).toLocaleString()}</div>
                </div>
            `;

            container.appendChild(item);
        });
    }

    async loadKomgaManga() {
        try {
            this.showNotification('Loading Komga manga...', 'info');
            const response = await fetch('/api/manga/komga');
            const data = await response.json();

            // Store the full data
            this.komgaManga = data.manga || [];
            
            // Clear search input
            const searchInput = document.getElementById('komga-search');
            if (searchInput) {
                searchInput.value = '';
            }
            
            // Display all manga initially
            this.displayKomgaManga(this.komgaManga);
            document.getElementById('komga-count').textContent = `${this.komgaManga.length} series`;
            this.showNotification('Komga manga loaded successfully', 'success');
        } catch (error) {
            console.error('Load Komga manga error:', error);
            this.showNotification('Failed to load Komga manga', 'error');
        }
    }

    async loadSuwayomiManga() {
        try {
            this.showNotification('Loading Suwayomi manga...', 'info');
            const response = await fetch('/api/manga/suwayomi');
            const data = await response.json();

            // Store the full data
            this.suwayomiManga = data.manga || [];
            
            // Clear search input
            const searchInput = document.getElementById('suwayomi-search');
            if (searchInput) {
                searchInput.value = '';
            }
            
            // Display all manga initially
            this.displaySuwayomiManga(this.suwayomiManga);
            document.getElementById('suwayomi-count').textContent = `${this.suwayomiManga.length} manga`;
            this.showNotification('Suwayomi manga loaded successfully', 'success');
        } catch (error) {
            console.error('Load Suwayomi manga error:', error);
            this.showNotification('Failed to load Suwayomi manga', 'error');
        }
    }

    filterKomgaManga(searchTerm) {
        if (!searchTerm.trim()) {
            // If search is empty, show all manga
            this.displayKomgaManga(this.komgaManga);
            document.getElementById('komga-count').textContent = `${this.komgaManga.length} series`;
            return;
        }

        const searchLower = searchTerm.toLowerCase().trim();
        const searchWords = searchLower.split(/\s+/).filter(word => word.length > 0);

        const filtered = this.komgaManga.filter(series => {
            const title = (series.metadata ? series.metadata.title : series.name || '').toLowerCase();
            const author = (series.metadata && series.metadata.authors ? series.metadata.authors.join(' ') : '').toLowerCase();
            const seriesId = series.id.toString().toLowerCase();

            // Check if all search words are found in any of the fields
            return searchWords.every(word =>
                title.includes(word) ||
                author.includes(word) ||
                seriesId.includes(word) ||
                // Also check for partial matches and fuzzy matching
                this.fuzzyMatch(title, word) ||
                this.fuzzyMatch(author, word)
            );
        });

        this.displayKomgaManga(filtered);
        document.getElementById('komga-count').textContent = `${filtered.length} of ${this.komgaManga.length} series`;
    }

    filterSuwayomiManga(searchTerm) {
        if (!searchTerm.trim()) {
            // If search is empty, show all manga
            this.displaySuwayomiManga(this.suwayomiManga);
            document.getElementById('suwayomi-count').textContent = `${this.suwayomiManga.length} manga`;
            return;
        }

        const searchLower = searchTerm.toLowerCase().trim();
        const searchWords = searchLower.split(/\s+/).filter(word => word.length > 0);

        const filtered = this.suwayomiManga.filter(manga => {
            const title = (manga.title || '').toLowerCase();
            const author = (manga.author || '').toLowerCase();
            const mangaId = manga.id.toString().toLowerCase();

            // Check if all search words are found in any of the fields
            return searchWords.every(word =>
                title.includes(word) ||
                author.includes(word) ||
                mangaId.includes(word) ||
                // Also check for partial matches and fuzzy matching
                this.fuzzyMatch(title, word) ||
                this.fuzzyMatch(author, word)
            );
        });

        this.displaySuwayomiManga(filtered);
        document.getElementById('suwayomi-count').textContent = `${filtered.length} of ${this.suwayomiManga.length} manga`;
    }

    // Simple fuzzy matching function
    fuzzyMatch(text, pattern) {
        if (!text || !pattern) return false;

        // Remove special characters and normalize
        const normalizedText = text.replace(/[^\w\s]/g, '').toLowerCase();
        const normalizedPattern = pattern.replace(/[^\w\s]/g, '').toLowerCase();

        // Exact match
        if (normalizedText.includes(normalizedPattern)) return true;

        // Check if pattern is contained in text as consecutive characters
        let patternIndex = 0;
        for (let i = 0; i < normalizedText.length && patternIndex < normalizedPattern.length; i++) {
            if (normalizedText[i] === normalizedPattern[patternIndex]) {
                patternIndex++;
            }
        }
        return patternIndex === normalizedPattern.length;
    }

    displayKomgaManga(manga) {
        const container = document.getElementById('komga-manga-list');
        container.innerHTML = '';

        if (manga.length === 0) {
            if (this.komgaManga.length === 0) {
                container.innerHTML = '<p>No Komga series found.</p>';
            } else {
                container.innerHTML = '<p>No Komga series match your search.</p>';
            }
            return;
        }

        manga.forEach(series => {
            const item = document.createElement('div');
            item.className = 'manga-item clickable';
            item.dataset.seriesId = series.id;
            item.dataset.type = 'komga';

            const title = series.metadata ? series.metadata.title : series.name || 'Unknown Title';
            const author = series.metadata && series.metadata.authors ? series.metadata.authors.join(', ') : 'Unknown Author';
            const status = series.metadata ? series.metadata.status : 'Unknown';
            const booksCount = series.booksCount || 0;

            item.innerHTML = `
                <div class="manga-header">
                    <strong>${title}</strong>
                    <span class="click-hint">Click to view books</span>
                </div>
                <div class="manga-details">
                    <div>Author: ${author}</div>
                    <div>Status: ${status}</div>
                    <div>Books: ${booksCount}</div>
                    <div>ID: ${series.id}</div>
                </div>
            `;

            // Add click handler
            item.addEventListener('click', () => {
                this.showKomgaBooks(series.id, title);
            });

            container.appendChild(item);
        });
    }

    displaySuwayomiManga(manga) {
        const container = document.getElementById('suwayomi-manga-list');
        container.innerHTML = '';

        if (manga.length === 0) {
            if (this.suwayomiManga.length === 0) {
                container.innerHTML = '<p>No Suwayomi manga found.</p>';
            } else {
                container.innerHTML = '<p>No Suwayomi manga match your search.</p>';
            }
            return;
        }

        manga.forEach(mangaItem => {
            const item = document.createElement('div');
            item.className = 'manga-item clickable';
            item.dataset.mangaId = mangaItem.id;
            item.dataset.type = 'suwayomi';

            const title = mangaItem.title || 'Unknown Title';
            const author = mangaItem.author || 'Unknown Author';
            const status = mangaItem.status || 'Unknown';
            const chaptersCount = mangaItem.chapters ? mangaItem.chapters.length : 0;

            item.innerHTML = `
                <div class="manga-header">
                    <strong>${title}</strong>
                    <span class="click-hint">Click to view chapters</span>
                </div>
                <div class="manga-details">
                    <div>Author: ${author}</div>
                    <div>Status: ${status}</div>
                    <div>Chapters: ${chaptersCount}</div>
                    <div>ID: ${mangaItem.id}</div>
                </div>
            `;

            // Add click handler
            item.addEventListener('click', () => {
                this.showSuwayomiChapters(mangaItem.id, title);
            });

            container.appendChild(item);
        });
    }

    async showKomgaBooks(seriesId, seriesTitle) {
        try {
            this.showNotification(`Loading books for ${seriesTitle}...`, 'info');

            // Fetch books for this series
            const response = await fetch(`/api/komga/series/${seriesId}/books`);
            if (!response.ok) {
                throw new Error(`Failed to fetch books: ${response.status}`);
            }

            const books = await response.json();
            this.displayBooksModal(seriesTitle, books, 'komga');
        } catch (error) {
            console.error('Error fetching Komga books:', error);
            this.showNotification('Failed to load books', 'error');
        }
    }

    async showSuwayomiChapters(mangaId, mangaTitle) {
        try {
            this.showNotification(`Loading chapters for ${mangaTitle}...`, 'info');

            // Fetch chapters for this manga
            const response = await fetch(`/api/suwayomi/manga/${mangaId}/chapters`);
            if (!response.ok) {
                throw new Error(`Failed to fetch chapters: ${response.status}`);
            }

            const chapters = await response.json();
            this.displayChaptersModal(mangaTitle, chapters, 'suwayomi');
        } catch (error) {
            console.error('Error fetching Suwayomi chapters:', error);
            this.showNotification('Failed to load chapters', 'error');
        }
    }

    displayBooksModal(seriesTitle, books, type) {
        // Create modal container
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${seriesTitle} - Books</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="books-list" id="books-list"></div>
                </div>
            </div>
        `;

        // Add to DOM
        document.body.appendChild(modal);

        // Populate books list
        const booksList = modal.querySelector('#books-list');
        if (books && books.length > 0) {
            books.forEach(book => {
                const bookItem = document.createElement('div');
                bookItem.className = 'book-item';

                const title = book.metadata ? book.metadata.title : book.name || 'Unknown Book';
                const number = book.metadata ? book.metadata.number : book.number || 'N/A';
                const pages = book.media ? book.media.pagesCount : book.pagesCount || 0;
                const size = this.formatBytes(book.sizeBytes || 0);
                const readProgress = book.readProgress;
                const isRead = readProgress ? readProgress.completed : false;
                const readStatus = isRead ? '✓ Read' : '○ Unread';
                const readDate = readProgress && readProgress.readDate ? new Date(readProgress.readDate).toLocaleDateString() : '';
                const lastPageRead = readProgress ? readProgress.page || 0 : 0;
                const progressText = readProgress && pages > 0 ? `${lastPageRead}/${pages} pages` : '';

                bookItem.innerHTML = `
                    <div class="book-header">
                        <strong>Book ${number}: ${title}</strong>
                        <span class="read-status ${isRead ? 'read' : 'unread'}">${readStatus}</span>
                    </div>
                    <div class="book-details">
                        <div>Pages: ${pages}</div>
                        <div>Size: ${size}</div>
                        <div>ID: ${book.id}</div>
                        ${progressText ? `<div>Progress: ${progressText}</div>` : ''}
                        ${readDate ? `<div>Last Read: ${readDate}</div>` : ''}
                        ${!readProgress ? '<div class="read-progress-unavailable">Read progress unavailable</div>' : ''}
                    </div>
                `;

                booksList.appendChild(bookItem);
            });
        } else {
            booksList.innerHTML = '<p>No books found for this series.</p>';
        }

        // Add close functionality
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    displayChaptersModal(mangaTitle, chapters, type) {
        // Create modal container
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${mangaTitle} - Chapters</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="chapters-list" id="chapters-list"></div>
                </div>
            </div>
        `;

        // Add to DOM
        document.body.appendChild(modal);

        // Populate chapters list
        const chaptersList = modal.querySelector('#chapters-list');
        if (chapters && chapters.length > 0) {
            chapters.forEach(chapter => {
                const chapterItem = document.createElement('div');
                chapterItem.className = 'chapter-item';

                const title = chapter.name || chapter.title || `Chapter ${chapter.chapterNumber || chapter.number || 'N/A'}`;
                const number = chapter.chapterNumber || chapter.number || 'N/A';
                const pages = chapter.pageCount || chapter.pagesCount || 0;
                const scanlator = chapter.scanlator || 'Unknown';
                const isRead = chapter.isRead || false;
                const isDownloaded = chapter.isDownloaded || false;
                const isBookmarked = chapter.isBookmarked || false;
                const readStatus = isRead ? '✓ Read' : '○ Unread';
                const downloadStatus = isDownloaded ? '⬇ Downloaded' : '○ Not Downloaded';
                const bookmarkStatus = isBookmarked ? '★ Bookmarked' : '';
                const lastReadAt = chapter.lastReadAt ? new Date(chapter.lastReadAt).toLocaleDateString() : '';
                const uploadDate = chapter.uploadDate ? new Date(chapter.uploadDate).toLocaleDateString() : '';

                chapterItem.innerHTML = `
                    <div class="chapter-header">
                        <strong>Chapter ${number}: ${title}</strong>
                        <div class="chapter-status">
                            <span class="read-status ${isRead ? 'read' : 'unread'}">${readStatus}</span>
                            <span class="download-status ${isDownloaded ? 'downloaded' : 'not-downloaded'}">${downloadStatus}</span>
                            ${bookmarkStatus ? `<span class="bookmark-status">${bookmarkStatus}</span>` : ''}
                        </div>
                    </div>
                    <div class="chapter-details">
                        <div>Pages: ${pages}</div>
                        <div>Scanlator: ${scanlator}</div>
                        <div>ID: ${chapter.id}</div>
                        ${lastReadAt ? `<div>Last Read: ${lastReadAt}</div>` : ''}
                        ${uploadDate ? `<div>Upload Date: ${uploadDate}</div>` : ''}
                        ${chapter.lastPageRead ? `<div>Last Page Read: ${chapter.lastPageRead}</div>` : ''}
                    </div>
                `;

                chaptersList.appendChild(chapterItem);
            });
        } else {
            chaptersList.innerHTML = '<p>No chapters found for this manga.</p>';
        }

        // Add close functionality
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showNotification(message, type) {
        if (typeof type === 'undefined') {
            type = 'info';
        }
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '10000',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            maxWidth: '300px',
            wordWrap: 'break-word',
            opacity: '0',
            transform: 'translateY(-20px)',
            transition: 'all 0.3s ease'
        });

        // Set background color based on type
        const colors = {
            success: '#2ed573',
            error: '#ff4757',
            info: '#3742fa',
            warning: '#ffa502'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        // Add to DOM
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);

        // Remove after 4 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }

    loadSyncLog() {
        this.fetchSyncLog();
    }

    fetchSyncLog() {
        // Update status
        const statusElement = document.getElementById('sync-log-status');
        if (statusElement) {
            statusElement.textContent = 'Loading...';
        }

        fetch('/debug-sync-log')
            .then(response => {
                const contentType = response.headers.get('content-type') || '';

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                if (!contentType.includes('application/json')) {
                    return response.text().then(text => {
                        const snippet = text.slice(0, 300);
                        throw new Error('Expected JSON but received HTML: ' + snippet);
                    });
                }

                return response.json();
            })
            .then(data => {
                this.displaySyncLog(data);
                if (statusElement) {
                    statusElement.textContent = `Loaded ${data.length} activities`;
                }
            })
            .catch(error => {
                console.error('Error fetching sync log:', error);
                this.showError('Failed to load sync log: ' + (error.message || String(error)));
                if (statusElement) {
                    statusElement.textContent = 'Error loading activities';
                }
            });
    }

    displaySyncLog(logData) {
        const komgaContainer = document.getElementById('komga-sync-entries');
        const suwayomiContainer = document.getElementById('suwayomi-sync-entries');

        if (!komgaContainer || !suwayomiContainer) return;

        // Clear both containers
        komgaContainer.innerHTML = '';
        suwayomiContainer.innerHTML = '';

        if (!logData || logData.length === 0) {
            const emptyMessage = `
                <div class="sync-log-empty">
                    <h4>No recent activities found</h4>
                    <p>To see activities in the sync log:</p>
                    <ul>
                        <li><strong>Read manga</strong> in Komga or Suwayomi</li>
                        <li><strong>Trigger a manual sync</strong> using the button above</li>
                        <li><strong>Start automatic sync</strong> from the Dashboard tab</li>
                        <li><strong>Set up mappings</strong> between your Komga series and Suwayomi manga</li>
                    </ul>
                    <p><em>The sync log shows current reading progress and recent activities from both applications.</em></p>
                </div>
            `;
            komgaContainer.innerHTML = emptyMessage;
            suwayomiContainer.innerHTML = emptyMessage;
            return;
        }

        // Separate entries by app
        const komgaEntries = logData.filter(entry =>
            entry.type.includes('komga') || entry.type === 'komga-to-suwa'
        );
        const suwayomiEntries = logData.filter(entry =>
            entry.type.includes('suwayomi') || entry.type === 'suwa-to-komga'
        );

        // Display Komga entries
        if (komgaEntries.length === 0) {
            komgaContainer.innerHTML = `
                <div class="sync-log-empty">
                    <h4>No Komga activities</h4>
                    <p>Start reading manga in Komga to see activities here.</p>
                </div>
            `;
        } else {
            komgaEntries.forEach(entry => {
                const entryDiv = this.createSyncActivityItem(entry);
                komgaContainer.appendChild(entryDiv);
            });
        }

        // Display Suwayomi entries
        if (suwayomiEntries.length === 0) {
            suwayomiContainer.innerHTML = `
                <div class="sync-log-empty">
                    <h4>No Suwayomi activities</h4>
                    <p>Start reading manga in Suwayomi to see activities here.</p>
                </div>
            `;
        } else {
            suwayomiEntries.forEach(entry => {
                const entryDiv = this.createSyncActivityItem(entry);
                suwayomiContainer.appendChild(entryDiv);
            });
        }
    }

    createSyncActivityItem(entry) {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'sync-activity-item';

        const timestamp = new Date(entry.timestamp).toLocaleString();
        const statusClass = this.getStatusClass(entry.status);
        const statusText = this.getStatusText(entry.status);

        // Determine direction class for sync operations
        let directionClass = '';
        if (entry.type === 'komga-to-suwa') {
            directionClass = 'komga-to-suwa';
        } else if (entry.type === 'suwa-to-komga') {
            directionClass = 'suwa-to-komga';
        }

        // Create progress bar for reading progress entries
        let progressBar = '';
        if (entry.progress) {
            const { currentPage, totalPages, percentage, completed } = entry.progress;
            const progressColor = completed ? '#2ed573' : '#667eea';
            progressBar = `
                <div class="reading-progress">
                    <div class="progress-info">
                        <span>Page ${currentPage} of ${totalPages}</span>
                        <span>${percentage}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${percentage}%; background-color: ${progressColor};"></div>
                    </div>
                    ${completed ? '<div class="completed-badge">✓ COMPLETED</div>' : ''}
                </div>
            `;
        }

        entryDiv.innerHTML = `
            <div class="sync-activity-header">
                <span class="sync-status-indicator ${statusClass}" title="${statusText}"></span>
                <span class="sync-timestamp">${timestamp}</span>
                ${directionClass ? `<span class="sync-direction ${directionClass}">${entry.type.replace('-', ' → ')}</span>` : ''}
            </div>
            <div class="sync-activity-content">
                <p><strong>Manga:</strong> ${entry.mangaTitle || 'Unknown'}</p>
                ${entry.chapterTitle ? `<p><strong>Chapter:</strong> ${entry.chapterTitle}</p>` : ''}
                <p><strong>Action:</strong> ${entry.action || 'Unknown'}</p>
                ${entry.details ? `<p><strong>Details:</strong> ${entry.details}</p>` : ''}
                ${progressBar}
                ${entry.error ? `<p class="error"><strong>Error:</strong> ${entry.error}</p>` : ''}
            </div>
        `;

        return entryDiv;
    }

    getStatusClass(status) {
        switch (status) {
            case 'success': return 'status-success';
            case 'error': return 'status-error';
            case 'warning': return 'status-warning';
            case 'info': return 'status-info';
            default: return 'status-info';
        }
    }

    getStatusText(status) {
        switch (status) {
            case 'success': return 'Success';
            case 'error': return 'Error';
            case 'warning': return 'Warning';
            case 'info': return 'Info';
            default: return 'Unknown';
        }
    }

    triggerManualSync() {
        const button = document.getElementById('trigger-manual-sync');
        if (button) {
            button.disabled = true;
            button.textContent = 'Syncing...';
        }

        this.showNotification('Starting manual sync...', 'info');

        // Get the configured sync direction
        this.loadConfig().then(config => {
            const direction = config.sync && config.sync.direction ? config.sync.direction : 'bidirectional';
            let endpoint = '/manual-sync';

            // Choose the appropriate endpoint based on direction
            if (direction === 'komga-to-suwa') {
                endpoint = '/manual-sync-komga-to-suwa';
            } else if (direction === 'suwa-to-komga') {
                endpoint = '/manual-sync-suwa-to-komga';
            }

            fetch(endpoint, { method: 'POST' })
                .then(response => response.json())
                .then(async data => {
                    if (data.success) {
                        this.showSuccess('Manual sync completed successfully');
                        this.loadSyncLog(); // Refresh the log
                        // Refresh stats immediately
                        await this.loadInitialData();
                        // Start countdown timer
                        if (config.sync && config.sync.interval) {
                            this.startCountdownTimer(parseInt(config.sync.interval));
                        }
                    } else {
                        this.showError('Manual sync failed: ' + (data.error || 'Unknown error'));
                    }
                })
                .catch(error => {
                    console.error('Error triggering manual sync:', error);
                    this.showError('Failed to trigger manual sync');
                })
                .finally(() => {
                    if (button) {
                        button.disabled = false;
                        button.textContent = 'Trigger Manual Sync';
                    }
                });
        }).catch(error => {
            console.error('Error loading config for manual sync:', error);
            this.showError('Failed to load configuration for manual sync');
            if (button) {
                button.disabled = false;
                button.textContent = 'Trigger Manual Sync';
            }
        });
    }

    clearSyncLog() {
        if (confirm('Are you sure you want to clear the sync log? This will clear recent activities.')) {
            fetch('/clear-sync-log', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        this.showSuccess('Sync log cleared successfully');
                        this.loadSyncLog();
                    } else {
                        this.showError('Failed to clear sync log');
                    }
                })
                .catch(error => {
                    console.error('Error clearing sync log:', error);
                    this.showError('Failed to clear sync log');
                });
        }
    }

    syncKomgaToSuwa() {
        const button = document.getElementById('sync-komga-to-suwa');
        if (button) {
            button.disabled = true;
            button.textContent = 'Syncing...';
        }

        this.showNotification('Syncing Komga progress to Suwayomi...', 'info');

        fetch('/manual-sync-komga-to-suwa', { method: 'POST' })
            .then(response => response.json())
            .then(async data => {
                if (data.success) {
                    this.showSuccess('Komga → Suwayomi sync completed successfully');
                    this.loadSyncLog(); // Refresh the log
                    // Refresh stats immediately
                    await this.loadInitialData();
                    // Start countdown timer
                    this.loadConfig().then(config => {
                        if (config.sync && config.sync.interval) {
                            this.startCountdownTimer(parseInt(config.sync.interval));
                        }
                    });
                } else {
                    this.showError('Sync failed: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Error syncing Komga to Suwayomi:', error);
                this.showError('Failed to sync Komga to Suwayomi');
            })
            .finally(() => {
                if (button) {
                    button.disabled = false;
                    button.textContent = 'Sync Komga → Suwayomi';
                }
            });
    }

    syncSuwaToKomga() {
        const button = document.getElementById('sync-suwa-to-komga');
        if (button) {
            button.disabled = true;
            button.textContent = 'Syncing...';
        }

        this.showNotification('Syncing Suwayomi progress to Komga...', 'info');

        fetch('/manual-sync-suwa-to-komga', { method: 'POST' })
            .then(response => response.json())
            .then(async data => {
                if (data.success) {
                    this.showSuccess('Suwayomi → Komga sync completed successfully');
                    this.loadSyncLog(); // Refresh the log
                    // Refresh stats immediately
                    await this.loadInitialData();
                    // Start countdown timer
                    this.loadConfig().then(config => {
                        if (config.sync && config.sync.interval) {
                            this.startCountdownTimer(parseInt(config.sync.interval));
                        }
                    });
                } else {
                    this.showError('Sync failed: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Error syncing Suwayomi to Komga:', error);
                this.showError('Failed to sync Suwayomi to Komga');
            })
            .finally(() => {
                if (button) {
                    button.disabled = false;
                    button.textContent = 'Sync Suwayomi → Komga';
                }
            });
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    // User event logging method
    logUserEvent(eventType, details) {
        const eventData = {
            timestamp: new Date().toISOString(),
            type: 'user_event',
            eventType: eventType,
            app: 'dashboard',
            details: details || {},
            userAgent: navigator.userAgent
        };

        // Send to backend for logging
        fetch('/api/log-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventData)
        }).catch(error => {
            console.error('Failed to log user event:', error);
        });
    }
}

// Global function for tab switching (used in HTML onclick)
function showTab(tabId) {
    if (window.dashboard && typeof window.dashboard.showTab === 'function') {
        window.dashboard.showTab(tabId);
    } else {
        // If dashboard is not ready, wait a bit and try again
        setTimeout(() => {
            if (window.dashboard && typeof window.dashboard.showTab === 'function') {
                window.dashboard.showTab(tabId);
            }
        }, 100);
    }
}

// Global function for authentication method switching
function switchAuthMethod(method) {
    if (window.dashboard && typeof window.dashboard.switchAuthMethod === 'function') {
        window.dashboard.switchAuthMethod(method);
    }
}

// Global function for cleaning up invalid mappings
async function cleanupMappings() {
    if (!confirm('Are you sure you want to clean up invalid mappings? This will permanently delete mappings for manga that no longer exist in your libraries.')) {
        return;
    }

    try {
        const response = await fetch('/api/cleanup-mappings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({})
        });

        const result = await response.json();

        if (result.success) {
            window.dashboard.showNotification(`Cleanup completed: ${result.message}`, 'success');
            // Refresh the matched manga list
            window.dashboard.loadMatchedManga();
            // Refresh stats
            window.dashboard.checkAPIStatus();
        } else {
            throw new Error(result.error || 'Cleanup failed');
        }
    } catch (error) {
        console.error('Cleanup error:', error);
        window.dashboard.showNotification('Failed to cleanup mappings', 'error');
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new SyncDashboard();

    // Add sync log event listeners
    const refreshBtn = document.getElementById('sync-log-refresh');
    const manualSyncBtn = document.getElementById('manual-sync-btn');
    const clearBtn = document.getElementById('sync-log-clear');
    const filterSelect = document.getElementById('sync-log-filter');
    const searchInput = document.getElementById('sync-log-search');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            window.dashboard.fetchSyncLog();
        });
    }

    if (manualSyncBtn) {
        manualSyncBtn.addEventListener('click', () => {
            window.dashboard.triggerManualSync();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            window.dashboard.clearSyncLog();
        });
    }

    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            window.dashboard.filterSyncLog();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            window.dashboard.filterSyncLog();
        });
    }
});
