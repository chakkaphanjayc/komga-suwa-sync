import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import { logger } from './utils/logger';
import { SyncService } from './core/sync';
import { EnhancedSyncService } from './core/enhancedSync';
import { MappingRepository } from './core/mappingRepo';
import { KomgaClient } from './clients/komga';
import { SuwaClient } from './clients/suwa';
import { Matcher } from './core/matcher';
import { EventListener } from './core/eventListener';
import { normalizeTitle } from './utils/normalize';

class WebDashboard {
  private app: express.Application;
  private server: any;
  private io: SocketServer;
  private syncService: SyncService;
  private enhancedSyncService: EnhancedSyncService;
  private komgaClient: KomgaClient;
  private suwaClient: SuwaClient;
  private mappingRepo: MappingRepository;
  private matcher: Matcher;
  private eventListener: EventListener;
  private isRunning: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private fullSyncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: Date | null = null;
  private lastFullSyncTime: Date | null = null;
  private stats: any = {
    seriesMappings: 0,
    chapterMappings: 0,
    syncCycles: 0,
    fullSyncCycles: 0,
    errors: 0
  };

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketServer(this.server);

    this.mappingRepo = new MappingRepository();
    this.komgaClient = new KomgaClient(this.mappingRepo);
    this.suwaClient = new SuwaClient(this.mappingRepo);
    this.matcher = new Matcher();
    this.syncService = new SyncService(this.komgaClient, this.suwaClient, this.mappingRepo, this.matcher);
    this.enhancedSyncService = new EnhancedSyncService(this.komgaClient, this.suwaClient, this.mappingRepo, this.matcher);
    this.eventListener = new EventListener({
      komgaClient: this.komgaClient,
      suwaClient: this.suwaClient,
      mappingRepo: this.mappingRepo,
      enhancedSyncService: this.enhancedSyncService,
      eventCheckInterval: parseInt(process.env.EVENT_CHECK_INTERVAL_MS || '10000'),
      recentWindowHours: parseInt(process.env.RECENT_READ_HOURS || '1')
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(process.cwd(), 'public')));
  }

  private setupRoutes() {
    // Serve main dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'public/index.html'));
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
    this.app.post('/manual-event-sync', this.manualEventSync.bind(this));
    this.app.post('/manual-full-sync', this.manualFullSync.bind(this));
    this.app.post('/manual-sync-komga-to-suwa', this.manualSyncKomgaToSuwa.bind(this));
    this.app.post('/manual-sync-suwa-to-komga', this.manualSyncSuwaToKomga.bind(this));
    this.app.post('/api/sync-komga-progress', this.syncKomgaProgress.bind(this));
    this.app.post('/api/sync-suwa-progress', this.syncSuwaProgress.bind(this));
    this.app.get('/api/event-listener/status', this.getEventListenerStatus.bind(this));
    this.app.post('/api/event-listener/start', this.startEventListener.bind(this));
    this.app.post('/api/event-listener/stop', this.stopEventListener.bind(this));
    this.app.get('/api/manga/komga', this.getKomgaManga.bind(this));
    this.app.get('/api/manga/suwayomi', this.getSuwayomiManga.bind(this));
    this.app.get('/api/komga/series/:seriesId/books', this.getKomgaBooks.bind(this));
    this.app.get('/api/suwayomi/manga/:mangaId/chapters', this.getSuwayomiChapters.bind(this));
    this.app.post('/api/log-event', this.logEvent.bind(this));
  }

  private setupWebSocket() {
    this.io.on('connection', (socket: any) => {
      logger.info('WebSocket client connected');

      // Send initial stats
      socket.emit('stats-update', this.stats);
      socket.emit('sync-status', {
        isRunning: this.isRunning,
        lastSync: this.lastSyncTime ? this.lastSyncTime.toISOString() : null,
        lastFullSync: this.lastFullSyncTime ? this.lastFullSyncTime.toISOString() : null,
        intervalMs: this.isRunning ? parseInt(process.env.SYNC_INTERVAL_MS || process.env.EVENT_SYNC_INTERVAL_MS || '30000') : null,
        direction: process.env.SYNC_DIRECTION || 'bidirectional'
      });

      socket.on('command', (data: any) => {
        this.handleCommand({ body: data } as any, {
          json: (result: any) => {
            socket.emit('command-response', result);
          },
          status: (code: number) => ({
            json: (result: any) => {
              socket.emit('command-response', { error: result.error, status: code });
            }
          })
        } as any);
      });

      socket.on('disconnect', () => {
        logger.info('WebSocket client disconnected');
      });
    });

    // Override logger to also send to WebSocket
    const originalLogger = logger;
    const self = this;

    (global as any).originalLogger = originalLogger;
    (global as any).webDashboard = this;
  }

  private async getStats(req: any, res: any) {
    try {
      const [seriesCount, chapterCount] = await Promise.all([
        this.mappingRepo.getSeriesMappingCount(),
        this.mappingRepo.getChapterMappingCount()
      ]);

      this.stats = {
        seriesMappings: seriesCount,
        chapterMappings: chapterCount,
        syncCycles: this.stats.syncCycles,
        fullSyncCycles: this.stats.fullSyncCycles || 0,
        errors: this.stats.errors
      };

      res.json(this.stats);
    } catch (error) {
      logger.error(error, 'Failed to get stats');
      res.status(500).json({ error: 'Failed to get stats' });
    }
  }

  private async getStatus(req: any, res: any) {
    try {
      const [komgaStatus, suwaStatus] = await Promise.all([
        this.checkKomgaStatus(),
        this.checkSuwaStatus()
      ]);

      res.json({
        komga: komgaStatus,
        suwa: suwaStatus
      });
    } catch (error) {
      logger.error(error, 'Failed to get status');
      res.status(500).json({ error: 'Failed to get status' });
    }
  }

  private async checkKomgaStatus() {
    try {
      await this.komgaClient.getSeries();
      return { connected: true, details: { status: 'Connected' } };
    } catch (error: any) {
      return { connected: false, error: error.message };
    }
  }

  private async checkSuwaStatus() {
    try {
      await this.suwaClient.getLibrary();
      return { connected: true, details: { status: 'Connected' } };
    } catch (error: any) {
      return { connected: false, error: error.message };
    }
  }

  private getConfig(req: any, res: any) {
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
        interval: process.env.SYNC_INTERVAL_MS || '30000',
        fullSyncInterval: process.env.FULL_SYNC_INTERVAL_MS || '21600000',
        threshold: process.env.FUZZY_THRESHOLD || '0.8',
        level: process.env.LOG_LEVEL || 'info',
        dryRun: process.env.SYNC_DRY_RUN || 'false',
        direction: process.env.SYNC_DIRECTION || 'bidirectional'
      }
    });
  }

  private saveConfig(req: any, res: any) {
    const { type } = req.params;
    const config = req.body;

    try {
      // Update environment variables (Note: these won't persist across restarts)
      if (type === 'komga') {
        if (config['komga-base']) process.env.KOMGA_BASE = config['komga-base'];
        if (config['komga-user']) process.env.KOMGA_USER = config['komga-user'];
        if (config['komga-pass']) process.env.KOMGA_PASS = config['komga-pass'];
      } else if (type === 'suwa') {
        if (config['suwa-base']) process.env.SUWA_BASE = config['suwa-base'];
        if (config['suwa-token']) process.env.SUWA_TOKEN = config['suwa-token'];
        if (config['suwa-user']) process.env.SUWA_USER = config['suwa-user'];
        if (config['suwa-pass']) process.env.SUWA_PASS = config['suwa-pass'];
      } else if (type === 'sync') {
        if (config['sync-interval']) process.env.SYNC_INTERVAL_MS = config['sync-interval'];
        if (config['full-sync-interval']) process.env.FULL_SYNC_INTERVAL_MS = config['full-sync-interval'];
        if (config['fuzzy-threshold']) process.env.FUZZY_THRESHOLD = config['fuzzy-threshold'];
        if (config['log-level']) process.env.LOG_LEVEL = config['log-level'];
        if (config['sync-direction']) process.env.SYNC_DIRECTION = config['sync-direction'];
        process.env.SYNC_DRY_RUN = config['dry-run'] ? 'true' : 'false';
      }

      // Try to update .env file for persistence
      this.updateEnvFile(type, config);

      // Recreate clients with new configuration
      this.recreateClients();

      logger.info({ type, config }, 'Configuration updated and clients recreated');

      // For Suwayomi, log which authentication method is being used
      if (type === 'suwa') {
        if (config['suwa-user'] && config['suwa-pass']) {
          logger.info('Suwayomi basic authentication configured');
        } else if (config['suwa-token']) {
          logger.info('Suwayomi token authentication configured');
        } else {
          logger.info('No Suwayomi authentication configured');
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
    } catch (error) {
      logger.error(error, 'Failed to save config');
      res.status(500).json({ error: 'Failed to save configuration' });
    }
  }

  private updateEnvFile(type: string, config: any) {
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
      } else if (type === 'suwa') {
        this.updateEnvLine(lines, 'SUWA_BASE', config['suwa-base']);
        this.updateEnvLine(lines, 'SUWA_TOKEN', config['suwa-token']);
        this.updateEnvLine(lines, 'SUWA_USER', config['suwa-user']);
        this.updateEnvLine(lines, 'SUWA_PASS', config['suwa-pass']);
      } else if (type === 'sync') {
        // Provide defaults for empty sync values
        this.updateEnvLine(lines, 'SYNC_INTERVAL_MS', config['sync-interval'] || '30000');
        this.updateEnvLine(lines, 'FULL_SYNC_INTERVAL_MS', config['full-sync-interval'] || '21600000');
        this.updateEnvLine(lines, 'FUZZY_THRESHOLD', config['fuzzy-threshold'] || '0.8');
        this.updateEnvLine(lines, 'LOG_LEVEL', config['log-level'] || 'info');
        this.updateEnvLine(lines, 'SYNC_DIRECTION', config['sync-direction'] || 'bidirectional');
        this.updateEnvLine(lines, 'SYNC_DRY_RUN', config['dry-run'] !== undefined ? (config['dry-run'] ? 'true' : 'false') : 'false');
      }

      fs.writeFileSync(envPath, lines.join('\n'));
    } catch (error) {
      logger.warn(error, 'Failed to update .env file');
    }
  }

  private updateEnvLine(lines: string[], key: string, value: string) {
    const index = lines.findIndex(line => line.startsWith(`${key}=`));
    const newLine = `${key}=${value || ''}`;

    if (index >= 0) {
      lines[index] = newLine;
    } else {
      lines.push(newLine);
    }
  }

  private recreateClients() {
    // Recreate clients with new configuration
    this.komgaClient = new KomgaClient(this.mappingRepo);
    this.suwaClient = new SuwaClient(this.mappingRepo);
    
    // Recreate sync service with new clients
    this.syncService = new SyncService(this.komgaClient, this.suwaClient, this.mappingRepo, this.matcher);
  }

  private async testConnections(req: any, res: any) {
    try {
      const [komgaOk, suwaOk] = await Promise.all([
        this.checkKomgaStatus().then(s => s.connected),
        this.checkSuwaStatus().then(s => s.connected)
      ]);

      res.json({
        komga: komgaOk,
        suwa: suwaOk
      });
    } catch (error) {
      res.status(500).json({ error: 'Connection test failed' });
    }
  }

  private async testKomga(req: any, res: any) {
    try {
      const series = await this.komgaClient.getSeries();
      res.json({
        success: true,
        data: {
          seriesCount: series.length,
          sample: series.slice(0, 3)
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async testSuwa(req: any, res: any) {
    try {
      const library = await this.suwaClient.getLibrary();
      res.json({
        success: true,
        data: {
          mangaCount: library.length,
          sample: library.slice(0, 3)
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async quickTest(req: any, res: any) {
    const { type } = req.params;

    try {
      let result: any = {};

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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async getSeriesMappings(req: any, res: any) {
    try {
      const mappings = await this.mappingRepo.getAllSeriesMappings();
      res.json(mappings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get series mappings' });
    }
  }

  private async getSchemaInfo(req: any, res: any) {
    try {
      const schema = await this.suwaClient.getSchemaInfo();
      res.json(schema);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  private async testGraphQL(req: any, res: any) {
    const { query } = req.body;

    try {
      // Create a temporary GraphQL client to test the query
      const { GraphQLClient, gql } = require('graphql-request');
      const headers: Record<string, string> = {};

      if (process.env.SUWA_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.SUWA_TOKEN}`;
      } else if (process.env.SUWA_USER && process.env.SUWA_PASS) {
        const credentials = Buffer.from(`${process.env.SUWA_USER}:${process.env.SUWA_PASS}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      const client = new GraphQLClient(`${process.env.SUWA_BASE}/api/graphql`, { headers });
      const data = await client.request(gql`${query}`);
      
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  private async getChapterMappings(req: any, res: any) {
    try {
      const mappings = await this.mappingRepo.getAllChapterMaps();
      res.json(mappings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get chapter mappings' });
    }
  }

  private async getMatchedManga(req: any, res: any) {
    try {
      const komgaSeries = await this.komgaClient.getSeries();
      const suwaLibrary = await this.suwaClient.getLibrary();

      // Get existing mappings
      const seriesMappings = await this.mappingRepo.getAllSeriesMappings();

      // Create maps by name for validation instead of ID
      const komgaMapByName = new Map();
      const suwaMapByName = new Map();

      // Normalize and map Komga series by title
      komgaSeries.forEach((series: any) => {
        const normalizedTitle = normalizeTitle(series.metadata?.title || series.name || '');
        komgaMapByName.set(normalizedTitle, series);
      });

      // Normalize and map Suwayomi manga by title
      suwaLibrary.forEach((manga: any) => {
        const normalizedTitle = normalizeTitle(manga.title || '');
        suwaMapByName.set(normalizedTitle, manga);
      });

      // Debug: Log some sample data
      logger.info({
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
        } else {
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
    } catch (error: any) {
      logger.error(error, 'Failed to get matched manga');
      res.status(500).json({ error: error.message });
    }
  }

  private async getKomgaManga(req: any, res: any) {
    try {
      const series = await this.komgaClient.getSeries();
      res.json({
        total: series.length,
        manga: series
      });
    } catch (error: any) {
      logger.error(error, 'Failed to get Komga manga');
      res.status(500).json({ error: error.message });
    }
  }

  private async getSuwayomiManga(req: any, res: any) {
    try {
      const library = await this.suwaClient.getLibrary();
      res.json({
        total: library.length,
        manga: library
      });
    } catch (error: any) {
      logger.error(error, 'Failed to get Suwayomi manga');
      res.status(500).json({ error: error.message });
    }
  }

  private async getKomgaBooks(req: any, res: any) {
    try {
      const { seriesId } = req.params;
      const books = await this.komgaClient.getBooks(seriesId);
      res.json(books);
    } catch (error: any) {
      logger.error(error, 'Failed to get Komga books');
      res.status(500).json({ error: error.message });
    }
  }

  private async getSuwayomiChapters(req: any, res: any) {
    try {
      const { mangaId } = req.params;
      const chapters = await this.suwaClient.getChapters(mangaId);
      res.json(chapters);
    } catch (error: any) {
      logger.error(error, 'Failed to get Suwayomi chapters');
      res.status(500).json({ error: error.message });
    }
  }

  private async cleanupMappings(req: any, res: any) {
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
      komgaSeries.forEach((series: any) => {
        const normalizedTitle = normalizeTitle(series.metadata?.title || series.name || '');
        komgaMapByName.set(normalizedTitle, series);
      });

      // Normalize and map Suwayomi manga by title
      suwaLibrary.forEach((manga: any) => {
        const normalizedTitle = normalizeTitle(manga.title || '');
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
    } catch (error: any) {
      logger.error(error, 'Failed to cleanup mappings');
      res.status(500).json({ error: error.message });
    }
  }

  private async debugIds(req: any, res: any) {
    try {
      const komgaSeries = await this.komgaClient.getSeries();
      const suwaLibrary = await this.suwaClient.getLibrary();
      const seriesMappings = await this.mappingRepo.getAllSeriesMappings();

      const debugInfo = {
        komgaSeries: komgaSeries.slice(0, 3).map(s => ({ id: s.id, type: typeof s.id, title: s.metadata?.title })),
        suwaLibrary: suwaLibrary.slice(0, 5).map((m: any) => ({ id: m.id, type: typeof m.id, title: m.title })),
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
    } catch (error: any) {
      logger.error(error, 'Failed to get debug info');
      res.status(500).json({ error: error.message });
    }
  }

  private async getSyncLog(req: any, res: any) {
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
        } catch (error) {
          logger.warn(error, `Failed to get reading progress for ${seriesMap.titleNorm}`);
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
    } catch (error: any) {
      logger.error(error, 'Failed to get sync log');
      res.status(500).json({ error: error.message });
    }
  }

  private async manualSync(req: any, res: any) {
    try {
      logger.info('Starting manual sync triggered by user');

      // Emit to WebSocket that manual sync is starting
      this.io.emit('activity', {
        message: 'Manual sync started by user',
        type: 'system'
      });

      // Run the enhanced sync
      await this.enhancedSyncService.sync({
        mode: 'full',
        direction: (process.env.SYNC_DIRECTION as any) || 'bidirectional'
      });

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
      this.lastSyncTime = new Date();

      // Emit updated stats and completion message
      this.io.emit('stats-update', this.stats);
      this.io.emit('sync-status', {
        isRunning: this.isRunning,
        lastSync: this.lastSyncTime.toISOString(),
        intervalMs: this.isRunning ? parseInt(process.env.SYNC_INTERVAL_MS || process.env.EVENT_SYNC_INTERVAL_MS || '30000') : null,
        direction: process.env.SYNC_DIRECTION || 'bidirectional'
      });
      this.io.emit('activity', {
        message: 'Manual sync completed successfully',
        type: 'sync'
      });

      logger.info('Manual sync completed successfully');

      res.json({
        success: true,
        message: 'Manual sync completed',
        stats: this.stats
      });
    } catch (error: any) {
      logger.error(error, 'Manual sync failed');

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

  private async manualEventSync(req: any, res: any) {
    try {
      logger.info('Starting manual event-based sync triggered by user');

      // Emit to WebSocket that manual event sync is starting
      this.io.emit('activity', {
        message: 'Manual event-based sync started by user',
        type: 'system'
      });

      // Run event-based sync
      await this.enhancedSyncService.sync({
        mode: 'event-based',
        maxHoursForRecent: parseInt(process.env.RECENT_READ_HOURS || '24'),
        direction: (process.env.SYNC_DIRECTION as any) || 'bidirectional'
      });

      // Get updated stats
      const [seriesCount, chapterCount] = await Promise.all([
        this.mappingRepo.getSeriesMappingCount(),
        this.mappingRepo.getChapterMappingCount()
      ]);

      this.stats = {
        seriesMappings: seriesCount,
        chapterMappings: chapterCount,
        syncCycles: this.stats.syncCycles + 1,
        fullSyncCycles: this.stats.fullSyncCycles || 0,
        errors: this.stats.errors
      };
      this.lastSyncTime = new Date();

      // Emit updated stats and completion message
      this.io.emit('stats-update', this.stats);
      this.io.emit('sync-status', {
        isRunning: this.isRunning,
        lastSync: this.lastSyncTime.toISOString(),
        intervalMs: this.isRunning ? parseInt(process.env.SYNC_INTERVAL_MS || process.env.EVENT_SYNC_INTERVAL_MS || '30000') : null,
        direction: process.env.SYNC_DIRECTION || 'bidirectional'
      });
      this.io.emit('activity', {
        message: 'Manual event-based sync completed successfully',
        type: 'sync'
      });

      logger.info('Manual event-based sync completed successfully');

      res.json({
        success: true,
        message: 'Manual event-based sync completed',
        stats: this.stats
      });
    } catch (error: any) {
      logger.error(error, 'Manual event-based sync failed');

      this.stats.errors++;

      this.io.emit('activity', {
        message: `Manual event-based sync failed: ${error.message}`,
        type: 'error'
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async manualFullSync(req: any, res: any) {
    try {
      logger.info('Starting manual full library sync triggered by user');

      // Emit to WebSocket that manual full sync is starting
      this.io.emit('activity', {
        message: 'Manual full library sync started by user',
        type: 'system'
      });

      // Run full library sync
      await this.enhancedSyncService.sync({
        mode: 'full',
        direction: (process.env.SYNC_DIRECTION as any) || 'bidirectional'
      });

      // Get updated stats
      const [seriesCount, chapterCount] = await Promise.all([
        this.mappingRepo.getSeriesMappingCount(),
        this.mappingRepo.getChapterMappingCount()
      ]);

      this.stats = {
        seriesMappings: seriesCount,
        chapterMappings: chapterCount,
        syncCycles: this.stats.syncCycles,
        fullSyncCycles: (this.stats.fullSyncCycles || 0) + 1,
        errors: this.stats.errors
      };

      // Emit updated stats and completion message
      this.io.emit('stats-update', this.stats);
      this.io.emit('activity', {
        message: 'Manual full library sync completed successfully',
        type: 'sync'
      });

      logger.info('Manual full library sync completed successfully');

      res.json({
        success: true,
        message: 'Manual full library sync completed',
        stats: this.stats
      });
    } catch (error: any) {
      logger.error(error, 'Manual full library sync failed');

      this.stats.errors++;

      this.io.emit('activity', {
        message: `Manual full library sync failed: ${error.message}`,
        type: 'error'
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async manualSyncSuwaToKomga(req: any, res: any) {
    try {
      logger.info('Starting manual Suwayomi to Komga sync triggered by user');

      // Emit to WebSocket that manual directional sync is starting
      this.io.emit('activity', {
        message: 'Manual Suwayomi to Komga sync started by user',
        type: 'system'
      });

      // Run directional sync
      await this.enhancedSyncService.sync({
        mode: 'full',
        direction: 'suwa-to-komga'
      });

      // Get updated stats
      const [seriesCount, chapterCount] = await Promise.all([
        this.mappingRepo.getSeriesMappingCount(),
        this.mappingRepo.getChapterMappingCount()
      ]);

      this.stats = {
        seriesMappings: seriesCount,
        chapterMappings: chapterCount,
        syncCycles: this.stats.syncCycles + 1,
        fullSyncCycles: this.stats.fullSyncCycles || 0,
        errors: this.stats.errors
      };
      this.lastSyncTime = new Date();

      // Emit updated stats and completion message
      this.io.emit('stats-update', this.stats);
      this.io.emit('sync-status', {
        isRunning: this.isRunning,
        lastSync: this.lastSyncTime.toISOString(),
        intervalMs: this.isRunning ? parseInt(process.env.SYNC_INTERVAL_MS || process.env.EVENT_SYNC_INTERVAL_MS || '30000') : null,
        direction: process.env.SYNC_DIRECTION || 'bidirectional'
      });
      this.io.emit('activity', {
        message: 'Manual Suwayomi to Komga sync completed successfully',
        type: 'sync'
      });

      logger.info('Manual Suwayomi to Komga sync completed successfully');

      res.json({
        success: true,
        message: 'Manual Suwayomi to Komga sync completed',
        stats: this.stats
      });
    } catch (error: any) {
      logger.error(error, 'Manual Suwayomi to Komga sync failed');

      this.stats.errors++;

      this.io.emit('activity', {
        message: `Manual Suwayomi to Komga sync failed: ${error.message}`,
        type: 'error'
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async manualSyncKomgaToSuwa(req: any, res: any) {
    try {
      logger.info('Starting manual Komga to Suwayomi sync triggered by user');

      // Emit to WebSocket that manual directional sync is starting
      this.io.emit('activity', {
        message: 'Manual Komga to Suwayomi sync started by user',
        type: 'system'
      });

      // Run directional sync
      await this.enhancedSyncService.sync({
        mode: 'full',
        direction: 'komga-to-suwa'
      });

      // Get updated stats
      const [seriesCount, chapterCount] = await Promise.all([
        this.mappingRepo.getSeriesMappingCount(),
        this.mappingRepo.getChapterMappingCount()
      ]);

      this.stats = {
        seriesMappings: seriesCount,
        chapterMappings: chapterCount,
        syncCycles: this.stats.syncCycles + 1,
        fullSyncCycles: this.stats.fullSyncCycles || 0,
        errors: this.stats.errors
      };
      this.lastSyncTime = new Date();

      // Emit updated stats and completion message
      this.io.emit('stats-update', this.stats);
      this.io.emit('sync-status', {
        isRunning: this.isRunning,
        lastSync: this.lastSyncTime.toISOString(),
        intervalMs: this.isRunning ? parseInt(process.env.SYNC_INTERVAL_MS || process.env.EVENT_SYNC_INTERVAL_MS || '30000') : null,
        direction: process.env.SYNC_DIRECTION || 'bidirectional'
      });
      this.io.emit('activity', {
        message: 'Manual Komga to Suwayomi sync completed successfully',
        type: 'sync'
      });

      logger.info('Manual Komga to Suwayomi sync completed successfully');

      res.json({
        success: true,
        message: 'Manual Komga to Suwayomi sync completed',
        stats: this.stats
      });
    } catch (error: any) {
      logger.error(error, 'Manual Komga to Suwayomi sync failed');

      this.stats.errors++;

      this.io.emit('activity', {
        message: `Manual Komga to Suwayomi sync failed: ${error.message}`,
        type: 'error'
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  private async handleCommand(req: any, res: any) {
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
        case 'start-event-listener':
          this.eventListener.start();
          this.io.emit('activity', {
            message: 'Event listener started via WebSocket',
            type: 'system'
          });
          break;
        case 'stop-event-listener':
          this.eventListener.stop();
          this.io.emit('activity', {
            message: 'Event listener stopped via WebSocket',
            type: 'system'
          });
          break;
        case 'sync-komga-to-suwa':
          await this.enhancedSyncService.sync({
            mode: 'full',
            direction: 'komga-to-suwa'
          });
          this.io.emit('activity', {
            message: 'Komga to Suwayomi sync completed via WebSocket',
            type: 'sync'
          });
          break;
        case 'sync-suwa-to-komga':
          await this.enhancedSyncService.sync({
            mode: 'full',
            direction: 'suwa-to-komga'
          });
          this.io.emit('activity', {
            message: 'Suwayomi to Komga sync completed via WebSocket',
            type: 'sync'
          });
          break;
        default:
          throw new Error(`Unknown command: ${command}`);
      }

      res.json({ success: true });
    } catch (error: any) {
      logger.error(error, `Command failed: ${command}`);
      res.status(500).json({ error: error.message });
    }
  }

  private async startSync() {
    if (this.isRunning) {
      throw new Error('Sync is already running');
    }

    this.isRunning = true;
  // Prefer SYNC_INTERVAL_MS (saved via web UI) but fall back to EVENT_SYNC_INTERVAL_MS for legacy
  const eventBasedInterval = parseInt(process.env.SYNC_INTERVAL_MS || process.env.EVENT_SYNC_INTERVAL_MS || '30000'); // 30 seconds default
    const fullSyncInterval = parseInt(process.env.FULL_SYNC_INTERVAL_MS || '21600000'); // 6 hours default

    // Start frequent event-based sync for recently read manga
    this.syncInterval = setInterval(async () => {
      try {
        await this.enhancedSyncService.sync({
          mode: 'event-based',
          maxHoursForRecent: parseInt(process.env.RECENT_READ_HOURS || '24'),
          direction: (process.env.SYNC_DIRECTION as any) || 'bidirectional'
        });
        this.stats.syncCycles++;
        this.lastSyncTime = new Date();

        this.io.emit('stats-update', this.stats);
        this.io.emit('sync-status', {
          isRunning: true,
          lastSync: this.lastSyncTime.toISOString(),
          mode: 'event-based',
          intervalMs: eventBasedInterval,
          direction: process.env.SYNC_DIRECTION || 'bidirectional'
        });

        this.io.emit('activity', {
          message: 'Event-based sync cycle completed successfully',
          type: 'sync'
        });
      } catch (error) {
        this.stats.errors++;
        logger.error(error, 'Event-based sync cycle failed');

        this.io.emit('activity', {
          message: `Event-based sync cycle failed: ${error instanceof Error ? error.message : String(error)}`,
          type: 'error'
        });
      }
    }, eventBasedInterval);

    // Start periodic full library sync
    this.fullSyncInterval = setInterval(async () => {
      try {
        await this.enhancedSyncService.sync({
          mode: 'full',
          direction: (process.env.SYNC_DIRECTION as any) || 'bidirectional'
        });
        this.stats.fullSyncCycles++;
        this.lastFullSyncTime = new Date();

        this.io.emit('stats-update', this.stats);
        this.io.emit('sync-status', {
          isRunning: true,
          lastFullSync: this.lastFullSyncTime.toISOString(),
          mode: 'full',
          intervalMs: eventBasedInterval,
          direction: process.env.SYNC_DIRECTION || 'bidirectional'
        });

        this.io.emit('activity', {
          message: 'Full library sync completed successfully',
          type: 'sync'
        });
      } catch (error) {
        this.stats.errors++;
        logger.error(error, 'Full sync cycle failed');

        this.io.emit('activity', {
          message: `Full sync cycle failed: ${error instanceof Error ? error.message : String(error)}`,
          type: 'error'
        });
      }
    }, fullSyncInterval);

    this.io.emit('sync-status', {
      isRunning: true,
      lastSync: this.lastSyncTime ? this.lastSyncTime.toISOString() : null,
      lastFullSync: this.lastFullSyncTime ? this.lastFullSyncTime.toISOString() : null,
      intervalMs: eventBasedInterval,
      direction: process.env.SYNC_DIRECTION || 'bidirectional'
    });

    this.io.emit('activity', {
      message: 'Enhanced sync service started (event-based + periodic full sync + event listener)',
      type: 'system'
    });

    logger.info({ eventBasedInterval, fullSyncInterval }, 'Enhanced sync service started');
  }

  private stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.fullSyncInterval) {
      clearInterval(this.fullSyncInterval);
      this.fullSyncInterval = null;
    }

    // Stop the event listener
    this.eventListener.stop();

    this.isRunning = false;

    this.io.emit('sync-status', {
      isRunning: false,
      lastSync: this.lastSyncTime ? this.lastSyncTime.toISOString() : null,
      lastFullSync: this.lastFullSyncTime ? this.lastFullSyncTime.toISOString() : null,
      intervalMs: null,
      direction: process.env.SYNC_DIRECTION || 'bidirectional'
    });

    this.io.emit('activity', {
      message: 'Enhanced sync service and event listener stopped',
      type: 'system'
    });

    logger.info('Enhanced sync service and event listener stopped');
  }

  private async runMatch() {
    try {
      await this.syncService.matchAndMap();

      // Refresh stats
      await this.getStats({} as any, {
        json: (data: any) => {
          this.stats = data;
          this.io.emit('stats-update', this.stats);
        }
      });

      this.io.emit('activity', {
        message: 'Initial matching completed',
        type: 'match'
      });

      logger.info('Initial matching completed');
    } catch (error) {
      logger.error(error, 'Initial matching failed');
      throw error;
    }
  }

  private async logEvent(req: any, res: any) {
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
    } catch (error: any) {
      logger.error(error, 'Failed to log event');
      res.status(500).json({ error: error.message });
    }
  }

  private async syncKomgaProgress(req: any, res: any) {
    try {
      const { komgaBookId, page, completed } = req.body;

      if (!komgaBookId || typeof page !== 'number') {
        return res.status(400).json({ error: 'Missing required parameters: komgaBookId, page' });
      }

      logger.info({ komgaBookId, page, completed }, 'Received Komga progress sync request');

      // Find the corresponding Suwayomi chapter
      const chapterMap = await this.mappingRepo.getChapterMap(komgaBookId);
      if (!chapterMap) {
        logger.warn({ komgaBookId }, 'No chapter mapping found for Komga book');
        return res.status(404).json({ error: 'Chapter mapping not found' });
      }

      // Get current Suwayomi chapter status
      const suwaChapters = await this.suwaClient.getChapters(chapterMap.suwaMangaId);
      const suwaChapter = suwaChapters.find((ch: any) => ch.id === chapterMap.suwaChapterId);

      if (!suwaChapter) {
        logger.warn({ komgaBookId, suwaChapterId: chapterMap.suwaChapterId }, 'Suwayomi chapter not found');
        return res.status(404).json({ error: 'Suwayomi chapter not found' });
      }

      // Check if sync is needed
      const shouldSync = completed !== suwaChapter.isRead || page !== suwaChapter.lastPageRead;

      if (!shouldSync) {
        logger.debug({ komgaBookId, page, completed }, 'No sync needed - progress already matches');
        return res.json({ message: 'Already synced', synced: false });
      }

      // Sync progress to Suwayomi
      await this.suwaClient.setChapterProgress(suwaChapter.id, page, completed);

      // Update last pushed timestamp
      await this.mappingRepo.updateChapterMapLastPushedKomga(komgaBookId, new Date());

      logger.info({
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

    } catch (error: any) {
      logger.error({ error: error.message, body: req.body }, 'Failed to sync Komga progress');
      res.status(500).json({ error: error.message });
    }
  }

  private async syncSuwaProgress(req: any, res: any) {
    try {
      const { suwaChapterId, page, completed } = req.body;

      if (!suwaChapterId || typeof page !== 'number') {
        return res.status(400).json({ error: 'Missing required parameters: suwaChapterId, page' });
      }

      logger.info({ suwaChapterId, page, completed }, 'Received Suwayomi progress sync request');

      // Find the corresponding Komga chapter
      const chapterMap = await this.mappingRepo.getChapterMapBySuwa(suwaChapterId);
      if (!chapterMap) {
        logger.warn({ suwaChapterId }, 'No chapter mapping found for Suwayomi chapter');
        return res.status(404).json({ error: 'Chapter mapping not found' });
      }

      // Get current Komga chapter status
      const komgaBooks = await this.komgaClient.getBooks(chapterMap.komgaBookId);
      const komgaBook = komgaBooks.find((book: any) => book.id === chapterMap.komgaBookId);

      if (!komgaBook) {
        logger.warn({ komgaBookId: chapterMap.komgaBookId }, 'Komga book not found');
        return res.status(404).json({ error: 'Komga book not found' });
      }

      // Check if sync is needed
      const shouldSync = completed !== komgaBook.readProgress?.completed || page !== komgaBook.readProgress?.page;

      if (!shouldSync) {
        logger.debug({ suwaChapterId, page, completed }, 'No sync needed - progress already matches');
        return res.json({ message: 'Already synced', synced: false });
      }

      // Sync progress to Komga
      await this.komgaClient.patchReadProgress(chapterMap.komgaBookId, page, completed);

      // Update last pushed timestamp
      await this.mappingRepo.updateChapterMapLastPushedSuwa(suwaChapterId, new Date());

      logger.info({
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

    } catch (error: any) {
      logger.error({ error: error.message, body: req.body }, 'Failed to sync Suwayomi progress');
      res.status(500).json({ error: error.message });
    }
  }

  private getEventListenerStatus(req: any, res: any) {
    try {
      const status = this.eventListener.getStatus();
      res.json(status);
    } catch (error: any) {
      logger.error(error, 'Failed to get event listener status');
      res.status(500).json({ error: error.message });
    }
  }

  private startEventListener(req: any, res: any) {
    try {
      this.eventListener.start();

      this.io.emit('activity', {
        message: 'Event listener started',
        type: 'system'
      });

      res.json({ success: true, message: 'Event listener started' });
    } catch (error: any) {
      logger.error(error, 'Failed to start event listener');
      res.status(500).json({ error: error.message });
    }
  }

  private stopEventListener(req: any, res: any) {
    try {
      this.eventListener.stop();

      this.io.emit('activity', {
        message: 'Event listener stopped',
        type: 'system'
      });

      res.json({ success: true, message: 'Event listener stopped' });
    } catch (error: any) {
      logger.error(error, 'Failed to stop event listener');
      res.status(500).json({ error: error.message });
    }
  }

  public start(port: number = 3000) {
    this.server.listen(port, () => {
      logger.info(`Web dashboard listening on port ${port}`);
      logger.info(`Open http://localhost:${port} in your browser`);
      // Log registered routes for debugging
      try {
        const routes: string[] = [];
        (this.app as any)._router.stack.forEach((middleware: any) => {
          if (middleware.route) {
            // routes registered directly on the app
            const methods = Object.keys(middleware.route.methods).join(',').toUpperCase();
            routes.push(`${methods} ${middleware.route.path}`);
          } else if (middleware.name === 'router') {
            // router middleware
            middleware.handle.stack.forEach((handler: any) => {
              const route = handler.route;
              if (route) {
                const methods = Object.keys(route.methods).join(',').toUpperCase();
                routes.push(`${methods} ${route.path}`);
              }
            });
          }
        });
        logger.info({ routes }, 'Registered HTTP routes');
      } catch (err) {
        logger.warn(err, 'Failed to enumerate routes');
      }

      // Auto-start sync if configuration is valid
      this.autoStartSync();
    });
  }

  private async autoStartSync() {
    try {
      logger.info('Checking configuration for auto-start...');

      // Check if basic configuration is present
      const hasKomgaConfig = process.env.KOMGA_BASE && process.env.KOMGA_USER && process.env.KOMGA_PASS;
      const hasSuwaConfig = process.env.SUWA_BASE && (process.env.SUWA_TOKEN || (process.env.SUWA_USER && process.env.SUWA_PASS));

      if (!hasKomgaConfig || !hasSuwaConfig) {
        logger.info('Auto-start skipped: Missing configuration. Please configure both Komga and Suwayomi in the web interface.');
        return;
      }

      logger.info('Configuration found, testing connections...');

      // Test connections
      const komgaConnected = await this.testKomgaConnection();
      const suwaConnected = await this.testSuwaConnection();

      if (komgaConnected && suwaConnected) {
        logger.info('Both connections successful, starting initial match and sync...');

        // Run initial matching
        try {
          await this.syncService.matchAndMap();
          logger.info('Initial matching completed successfully');

          // Start the sync service
          await this.startSync();
          logger.info('Auto-start completed successfully - sync service is now running');

          // Start the event listener for real-time event detection
          this.eventListener.start();
          logger.info('Event listener started for real-time sync detection');
        } catch (matchError: any) {
          logger.error(matchError, 'Initial matching failed during auto-start');
          logger.info('Auto-start partially successful - connections work but matching failed. Please run initial match manually.');
        }
      } else {
        logger.info('Auto-start skipped: Connection tests failed. Please check your configuration.');
        if (!komgaConnected) {
          logger.info('Komga connection failed - please verify Komga URL, username, and password');
        }
        if (!suwaConnected) {
          logger.info('Suwayomi connection failed - please verify Suwayomi URL and authentication');
        }
      }
    } catch (error: any) {
      logger.error(error, 'Auto-start failed');
      logger.info('Auto-start failed. Please check your configuration and try again manually.');
    }
  }

  private async testKomgaConnection(): Promise<boolean> {
    try {
      await this.komgaClient.getSeries();
      return true;
    } catch (error: any) {
      logger.debug({ error: error.message }, 'Komga connection test failed');
      return false;
    }
  }

  private async testSuwaConnection(): Promise<boolean> {
    try {
      await this.suwaClient.getLibrary();
      return true;
    } catch (error: any) {
      logger.debug({ error: error.message }, 'Suwayomi connection test failed');
      return false;
    }
  }
}

// Enhanced logging to send to WebSocket
const originalLoggerMethods = {
  info: logger.info.bind(logger),
  error: logger.error.bind(logger),
  warn: logger.warn.bind(logger),
  debug: logger.debug.bind(logger)
};

// Override logger methods to also emit to WebSocket
Object.keys(originalLoggerMethods).forEach(level => {
  (logger as any)[level] = (...args: any[]) => {
    // Call original method
    (originalLoggerMethods as any)[level](...args);

    // Send to WebSocket if available
    const webDashboard = (global as any).webDashboard;
    if (webDashboard && webDashboard.io) {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      webDashboard.io.emit('log', {
        level,
        message,
        timestamp: new Date().toISOString()
      });
    }
  };
});

const main = async () => {
  logger.info('Starting Komga-Suwayomi Sync Service with Web Dashboard');

  const dashboard = new WebDashboard();

  // If --match flag, run initial matching and exit
  if (process.argv.includes('--match')) {
    const mappingRepo = new MappingRepository();
    const komgaClient = new KomgaClient(mappingRepo);
    const suwaClient = new SuwaClient(mappingRepo);
    const matcher = new Matcher();
    const syncService = new SyncService(komgaClient, suwaClient, mappingRepo, matcher);

    await syncService.matchAndMap();
    process.exit(0);
  }

  // Start the web dashboard
  dashboard.start(3000);
};

main().catch((err: any) => {
  logger.error(err, 'Main error');
  process.exit(1);
});
