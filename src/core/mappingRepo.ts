import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { logger } from '../utils/logger';

export interface SeriesMap {
  komgaSeriesId: string;
  suwaMangaId: string;
  titleNorm: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppEvent {
  id?: number;
  app: 'komga' | 'suwayomi';
  eventType: string;
  mangaTitle?: string;
  chapterTitle?: string;
  details?: string;
  timestamp: Date;
}

export interface ChapterMap {
  komgaBookId: string;
  suwaChapterId: string;
  suwaMangaId: string;
  chapter: number;
  volume?: number;
  createdAt: Date;
  updatedAt: Date;
  lastPushedKomga: Date | null;
  lastPushedSuwa: Date | null;
}

export class MappingRepository {
  private db: Database | null = null;

  constructor() {
    this.initDb();
  }

  private async initDb() {
    const dbPath = process.env.DB_PATH || './data/sync.db';
    this.db = await open({
      filename: dbPath,
      driver: sqlite3.Database
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

  async getSeriesMap(komgaSeriesId: string): Promise<SeriesMap | undefined> {
    if (!this.db) await this.initDb();
    const row = await this.db!.get('SELECT * FROM series_map WHERE komgaSeriesId = ?', komgaSeriesId);
    return row as SeriesMap | undefined;
  }

  async getSeriesMapBySuwa(suwaMangaId: string): Promise<SeriesMap | undefined> {
    if (!this.db) await this.initDb();
    const row = await this.db!.get('SELECT * FROM series_map WHERE suwaMangaId = ?', suwaMangaId);
    return row as SeriesMap | undefined;
  }

  async insertSeriesMap(map: Omit<SeriesMap, 'createdAt' | 'updatedAt'>): Promise<void> {
    if (!this.db) await this.initDb();
    await this.db!.run(`
      INSERT OR REPLACE INTO series_map (komgaSeriesId, suwaMangaId, titleNorm, updatedAt)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, map.komgaSeriesId, map.suwaMangaId, map.titleNorm);
  }

  async getChapterMap(komgaBookId: string): Promise<ChapterMap | undefined> {
    if (!this.db) await this.initDb();
    const row = await this.db!.get('SELECT * FROM chapter_map WHERE komgaBookId = ?', komgaBookId);
    return row as ChapterMap | undefined;
  }

  async getChapterMapBySuwa(suwaChapterId: string): Promise<ChapterMap | undefined> {
    if (!this.db) await this.initDb();
    const row = await this.db!.get('SELECT * FROM chapter_map WHERE suwaChapterId = ?', suwaChapterId);
    return row as ChapterMap | undefined;
  }

  async insertChapterMap(map: Omit<ChapterMap, 'createdAt' | 'updatedAt' | 'lastPushedKomga' | 'lastPushedSuwa'>): Promise<void> {
    if (!this.db) await this.initDb();
    await this.db!.run(`
      INSERT OR REPLACE INTO chapter_map (komgaBookId, suwaChapterId, suwaMangaId, chapter, volume, updatedAt)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, map.komgaBookId, map.suwaChapterId, map.suwaMangaId, map.chapter, map.volume);
  }

  async updateChapterMapLastPushedKomga(komgaBookId: string, date: Date): Promise<void> {
    if (!this.db) await this.initDb();
    await this.db!.run('UPDATE chapter_map SET lastPushedKomga = ? WHERE komgaBookId = ?', date.toISOString(), komgaBookId);
  }

  async updateChapterMapLastPushedSuwa(suwaChapterId: string, date: Date): Promise<void> {
    if (!this.db) await this.initDb();
    await this.db!.run('UPDATE chapter_map SET lastPushedSuwa = ? WHERE suwaChapterId = ?', date.toISOString(), suwaChapterId);
  }

  async getAllSeriesMaps(): Promise<SeriesMap[]> {
    if (!this.db) await this.initDb();
    const rows = await this.db!.all('SELECT * FROM series_map');
    return rows as SeriesMap[];
  }

  async getAllChapterMaps(): Promise<ChapterMap[]> {
    if (!this.db) await this.initDb();
    const rows = await this.db!.all('SELECT * FROM chapter_map');
    return rows as ChapterMap[];
  }

  async getSeriesMappingCount(): Promise<number> {
    if (!this.db) await this.initDb();
    const row = await this.db!.get('SELECT COUNT(*) as count FROM series_map');
    return row.count || 0;
  }

  async getChapterMappingCount(): Promise<number> {
    if (!this.db) await this.initDb();
    const row = await this.db!.get('SELECT COUNT(*) as count FROM chapter_map');
    return row.count || 0;
  }

  async getAllSeriesMappings(): Promise<SeriesMap[]> {
    return this.getAllSeriesMaps();
  }

  async deleteSeriesMapping(komgaSeriesId: string): Promise<void> {
    if (!this.db) await this.initDb();
    await this.db!.run('DELETE FROM series_map WHERE komgaSeriesId = ?', komgaSeriesId);
  }

  async deleteChapterMapping(komgaBookId: string): Promise<void> {
    if (!this.db) await this.initDb();
    await this.db!.run('DELETE FROM chapter_map WHERE komgaBookId = ?', komgaBookId);
  }

  async clearSyncTimestamps(): Promise<void> {
    if (!this.db) await this.initDb();
    await this.db!.run('UPDATE chapter_map SET lastPushedKomga = NULL, lastPushedSuwa = NULL');
    logger.info('Cleared all sync timestamps from chapter mappings');
  }

  // App Event Logging Methods
  async logAppEvent(event: Omit<AppEvent, 'id' | 'timestamp'>): Promise<void> {
    if (!this.db) await this.initDb();
    await this.db!.run(`
      INSERT INTO app_events (app, eventType, mangaTitle, chapterTitle, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, event.app, event.eventType, event.mangaTitle || null, event.chapterTitle || null, event.details || null, new Date().toISOString());
  }

  async getAppEvents(limit: number = 100): Promise<AppEvent[]> {
    if (!this.db) await this.initDb();
    const rows = await this.db!.all(`
      SELECT * FROM app_events
      ORDER BY timestamp DESC
      LIMIT ?
    `, limit);
    return rows.map(row => ({
      ...row,
      timestamp: new Date(row.timestamp)
    })) as AppEvent[];
  }

  async getAppEventsByApp(app: 'komga' | 'suwayomi', limit: number = 50): Promise<AppEvent[]> {
    if (!this.db) await this.initDb();
    const rows = await this.db!.all(`
      SELECT * FROM app_events
      WHERE app = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `, app, limit);
    return rows.map(row => ({
      ...row,
      timestamp: new Date(row.timestamp)
    })) as AppEvent[];
  }

  async clearAppEvents(): Promise<void> {
    if (!this.db) await this.initDb();
    await this.db!.run('DELETE FROM app_events');
    logger.info('Cleared all app events');
  }

  async clearAppEventsByApp(app: 'komga' | 'suwayomi'): Promise<void> {
    if (!this.db) await this.initDb();
    await this.db!.run('DELETE FROM app_events WHERE app = ?', app);
    logger.info(`Cleared all ${app} events`);
  }
}
