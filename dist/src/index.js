"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const path_1 = __importDefault(require("path"));
const logger_1 = require("./utils/logger");
const sync_1 = require("./core/sync");
const mappingRepo_1 = require("./core/mappingRepo");
const komga_1 = require("./clients/komga");
const suwa_1 = require("./clients/suwa");
const matcher_1 = require("./core/matcher");
const normalize_1 = require("./utils/normalize");
class WebDashboard {
    constructor() {
        this.isRunning = false;
        this.syncInterval = null;
        this.stats = {
            seriesMappings: 0,
            chapterMappings: 0,
            syncCycles: 0,
            errors: 0
        };
        this.app = (0, express_1.default)();
        this.server = (0, http_1.createServer)(this.app);
        this.io = new socket_io_1.Server(this.server);
        this.mappingRepo = new mappingRepo_1.MappingRepository();
        this.komgaClient = new komga_1.KomgaClient(this.mappingRepo);
        this.suwaClient = new suwa_1.SuwaClient(this.mappingRepo);
        this.matcher = new matcher_1.Matcher();
        this.syncService = new sync_1.SyncService(this.komgaClient, this.suwaClient, this.mappingRepo, this.matcher);
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }
    setupMiddleware() {
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
    }
    setupRoutes() {
        // Serve main dashboard
        this.app.get('/', (req, res) => {
            res.sendFile(path_1.default.join(process.cwd(), 'public/index.html'));
        });
        // Health endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                isRunning: this.isRunning
            });
        });
        // API endpoints
        this.app.get('/api/stats', this.getStats.bind(this));
        this.app.get('/api/status', this.getStatus.bind(this));
        this.app.get('/api/config', this.getConfig.bind(this));
        this.app.post('/api/config/:type', this.saveConfig.bind(this));
        this.app.get('/api/test-connections', this.testConnections.bind(this));
        this.app.get('/api/test-komga', this.testKomga.bind(this));
        this.app.get('/api/test-suwa', this.testSuwa.bind(this));
        this.app.get('/api/quick-test/:type', this.quickTest.bind(this));
        this.app.get('/api/schema-info', this.getSchemaInfo.bind(this));
        this.app.post('/api/test-graphql', this.testGraphQL.bind(this));
        this.app.get('/api/mappings/series', this.getSeriesMappings.bind(this));
        this.app.get('/api/mappings/chapters', this.getChapterMappings.bind(this));
        this.app.get('/api/matched-manga', this.getMatchedManga.bind(this));
        this.app.post('/cleanup-mappings', this.cleanupMappings.bind(this));
        this.app.get('/debug-ids', this.debugIds.bind(this));
        this.app.get('/debug-sync-log', this.getSyncLog.bind(this));
        this.app.post('/manual-sync', this.manualSync.bind(this));
        this.app.post('/clear-sync-log', this.clearSyncLog.bind(this));
        this.app.post('/api/sync-komga-progress', this.syncKomgaProgress.bind(this));
        this.app.post('/api/sync-suwa-progress', this.syncSuwaProgress.bind(this));
        this.app.get('/api/manga/komga', this.getKomgaManga.bind(this));
        this.app.get('/api/manga/suwayomi', this.getSuwayomiManga.bind(this));
        this.app.get('/api/komga/series/:seriesId/books', this.getKomgaBooks.bind(this));
        this.app.get('/api/suwayomi/manga/:mangaId/chapters', this.getSuwayomiChapters.bind(this));
        this.app.post('/api/log-event', this.logEvent.bind(this));
    }
    setupWebSocket() {
        this.io.on('connection', (socket) => {
            logger_1.logger.info('WebSocket client connected');
            // Send initial stats
            socket.emit('stats-update', this.stats);
            socket.emit('sync-status', {
                isRunning: this.isRunning,
                lastSync: new Date().toISOString()
            });
            socket.on('command', (data) => {
                this.handleCommand({ body: data }, {
                    json: (result) => {
                        socket.emit('command-response', result);
                    },
                    status: (code) => ({
                        json: (result) => {
                            socket.emit('command-response', { error: result.error, status: code });
                        }
                    })
                });
            });
            socket.on('disconnect', () => {
                logger_1.logger.info('WebSocket client disconnected');
            });
        });
        // Override logger to also send to WebSocket
        const originalLogger = logger_1.logger;
        const self = this;
        global.originalLogger = originalLogger;
        global.webDashboard = this;
    }
    async getStats(req, res) {
        try {
            const [seriesCount, chapterCount] = await Promise.all([
                this.mappingRepo.getSeriesMappingCount(),
                this.mappingRepo.getChapterMappingCount()
            ]);
            this.stats = {
                seriesMappings: seriesCount,
                chapterMappings: chapterCount,
                syncCycles: this.stats.syncCycles,
                errors: this.stats.errors
            };
            res.json(this.stats);
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to get stats');
            res.status(500).json({ error: 'Failed to get stats' });
        }
    }
    async getStatus(req, res) {
        try {
            const [komgaStatus, suwaStatus] = await Promise.all([
                this.checkKomgaStatus(),
                this.checkSuwaStatus()
            ]);
            res.json({
                komga: komgaStatus,
                suwa: suwaStatus
            });
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to get status');
            res.status(500).json({ error: 'Failed to get status' });
        }
    }
    async checkKomgaStatus() {
        try {
            await this.komgaClient.getSeries();
            return { connected: true, details: { status: 'Connected' } };
        }
        catch (error) {
            return { connected: false, error: error.message };
        }
    }
    async checkSuwaStatus() {
        try {
            await this.suwaClient.getLibrary();
            return { connected: true, details: { status: 'Connected' } };
        }
        catch (error) {
            return { connected: false, error: error.message };
        }
    }
    getConfig(req, res) {
        res.json({
            komga: {
                base: process.env.KOMGA_BASE,
                user: process.env.KOMGA_USER,
                pass: process.env.KOMGA_PASS ? '********' : ''
            },
            suwa: {
                base: process.env.SUWA_BASE,
                token: process.env.SUWA_TOKEN ? '********' : '',
                user: process.env.SUWA_USER || '',
                pass: process.env.SUWA_PASS ? '********' : ''
            },
            sync: {
                interval: process.env.SYNC_INTERVAL_MS,
                threshold: process.env.FUZZY_THRESHOLD,
                level: process.env.LOG_LEVEL,
                dryRun: process.env.SYNC_DRY_RUN
            }
        });
    }
    saveConfig(req, res) {
        const { type } = req.params;
        const config = req.body;
        try {
            // Update environment variables (Note: these won't persist across restarts)
            if (type === 'komga') {
                if (config['komga-base'])
                    process.env.KOMGA_BASE = config['komga-base'];
                if (config['komga-user'])
                    process.env.KOMGA_USER = config['komga-user'];
                if (config['komga-pass'])
                    process.env.KOMGA_PASS = config['komga-pass'];
            }
            else if (type === 'suwa') {
                if (config['suwa-base'])
                    process.env.SUWA_BASE = config['suwa-base'];
                if (config['suwa-token'])
                    process.env.SUWA_TOKEN = config['suwa-token'];
                if (config['suwa-user'])
                    process.env.SUWA_USER = config['suwa-user'];
                if (config['suwa-pass'])
                    process.env.SUWA_PASS = config['suwa-pass'];
            }
            else if (type === 'sync') {
                if (config['sync-interval'])
                    process.env.SYNC_INTERVAL_MS = config['sync-interval'];
                if (config['fuzzy-threshold'])
                    process.env.FUZZY_THRESHOLD = config['fuzzy-threshold'];
                if (config['log-level'])
                    process.env.LOG_LEVEL = config['log-level'];
                process.env.SYNC_DRY_RUN = config['dry-run'] ? 'true' : 'false';
            }
            // Try to update .env file for persistence
            this.updateEnvFile(type, config);
            // Recreate clients with new configuration
            this.recreateClients();
            logger_1.logger.info({ type, config }, 'Configuration updated and clients recreated');
            // For Suwayomi, log which authentication method is being used
            if (type === 'suwa') {
                if (config['suwa-user'] && config['suwa-pass']) {
                    logger_1.logger.info('Suwayomi basic authentication configured');
                }
                else if (config['suwa-token']) {
                    logger_1.logger.info('Suwayomi token authentication configured');
                }
                else {
                    logger_1.logger.info('No Suwayomi authentication configured');
                }
            }
            // Emit activity to WebSocket
            this.io.emit('activity', {
                message: `Configuration updated: ${type}`,
                type: 'config'
            });
            res.json({
                success: true,
                message: 'Configuration saved successfully',
                restartRequired: false
            });
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to save config');
            res.status(500).json({ error: 'Failed to save configuration' });
        }
    }
    updateEnvFile(type, config) {
        try {
            const fs = require('fs');
            const path = require('path');
            const envPath = path.join(process.cwd(), '.env');
            let envContent = '';
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
            }
            const lines = envContent.split('\n');
            if (type === 'komga') {
                this.updateEnvLine(lines, 'KOMGA_BASE', config['komga-base']);
                this.updateEnvLine(lines, 'KOMGA_USER', config['komga-user']);
                this.updateEnvLine(lines, 'KOMGA_PASS', config['komga-pass']);
            }
            else if (type === 'suwa') {
                this.updateEnvLine(lines, 'SUWA_BASE', config['suwa-base']);
                this.updateEnvLine(lines, 'SUWA_TOKEN', config['suwa-token']);
                this.updateEnvLine(lines, 'SUWA_USER', config['suwa-user']);
                this.updateEnvLine(lines, 'SUWA_PASS', config['suwa-pass']);
            }
            else if (type === 'sync') {
                this.updateEnvLine(lines, 'SYNC_INTERVAL_MS', config['sync-interval']);
                this.updateEnvLine(lines, 'FUZZY_THRESHOLD', config['fuzzy-threshold']);
                this.updateEnvLine(lines, 'LOG_LEVEL', config['log-level']);
                this.updateEnvLine(lines, 'SYNC_DRY_RUN', config['dry-run'] ? 'true' : 'false');
            }
            fs.writeFileSync(envPath, lines.join('\n'));
        }
        catch (error) {
            logger_1.logger.warn(error, 'Failed to update .env file');
        }
    }
    updateEnvLine(lines, key, value) {
        const index = lines.findIndex(line => line.startsWith(`${key}=`));
        const newLine = `${key}=${value || ''}`;
        if (index >= 0) {
            lines[index] = newLine;
        }
        else {
            lines.push(newLine);
        }
    }
    recreateClients() {
        // Recreate clients with new configuration
        this.komgaClient = new komga_1.KomgaClient(this.mappingRepo);
        this.suwaClient = new suwa_1.SuwaClient(this.mappingRepo);
        // Recreate sync service with new clients
        this.syncService = new sync_1.SyncService(this.komgaClient, this.suwaClient, this.mappingRepo, this.matcher);
    }
    async testConnections(req, res) {
        try {
            const [komgaOk, suwaOk] = await Promise.all([
                this.checkKomgaStatus().then(s => s.connected),
                this.checkSuwaStatus().then(s => s.connected)
            ]);
            res.json({
                komga: komgaOk,
                suwa: suwaOk
            });
        }
        catch (error) {
            res.status(500).json({ error: 'Connection test failed' });
        }
    }
    async testKomga(req, res) {
        try {
            const series = await this.komgaClient.getSeries();
            res.json({
                success: true,
                data: {
                    seriesCount: series.length,
                    sample: series.slice(0, 3)
                }
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    async testSuwa(req, res) {
        try {
            const library = await this.suwaClient.getLibrary();
            res.json({
                success: true,
                data: {
                    mangaCount: library.length,
                    sample: library.slice(0, 3)
                }
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    async quickTest(req, res) {
        const { type } = req.params;
        try {
            let result = {};
            switch (type) {
                case 'komga-series':
                    result = await this.komgaClient.getSeries();
                    break;
                case 'suwa-library':
                    result = await this.suwaClient.getLibrary();
                    break;
                case 'mapping-count':
                    const [seriesCount, chapterCount] = await Promise.all([
                        this.mappingRepo.getSeriesMappingCount(),
                        this.mappingRepo.getChapterMappingCount()
                    ]);
                    result = { seriesMappings: seriesCount, chapterMappings: chapterCount };
                    break;
                default:
                    throw new Error('Unknown test type');
            }
            res.json(result);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async getSeriesMappings(req, res) {
        try {
            const mappings = await this.mappingRepo.getAllSeriesMappings();
            res.json(mappings);
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to get series mappings' });
        }
    }
    async getSchemaInfo(req, res) {
        try {
            const schema = await this.suwaClient.getSchemaInfo();
            res.json(schema);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async testGraphQL(req, res) {
        const { query } = req.body;
        try {
            // Create a temporary GraphQL client to test the query
            const { GraphQLClient, gql } = require('graphql-request');
            const headers = {};
            if (process.env.SUWA_TOKEN) {
                headers['Authorization'] = `Bearer ${process.env.SUWA_TOKEN}`;
            }
            else if (process.env.SUWA_USER && process.env.SUWA_PASS) {
                const credentials = Buffer.from(`${process.env.SUWA_USER}:${process.env.SUWA_PASS}`).toString('base64');
                headers['Authorization'] = `Basic ${credentials}`;
            }
            const client = new GraphQLClient(`${process.env.SUWA_BASE}/api/graphql`, { headers });
            const data = await client.request(gql `${query}`);
            res.json({ success: true, data });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async getChapterMappings(req, res) {
        try {
            const mappings = await this.mappingRepo.getAllChapterMaps();
            res.json(mappings);
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to get chapter mappings' });
        }
    }
    async getMatchedManga(req, res) {
        try {
            const komgaSeries = await this.komgaClient.getSeries();
            const suwaLibrary = await this.suwaClient.getLibrary();
            // Get existing mappings
            const seriesMappings = await this.mappingRepo.getAllSeriesMappings();
            // Create maps by name for validation instead of ID
            const komgaMapByName = new Map();
            const suwaMapByName = new Map();
            // Normalize and map Komga series by title
            komgaSeries.forEach((series) => {
                const normalizedTitle = (0, normalize_1.normalizeTitle)(series.metadata?.title || series.name || '');
                komgaMapByName.set(normalizedTitle, series);
            });
            // Normalize and map Suwayomi manga by title
            suwaLibrary.forEach((manga) => {
                const normalizedTitle = (0, normalize_1.normalizeTitle)(manga.title || '');
                suwaMapByName.set(normalizedTitle, manga);
            });
            // Debug: Log some sample data
            logger_1.logger.info({
                mappingCount: seriesMappings.length,
                komgaSampleTitles: Array.from(komgaMapByName.keys()).slice(0, 3),
                suwaSampleTitles: Array.from(suwaMapByName.keys()).slice(0, 3),
                sampleMappings: seriesMappings.slice(0, 3).map(m => ({
                    titleNorm: m.titleNorm,
                    komgaSeriesId: m.komgaSeriesId,
                    suwaMangaId: m.suwaMangaId
                }))
            }, 'Debug: Name-based matching analysis');
            // Build matched manga list with status
            const matchedManga = [];
            const invalidMappings = [];
            for (const mapping of seriesMappings) {
                // Find by normalized title instead of ID
                const komgaSeries = komgaMapByName.get(mapping.titleNorm);
                const suwaManga = suwaMapByName.get(mapping.titleNorm);
                if (komgaSeries && suwaManga) {
                    matchedManga.push({
                        komga: komgaSeries,
                        suwayomi: suwaManga,
                        mapping: mapping,
                        status: 'valid'
                    });
                }
                else {
                    invalidMappings.push({
                        komga: komgaSeries,
                        suwaManga: suwaManga,
                        mapping: mapping,
                        status: 'invalid',
                        issues: [
                            !komgaSeries ? 'Komga series not found by title' : null,
                            !suwaManga ? 'Suwayomi manga not found by title' : null
                        ].filter(Boolean)
                    });
                }
            }
            res.json({
                total: matchedManga.length,
                matched: matchedManga,
                invalidCount: invalidMappings.length,
                invalid: invalidMappings
            });
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to get matched manga');
            res.status(500).json({ error: error.message });
        }
    }
    async getKomgaManga(req, res) {
        try {
            const series = await this.komgaClient.getSeries();
            res.json({
                total: series.length,
                manga: series
            });
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to get Komga manga');
            res.status(500).json({ error: error.message });
        }
    }
    async getSuwayomiManga(req, res) {
        try {
            const library = await this.suwaClient.getLibrary();
            res.json({
                total: library.length,
                manga: library
            });
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to get Suwayomi manga');
            res.status(500).json({ error: error.message });
        }
    }
    async getKomgaBooks(req, res) {
        try {
            const { seriesId } = req.params;
            const books = await this.komgaClient.getBooks(seriesId);
            res.json(books);
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to get Komga books');
            res.status(500).json({ error: error.message });
        }
    }
    async getSuwayomiChapters(req, res) {
        try {
            const { mangaId } = req.params;
            const chapters = await this.suwaClient.getChapters(mangaId);
            res.json(chapters);
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to get Suwayomi chapters');
            res.status(500).json({ error: error.message });
        }
    }
    async cleanupMappings(req, res) {
        try {
            const komgaSeries = await this.komgaClient.getSeries();
            const suwaLibrary = await this.suwaClient.getLibrary();
            // Get existing mappings
            const seriesMappings = await this.mappingRepo.getAllSeriesMappings();
            const chapterMappings = await this.mappingRepo.getAllChapterMaps();
            // Create maps by name for validation instead of ID
            const komgaMapByName = new Map();
            const suwaMapByName = new Map();
            // Normalize and map Komga series by title
            komgaSeries.forEach((series) => {
                const normalizedTitle = (0, normalize_1.normalizeTitle)(series.metadata?.title || series.name || '');
                komgaMapByName.set(normalizedTitle, series);
            });
            // Normalize and map Suwayomi manga by title
            suwaLibrary.forEach((manga) => {
                const normalizedTitle = (0, normalize_1.normalizeTitle)(manga.title || '');
                suwaMapByName.set(normalizedTitle, manga);
            });
            let cleanedSeriesMappings = 0;
            let cleanedChapterMappings = 0;
            // Clean up series mappings
            for (const mapping of seriesMappings) {
                // Check if the mapping is still valid by name instead of ID
                const isValidKomga = komgaMapByName.has(mapping.titleNorm);
                const isValidSuwa = suwaMapByName.has(mapping.titleNorm);
                if (!isValidKomga || !isValidSuwa) {
                    // This mapping is stale, remove it
                    await this.mappingRepo.deleteSeriesMapping(mapping.komgaSeriesId);
                    cleanedSeriesMappings++;
                    // Also remove related chapter mappings
                    for (const chapterMap of chapterMappings) {
                        if (chapterMap.suwaMangaId === mapping.suwaMangaId ||
                            chapterMap.suwaMangaId === String(mapping.suwaMangaId) ||
                            String(chapterMap.suwaMangaId) === String(mapping.suwaMangaId)) {
                            await this.mappingRepo.deleteChapterMapping(chapterMap.komgaBookId);
                            cleanedChapterMappings++;
                        }
                    }
                }
            }
            res.json({
                success: true,
                message: `Cleaned up ${cleanedSeriesMappings} series mappings and ${cleanedChapterMappings} chapter mappings`
            });
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to cleanup mappings');
            res.status(500).json({ error: error.message });
        }
    }
    async debugIds(req, res) {
        try {
            const komgaSeries = await this.komgaClient.getSeries();
            const suwaLibrary = await this.suwaClient.getLibrary();
            const seriesMappings = await this.mappingRepo.getAllSeriesMappings();
            const debugInfo = {
                komgaSeries: komgaSeries.slice(0, 3).map(s => ({ id: s.id, type: typeof s.id, title: s.metadata?.title })),
                suwaLibrary: suwaLibrary.slice(0, 5).map((m) => ({ id: m.id, type: typeof m.id, title: m.title })),
                mappings: seriesMappings.map(m => ({
                    komgaSeriesId: m.komgaSeriesId,
                    komgaType: typeof m.komgaSeriesId,
                    suwaMangaId: m.suwaMangaId,
                    suwaType: typeof m.suwaMangaId,
                    titleNorm: m.titleNorm
                })),
                problematicMapping: seriesMappings.find(m => String(m.suwaMangaId) === '736')
            };
            res.json(debugInfo);
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to get debug info');
            res.status(500).json({ error: error.message });
        }
    }
    async getSyncLog(req, res) {
        try {
            // Get series mappings for current reading progress
            const seriesMappings = await this.mappingRepo.getAllSeriesMappings();
            const currentReadingEntries = [];
            const recentAppEvents = [];
            // Get current reading progress from both apps (only recent activities)
            for (const seriesMap of seriesMappings) {
                try {
                    // Get Komga reading progress with detailed information
                    const komgaBooks = await this.komgaClient.getBooks(seriesMap.komgaSeriesId);
                    for (const book of komgaBooks) {
                        if (book.readProgress && (book.readProgress.completed || book.readProgress.page > 0)) {
                            // Only include recent entries (last 24 hours)
                            const readDate = new Date(book.readProgress.readDate || Date.now());
                            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                            if (readDate >= oneDayAgo) {
                                const pagesCount = book.media?.pagesCount || 0;
                                const currentPage = book.readProgress.page || 0;
                                const isCompleted = book.readProgress.completed;
                                const progressPercent = pagesCount > 0 ? Math.round((currentPage / pagesCount) * 100) : 0;
                                currentReadingEntries.push({
                                    timestamp: book.readProgress.readDate || new Date().toISOString(),
                                    status: isCompleted ? 'success' : 'info',
                                    type: 'komga-reading',
                                    mangaTitle: seriesMap.titleNorm,
                                    chapterTitle: book.metadata?.title || book.name || 'Unknown',
                                    chapterNumber: book.metadata?.number || null,
                                    action: isCompleted ? 'Komga: Book Completed' : 'Komga: Reading Progress',
                                    details: `Page ${currentPage}/${pagesCount} (${progressPercent}%) ${isCompleted ? '- COMPLETED' : ''}`,
                                    progress: {
                                        currentPage,
                                        totalPages: pagesCount,
                                        percentage: progressPercent,
                                        completed: isCompleted
                                    }
                                });
                            }
                        }
                    }
                    // Get Suwayomi reading progress with detailed information
                    const suwaChapters = await this.suwaClient.getChapters(seriesMap.suwaMangaId);
                    for (const chapter of suwaChapters) {
                        if (chapter.isRead || chapter.lastReadAt) {
                            // Only include recent entries (last 24 hours)
                            const lastReadDate = new Date(chapter.lastReadAt || Date.now());
                            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                            if (lastReadDate >= oneDayAgo) {
                                const isCompleted = chapter.isRead;
                                const chapterNumber = chapter.chapterNumber || chapter.number || 'Unknown';
                                const pageCount = chapter.pageCount || chapter.pagesCount || 0;
                                const lastPageRead = chapter.lastPageRead || 0;
                                const progressPercent = pageCount > 0 ? Math.round((lastPageRead / pageCount) * 100) : 0;
                                currentReadingEntries.push({
                                    timestamp: chapter.lastReadAt || new Date().toISOString(),
                                    status: isCompleted ? 'success' : 'info',
                                    type: 'suwayomi-reading',
                                    mangaTitle: seriesMap.titleNorm,
                                    chapterTitle: chapter.name || `Chapter ${chapterNumber}`,
                                    chapterNumber: chapterNumber,
                                    action: isCompleted ? 'Suwayomi: Chapter Completed' : 'Suwayomi: Reading Progress',
                                    details: `Page ${lastPageRead}/${pageCount} (${progressPercent}%) ${isCompleted ? '- COMPLETED' : ''}`,
                                    progress: {
                                        currentPage: lastPageRead,
                                        totalPages: pageCount,
                                        percentage: progressPercent,
                                        completed: isCompleted
                                    }
                                });
                            }
                        }
                    }
                }
                catch (error) {
                    logger_1.logger.warn(error, `Failed to get reading progress for ${seriesMap.titleNorm}`);
                }
            }
            // Get recent app events (last 50 events from both apps) but filter out library_sync
            const komgaEvents = await this.mappingRepo.getAppEventsByApp('komga', 25);
            const suwayomiEvents = await this.mappingRepo.getAppEventsByApp('suwayomi', 25);
            // Filter out library_sync events and convert to sync log format
            const filteredEvents = [...komgaEvents, ...suwayomiEvents]
                .filter(event => !event.eventType.includes('library_sync'))
                .map(event => ({
                timestamp: event.timestamp.toISOString(),
                status: event.eventType === 'error' ? 'error' : event.eventType === 'warning' ? 'warning' : 'info',
                type: `${event.app}-event`,
                mangaTitle: event.mangaTitle || 'System',
                chapterTitle: event.chapterTitle || '',
                chapterNumber: null,
                action: `${event.app.toUpperCase()}: ${event.eventType.replace(/_/g, ' ')}`,
                details: event.details || 'No additional details'
            }));
            // Combine current reading progress and filtered app events
            const allEntries = [...currentReadingEntries, ...filteredEvents];
            // Sort by timestamp (most recent first) and take last 50 entries
            const recentEntries = allEntries
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 50);
            res.json(recentEntries);
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to get sync log');
            res.status(500).json({ error: error.message });
        }
    }
    async manualSync(req, res) {
        try {
            logger_1.logger.info('Starting manual sync triggered by user');
            // Emit to WebSocket that manual sync is starting
            this.io.emit('activity', {
                message: 'Manual sync started by user',
                type: 'system'
            });
            // Run the sync
            await this.syncService.sync();
            // Get updated stats
            const [seriesCount, chapterCount] = await Promise.all([
                this.mappingRepo.getSeriesMappingCount(),
                this.mappingRepo.getChapterMappingCount()
            ]);
            this.stats = {
                seriesMappings: seriesCount,
                chapterMappings: chapterCount,
                syncCycles: this.stats.syncCycles + 1,
                errors: this.stats.errors
            };
            // Emit updated stats and completion message
            this.io.emit('stats-update', this.stats);
            this.io.emit('activity', {
                message: 'Manual sync completed successfully',
                type: 'sync'
            });
            logger_1.logger.info('Manual sync completed successfully');
            res.json({
                success: true,
                message: 'Manual sync completed',
                stats: this.stats
            });
        }
        catch (error) {
            logger_1.logger.error(error, 'Manual sync failed');
            this.stats.errors++;
            this.io.emit('activity', {
                message: `Manual sync failed: ${error.message}`,
                type: 'error'
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    async clearSyncLog(req, res) {
        try {
            logger_1.logger.info('Clearing sync log');
            // Clear sync timestamps from chapter mappings
            await this.mappingRepo.clearSyncTimestamps();
            // Emit to WebSocket
            this.io.emit('activity', {
                message: 'Sync log cleared by user',
                type: 'system'
            });
            logger_1.logger.info('Sync log cleared successfully');
            res.json({
                success: true,
                message: 'Sync log cleared successfully'
            });
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to clear sync log');
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    async testConnectionsAndSync(req, res) {
        try {
            // Test connections first
            const komgaResult = await this.testKomgaConnection();
            const suwaResult = await this.testSuwaConnection();
            if (!komgaResult.success || !suwaResult.success) {
                return res.status(400).json({
                    success: false,
                    error: 'Connection tests failed',
                    komga: komgaResult,
                    suwayomi: suwaResult
                });
            }
            // If both connections work, start the sync
            await this.startSync();
            res.json({
                success: true,
                message: 'Connections tested successfully and sync started',
                komga: komgaResult,
                suwayomi: suwaResult
            });
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to test connections and start sync');
            res.status(500).json({ error: error.message });
        }
    }
    async testKomgaConnection() {
        try {
            const series = await this.komgaClient.getSeries();
            return { success: true, data: { count: series.length } };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async testSuwaConnection() {
        try {
            const library = await this.suwaClient.getLibrary();
            return { success: true, data: { count: library.length } };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async handleCommand(req, res) {
        const { command } = req.body;
        try {
            switch (command) {
                case 'start-sync':
                    await this.startSync();
                    break;
                case 'stop-sync':
                    this.stopSync();
                    break;
                case 'run-match':
                    await this.runMatch();
                    break;
                default:
                    throw new Error(`Unknown command: ${command}`);
            }
            res.json({ success: true });
        }
        catch (error) {
            logger_1.logger.error(error, `Command failed: ${command}`);
            res.status(500).json({ error: error.message });
        }
    }
    async startSync() {
        if (this.isRunning) {
            throw new Error('Sync is already running');
        }
        this.isRunning = true;
        const interval = parseInt(process.env.SYNC_INTERVAL_MS || '60000');
        this.syncInterval = setInterval(async () => {
            try {
                await this.syncService.sync();
                this.stats.syncCycles++;
                this.io.emit('stats-update', this.stats);
                this.io.emit('sync-status', {
                    isRunning: true,
                    lastSync: new Date().toISOString()
                });
                this.io.emit('activity', {
                    message: 'Sync cycle completed successfully',
                    type: 'sync'
                });
            }
            catch (error) {
                this.stats.errors++;
                logger_1.logger.error(error, 'Sync cycle failed');
                this.io.emit('activity', {
                    message: `Sync cycle failed: ${error instanceof Error ? error.message : String(error)}`,
                    type: 'error'
                });
            }
        }, interval);
        this.io.emit('sync-status', {
            isRunning: true,
            lastSync: new Date().toISOString()
        });
        this.io.emit('activity', {
            message: 'Sync service started',
            type: 'system'
        });
        logger_1.logger.info('Sync service started');
    }
    stopSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.isRunning = false;
        this.io.emit('sync-status', {
            isRunning: false,
            lastSync: new Date().toISOString()
        });
        this.io.emit('activity', {
            message: 'Sync service stopped',
            type: 'system'
        });
        logger_1.logger.info('Sync service stopped');
    }
    async runMatch() {
        try {
            await this.syncService.matchAndMap();
            // Refresh stats
            await this.getStats({}, {
                json: (data) => {
                    this.stats = data;
                    this.io.emit('stats-update', this.stats);
                }
            });
            this.io.emit('activity', {
                message: 'Initial matching completed',
                type: 'match'
            });
            logger_1.logger.info('Initial matching completed');
        }
        catch (error) {
            logger_1.logger.error(error, 'Initial matching failed');
            throw error;
        }
    }
    async logEvent(req, res) {
        try {
            const eventData = req.body;
            // Validate event data
            if (!eventData.type || !eventData.eventType || !eventData.app) {
                return res.status(400).json({ error: 'Missing required event fields: type, eventType, app' });
            }
            // Log the event using the mapping repository
            await this.mappingRepo.logAppEvent({
                app: eventData.app,
                eventType: eventData.eventType,
                mangaTitle: eventData.mangaTitle,
                chapterTitle: eventData.chapterTitle,
                details: JSON.stringify(eventData.details || {})
            });
            // Optional: Emit to WebSocket for real-time updates
            this.io.emit('app-event', {
                app: eventData.app,
                eventType: eventData.eventType,
                details: eventData.details,
                timestamp: new Date().toISOString()
            });
            res.json({ success: true });
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to log event');
            res.status(500).json({ error: error.message });
        }
    }
    async syncKomgaProgress(req, res) {
        try {
            const { komgaBookId, page, completed } = req.body;
            if (!komgaBookId || typeof page !== 'number') {
                return res.status(400).json({ error: 'Missing required parameters: komgaBookId, page' });
            }
            logger_1.logger.info({ komgaBookId, page, completed }, 'Received Komga progress sync request');
            // Find the corresponding Suwayomi chapter
            const chapterMap = await this.mappingRepo.getChapterMap(komgaBookId);
            if (!chapterMap) {
                logger_1.logger.warn({ komgaBookId }, 'No chapter mapping found for Komga book');
                return res.status(404).json({ error: 'Chapter mapping not found' });
            }
            // Get current Suwayomi chapter status
            const suwaChapters = await this.suwaClient.getChapters(chapterMap.suwaMangaId);
            const suwaChapter = suwaChapters.find((ch) => ch.id === chapterMap.suwaChapterId);
            if (!suwaChapter) {
                logger_1.logger.warn({ komgaBookId, suwaChapterId: chapterMap.suwaChapterId }, 'Suwayomi chapter not found');
                return res.status(404).json({ error: 'Suwayomi chapter not found' });
            }
            // Check if sync is needed
            const shouldSync = completed !== suwaChapter.isRead || page !== suwaChapter.lastPageRead;
            if (!shouldSync) {
                logger_1.logger.debug({ komgaBookId, page, completed }, 'No sync needed - progress already matches');
                return res.json({ message: 'Already synced', synced: false });
            }
            // Sync progress to Suwayomi
            await this.suwaClient.setChapterProgress(suwaChapter.id, page, completed);
            // Update last pushed timestamp
            await this.mappingRepo.updateChapterMapLastPushedKomga(komgaBookId, new Date());
            logger_1.logger.info({
                komgaBookId,
                suwaChapterId: suwaChapter.id,
                page,
                completed,
                chapterTitle: suwaChapter.name
            }, '✅ Successfully synced Komga progress to Suwayomi');
            // Emit real-time update
            this.io.emit('sync-update', {
                type: 'komga-to-suwa',
                komgaBookId,
                suwaChapterId: suwaChapter.id,
                page,
                completed,
                timestamp: new Date().toISOString()
            });
            res.json({
                message: 'Progress synced successfully',
                synced: true,
                komgaBookId,
                suwaChapterId: suwaChapter.id,
                page,
                completed
            });
        }
        catch (error) {
            logger_1.logger.error({ error: error.message, body: req.body }, 'Failed to sync Komga progress');
            res.status(500).json({ error: error.message });
        }
    }
    async syncSuwaProgress(req, res) {
        try {
            const { suwaChapterId, page, completed } = req.body;
            if (!suwaChapterId || typeof page !== 'number') {
                return res.status(400).json({ error: 'Missing required parameters: suwaChapterId, page' });
            }
            logger_1.logger.info({ suwaChapterId, page, completed }, 'Received Suwayomi progress sync request');
            // Find the corresponding Komga chapter
            const chapterMap = await this.mappingRepo.getChapterMapBySuwa(suwaChapterId);
            if (!chapterMap) {
                logger_1.logger.warn({ suwaChapterId }, 'No chapter mapping found for Suwayomi chapter');
                return res.status(404).json({ error: 'Chapter mapping not found' });
            }
            // Get current Komga chapter status
            const komgaBooks = await this.komgaClient.getBooks(chapterMap.komgaBookId);
            const komgaBook = komgaBooks.find((book) => book.id === chapterMap.komgaBookId);
            if (!komgaBook) {
                logger_1.logger.warn({ komgaBookId: chapterMap.komgaBookId }, 'Komga book not found');
                return res.status(404).json({ error: 'Komga book not found' });
            }
            // Check if sync is needed
            const shouldSync = completed !== komgaBook.readProgress?.completed || page !== komgaBook.readProgress?.page;
            if (!shouldSync) {
                logger_1.logger.debug({ suwaChapterId, page, completed }, 'No sync needed - progress already matches');
                return res.json({ message: 'Already synced', synced: false });
            }
            // Sync progress to Komga
            await this.komgaClient.patchReadProgress(chapterMap.komgaBookId, page, completed);
            // Update last pushed timestamp
            await this.mappingRepo.updateChapterMapLastPushedSuwa(suwaChapterId, new Date());
            logger_1.logger.info({
                komgaBookId: chapterMap.komgaBookId,
                suwaChapterId,
                page,
                completed,
                bookTitle: komgaBook.metadata?.title || komgaBook.name
            }, '✅ Successfully synced Suwayomi progress to Komga');
            // Emit real-time update
            this.io.emit('sync-update', {
                type: 'suwa-to-komga',
                komgaBookId: chapterMap.komgaBookId,
                suwaChapterId,
                page,
                completed,
                timestamp: new Date().toISOString()
            });
            res.json({
                message: 'Progress synced successfully',
                synced: true,
                komgaBookId: chapterMap.komgaBookId,
                suwaChapterId,
                page,
                completed
            });
        }
        catch (error) {
            logger_1.logger.error({ error: error.message, body: req.body }, 'Failed to sync Suwayomi progress');
            res.status(500).json({ error: error.message });
        }
    }
    start(port = 3000) {
        this.server.listen(port, () => {
            logger_1.logger.info(`Web dashboard listening on port ${port}`);
            logger_1.logger.info(`Open http://localhost:${port} in your browser`);
            // Log registered routes for debugging
            try {
                const routes = [];
                this.app._router.stack.forEach((middleware) => {
                    if (middleware.route) {
                        // routes registered directly on the app
                        const methods = Object.keys(middleware.route.methods).join(',').toUpperCase();
                        routes.push(`${methods} ${middleware.route.path}`);
                    }
                    else if (middleware.name === 'router') {
                        // router middleware
                        middleware.handle.stack.forEach((handler) => {
                            const route = handler.route;
                            if (route) {
                                const methods = Object.keys(route.methods).join(',').toUpperCase();
                                routes.push(`${methods} ${route.path}`);
                            }
                        });
                    }
                });
                logger_1.logger.info({ routes }, 'Registered HTTP routes');
            }
            catch (err) {
                logger_1.logger.warn(err, 'Failed to enumerate routes');
            }
        });
    }
}
// Enhanced logging to send to WebSocket
const originalLoggerMethods = {
    info: logger_1.logger.info.bind(logger_1.logger),
    error: logger_1.logger.error.bind(logger_1.logger),
    warn: logger_1.logger.warn.bind(logger_1.logger),
    debug: logger_1.logger.debug.bind(logger_1.logger)
};
// Override logger methods to also emit to WebSocket
Object.keys(originalLoggerMethods).forEach(level => {
    logger_1.logger[level] = (...args) => {
        // Call original method
        originalLoggerMethods[level](...args);
        // Send to WebSocket if available
        const webDashboard = global.webDashboard;
        if (webDashboard && webDashboard.io) {
            const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
            webDashboard.io.emit('log', {
                level,
                message,
                timestamp: new Date().toISOString()
            });
        }
    };
});
const main = async () => {
    logger_1.logger.info('Starting Komga-Suwayomi Sync Service with Web Dashboard');
    const dashboard = new WebDashboard();
    // If --match flag, run initial matching and exit
    if (process.argv.includes('--match')) {
        const mappingRepo = new mappingRepo_1.MappingRepository();
        const komgaClient = new komga_1.KomgaClient(mappingRepo);
        const suwaClient = new suwa_1.SuwaClient(mappingRepo);
        const matcher = new matcher_1.Matcher();
        const syncService = new sync_1.SyncService(komgaClient, suwaClient, mappingRepo, matcher);
        await syncService.matchAndMap();
        process.exit(0);
    }
    // Start the web dashboard
    dashboard.start(3000);
};
main().catch((err) => {
    logger_1.logger.error(err, 'Main error');
    process.exit(1);
});
