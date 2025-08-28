"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MappingRepository = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const logger_1 = require("../utils/logger");
class MappingRepository {
    constructor() {
        this.db = null;
        this.initDb();
    }
    async initDb() {
        const dbPath = process.env.DB_PATH || './data/sync.db';
        this.db = await (0, sqlite_1.open)({
            filename: dbPath,
            driver: sqlite3_1.default.Database
        });
        await this.db.exec(`
      CREATE TABLE IF NOT EXISTS series_map (
        komgaSeriesId TEXT PRIMARY KEY,
        suwaMangaId TEXT UNIQUE,
        titleNorm TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS chapter_map (
        komgaBookId TEXT PRIMARY KEY,
        suwaChapterId TEXT UNIQUE,
        suwaMangaId TEXT,
        chapter REAL,
        volume REAL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastPushedKomga DATETIME,
        lastPushedSuwa DATETIME,
        lastReadKomga DATETIME,
        lastReadSuwa DATETIME
      );
      CREATE TABLE IF NOT EXISTS app_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        eventType TEXT NOT NULL,
        mangaTitle TEXT,
        chapterTitle TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
        // Run database migrations
        await this.runMigrations();
    }
    async runMigrations() {
        if (!this.db)
            return;
        try {
            // Check if lastReadKomga column exists, if not add it
            const chapterMapColumns = await this.db.all("PRAGMA table_info(chapter_map)");
            const hasLastReadKomga = chapterMapColumns.some(col => col.name === 'lastReadKomga');
            const hasLastReadSuwa = chapterMapColumns.some(col => col.name === 'lastReadSuwa');
            if (!hasLastReadKomga) {
                logger_1.logger.info('Adding lastReadKomga column to chapter_map table');
                await this.db.exec('ALTER TABLE chapter_map ADD COLUMN lastReadKomga DATETIME');
            }
            if (!hasLastReadSuwa) {
                logger_1.logger.info('Adding lastReadSuwa column to chapter_map table');
                await this.db.exec('ALTER TABLE chapter_map ADD COLUMN lastReadSuwa DATETIME');
            }
            // Check if series_map needs lastRead columns too
            const seriesMapColumns = await this.db.all("PRAGMA table_info(series_map)");
            const hasSeriesLastReadKomga = seriesMapColumns.some(col => col.name === 'lastReadKomga');
            const hasSeriesLastReadSuwa = seriesMapColumns.some(col => col.name === 'lastReadSuwa');
            if (!hasSeriesLastReadKomga) {
                logger_1.logger.info('Adding lastReadKomga column to series_map table');
                await this.db.exec('ALTER TABLE series_map ADD COLUMN lastReadKomga DATETIME');
            }
            if (!hasSeriesLastReadSuwa) {
                logger_1.logger.info('Adding lastReadSuwa column to series_map table');
                await this.db.exec('ALTER TABLE series_map ADD COLUMN lastReadSuwa DATETIME');
            }
            logger_1.logger.info('Database migrations completed successfully');
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Database migration failed');
            throw error;
        }
    }
    async getSeriesMap(komgaSeriesId) {
        if (!this.db)
            await this.initDb();
        const row = await this.db.get('SELECT * FROM series_map WHERE komgaSeriesId = ?', komgaSeriesId);
        return row;
    }
    async getSeriesMapBySuwa(suwaMangaId) {
        if (!this.db)
            await this.initDb();
        const row = await this.db.get('SELECT * FROM series_map WHERE suwaMangaId = ?', suwaMangaId);
        return row;
    }
    async insertSeriesMap(map) {
        if (!this.db)
            await this.initDb();
        await this.db.run(`
      INSERT OR REPLACE INTO series_map (komgaSeriesId, suwaMangaId, titleNorm, updatedAt)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, map.komgaSeriesId, map.suwaMangaId, map.titleNorm);
    }
    async getChapterMap(komgaBookId) {
        if (!this.db)
            await this.initDb();
        const row = await this.db.get('SELECT * FROM chapter_map WHERE komgaBookId = ?', komgaBookId);
        return row;
    }
    async getChapterMapBySuwa(suwaChapterId) {
        if (!this.db)
            await this.initDb();
        const row = await this.db.get('SELECT * FROM chapter_map WHERE suwaChapterId = ?', suwaChapterId);
        return row;
    }
    async insertChapterMap(map) {
        if (!this.db)
            await this.initDb();
        await this.db.run(`
      INSERT OR REPLACE INTO chapter_map (komgaBookId, suwaChapterId, suwaMangaId, chapter, volume, updatedAt)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, map.komgaBookId, map.suwaChapterId, map.suwaMangaId, map.chapter, map.volume);
    }
    async updateChapterMapLastPushedKomga(komgaBookId, date) {
        if (!this.db)
            await this.initDb();
        await this.db.run('UPDATE chapter_map SET lastPushedKomga = ? WHERE komgaBookId = ?', date.toISOString(), komgaBookId);
    }
    async updateChapterMapLastPushedSuwa(suwaChapterId, date) {
        if (!this.db)
            await this.initDb();
        await this.db.run('UPDATE chapter_map SET lastPushedSuwa = ? WHERE suwaChapterId = ?', date.toISOString(), suwaChapterId);
    }
    async updateChapterMapLastReadKomga(komgaBookId, date) {
        if (!this.db)
            await this.initDb();
        await this.db.run('UPDATE chapter_map SET lastReadKomga = ? WHERE komgaBookId = ?', date.toISOString(), komgaBookId);
    }
    async updateChapterMapLastReadSuwa(suwaChapterId, date) {
        if (!this.db)
            await this.initDb();
        await this.db.run('UPDATE chapter_map SET lastReadSuwa = ? WHERE suwaChapterId = ?', date.toISOString(), suwaChapterId);
    }
    async updateSeriesMapLastReadKomga(komgaSeriesId, date) {
        if (!this.db)
            await this.initDb();
        await this.db.run('UPDATE series_map SET lastReadKomga = ? WHERE komgaSeriesId = ?', date.toISOString(), komgaSeriesId);
    }
    async updateSeriesMapLastReadSuwa(suwaMangaId, date) {
        if (!this.db)
            await this.initDb();
        await this.db.run('UPDATE series_map SET lastReadSuwa = ? WHERE suwaMangaId = ?', date.toISOString(), suwaMangaId);
    }
    async getRecentlyReadChapters(hours = 24) {
        if (!this.db)
            await this.initDb();
        const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        const rows = await this.db.all(`
      SELECT * FROM chapter_map
      WHERE lastReadKomga >= ? OR lastReadSuwa >= ?
      ORDER BY COALESCE(lastReadKomga, lastReadSuwa) DESC
    `, cutoffDate, cutoffDate);
        return rows;
    }
    async getRecentlyReadSeries(hours = 24) {
        if (!this.db)
            await this.initDb();
        const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        const rows = await this.db.all(`
      SELECT * FROM series_map
      WHERE lastReadKomga >= ? OR lastReadSuwa >= ?
      ORDER BY COALESCE(lastReadKomga, lastReadSuwa) DESC
    `, cutoffDate, cutoffDate);
        return rows;
    }
    async getAllChapterMapsWithSeries() {
        if (!this.db)
            await this.initDb();
        const rows = await this.db.all(`
      SELECT cm.*, sm.titleNorm as seriesTitle
      FROM chapter_map cm
      LEFT JOIN series_map sm ON cm.suwaMangaId = sm.suwaMangaId
    `);
        return rows;
    }
    async getAllSeriesMaps() {
        if (!this.db)
            await this.initDb();
        const rows = await this.db.all('SELECT * FROM series_map');
        return rows;
    }
    async getAllChapterMaps() {
        if (!this.db)
            await this.initDb();
        const rows = await this.db.all('SELECT * FROM chapter_map');
        return rows;
    }
    async getSeriesMappingCount() {
        if (!this.db)
            await this.initDb();
        const row = await this.db.get('SELECT COUNT(*) as count FROM series_map');
        return row.count || 0;
    }
    async getChapterMappingCount() {
        if (!this.db)
            await this.initDb();
        const row = await this.db.get('SELECT COUNT(*) as count FROM chapter_map');
        return row.count || 0;
    }
    async getAllSeriesMappings() {
        return this.getAllSeriesMaps();
    }
    async deleteSeriesMapping(komgaSeriesId) {
        if (!this.db)
            await this.initDb();
        await this.db.run('DELETE FROM series_map WHERE komgaSeriesId = ?', komgaSeriesId);
    }
    async deleteChapterMapping(komgaBookId) {
        if (!this.db)
            await this.initDb();
        await this.db.run('DELETE FROM chapter_map WHERE komgaBookId = ?', komgaBookId);
    }
    async clearSyncTimestamps() {
        if (!this.db)
            await this.initDb();
        await this.db.run('UPDATE chapter_map SET lastPushedKomga = NULL, lastPushedSuwa = NULL');
        logger_1.logger.info('Cleared all sync timestamps from chapter mappings');
    }
    // App Event Logging Methods
    async logAppEvent(event) {
        if (!this.db)
            await this.initDb();
        await this.db.run(`
      INSERT INTO app_events (app, eventType, mangaTitle, chapterTitle, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, event.app, event.eventType, event.mangaTitle || null, event.chapterTitle || null, event.details || null, new Date().toISOString());
    }
    async getAppEvents(limit = 100) {
        if (!this.db)
            await this.initDb();
        const rows = await this.db.all(`
      SELECT * FROM app_events
      ORDER BY timestamp DESC
      LIMIT ?
    `, limit);
        return rows.map(row => ({
            ...row,
            timestamp: new Date(row.timestamp)
        }));
    }
    async getAppEventsByApp(app, limit = 50) {
        if (!this.db)
            await this.initDb();
        const rows = await this.db.all(`
      SELECT * FROM app_events
      WHERE app = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `, app, limit);
        return rows.map(row => ({
            ...row,
            timestamp: new Date(row.timestamp)
        }));
    }
    async clearAppEvents() {
        if (!this.db)
            await this.initDb();
        await this.db.run('DELETE FROM app_events');
        logger_1.logger.info('Cleared all app events');
    }
    async clearAppEventsByApp(app) {
        if (!this.db)
            await this.initDb();
        await this.db.run('DELETE FROM app_events WHERE app = ?', app);
        logger_1.logger.info(`Cleared all ${app} events`);
    }
}
exports.MappingRepository = MappingRepository;
