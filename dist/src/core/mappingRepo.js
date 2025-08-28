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
        lastPushedSuwa DATETIME
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
