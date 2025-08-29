import { KomgaClient } from '../clients/komga';
import { SuwaClient } from '../clients/suwa';
import { MappingRepository } from './mappingRepo';
import { Matcher } from './matcher';
import { logger } from '../utils/logger';
import { normalizeTitle } from '../utils/normalize';

// Cache interfaces
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface SeriesData {
  id: string;
  metadata: { title: string };
  books?: any[];
}

interface MangaData {
  id: string;
  title: string;
  chapters?: any[];
}

interface ChapterData {
  id: string;
  chapterNumber: number;
  name: string;
  isRead: boolean;
  lastReadAt?: string;
  lastPageRead?: number;
}

export class OptimizedSyncService {
  private cache = new Map<string, CacheEntry<any>>();
  private apiCallQueue: Map<string, Promise<any>> = new Map();
  private lastSyncTimestamps = new Map<string, number>();
  private rateLimiter = new Map<string, number>();

  // Configuration
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly API_RATE_LIMIT = 1000; // 1 second between API calls
  private readonly MAX_CONCURRENT_REQUESTS = 5;
  private readonly BATCH_SIZE = 10;

  constructor(
    private komga: KomgaClient,
    private suwa: SuwaClient,
    private repo: MappingRepository,
    private matcher: Matcher
  ) {}

  async sync(options: {
    mode: 'full';
    maxHoursForRecent?: number;
    forceFullSync?: boolean;
    direction?: 'bidirectional' | 'komga-to-suwa' | 'suwa-to-komga';
  } = { mode: 'full' }) {
    const { mode, maxHoursForRecent = 24, forceFullSync = false, direction = 'bidirectional' } = options;

    logger.info({ mode, maxHoursForRecent, forceFullSync, direction }, 'Starting optimized sync cycle');

    try {
      switch (mode) {
        case 'full':
        default:
          await this.syncFullLibrary(direction, forceFullSync);
          break;
      }
    } catch (err) {
      logger.error(err, 'Optimized sync cycle failed');
    }
  }

  private async syncFullLibrary(direction: 'bidirectional' | 'komga-to-suwa' | 'suwa-to-komga' = 'bidirectional', force: boolean = false) {
    logger.info({ direction, force }, 'Starting optimized full library sync');

    const allChapters = await this.repo.getAllChapterMaps();
    logger.info({ totalMappings: allChapters.length }, 'Starting optimized full library sync');

    // Group chapters by series to batch API calls
    const chaptersBySeries = this.groupChaptersBySeries(allChapters);

    await this.syncChaptersBySeries(chaptersBySeries, direction, force);
    logger.info('Completed optimized full library sync cycle');
  }

  private groupChaptersBySeries(chapters: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const chapter of chapters) {
      const seriesKey = chapter.suwaMangaId;
      if (!grouped.has(seriesKey)) {
        grouped.set(seriesKey, []);
      }
      grouped.get(seriesKey)!.push(chapter);
    }

    return grouped;
  }

  private async syncChaptersBySeries(
    chaptersBySeries: Map<string, any[]>,
    direction: 'bidirectional' | 'komga-to-suwa' | 'suwa-to-komga',
    force: boolean = false
  ) {
    const seriesIds = Array.from(chaptersBySeries.keys());
    logger.info({ seriesCount: seriesIds.length }, 'Processing series in batches');

    // Process series in batches to avoid overwhelming APIs
    for (let i = 0; i < seriesIds.length; i += this.BATCH_SIZE) {
      const batchSeriesIds = seriesIds.slice(i, i + this.BATCH_SIZE);
      logger.debug({ batch: `${i + 1}-${Math.min(i + this.BATCH_SIZE, seriesIds.length)}`, count: batchSeriesIds.length }, 'Processing batch');

      const batchPromises = batchSeriesIds.map(seriesId => this.syncSeries(seriesId, chaptersBySeries.get(seriesId)!, direction, force));
      await Promise.allSettled(batchPromises);

      // Rate limiting between batches
      if (i + this.BATCH_SIZE < seriesIds.length) {
        await this.delay(1000);
      }
    }
  }

  private async syncSeries(seriesId: string, chapters: any[], direction: 'bidirectional' | 'komga-to-suwa' | 'suwa-to-komga', force: boolean = false) {
    try {
      // Get series mapping
      const seriesMap = await this.repo.getSeriesMapBySuwa(seriesId);
      if (!seriesMap) {
        logger.warn({ suwaMangaId: seriesId }, 'No series mapping found, skipping');
        return;
      }

      // Check if we need to sync this series (based on last sync time)
      const lastSync = this.lastSyncTimestamps.get(seriesId);
      const now = Date.now();
      if (!force && lastSync && (now - lastSync) < 300000) { // 5 minutes
        logger.debug({ seriesId }, 'Skipping series - recently synced');
        return;
      }

      // Batch fetch data for this series
      const [komgaBooks, suwaChapters] = await Promise.allSettled([
        this.getCachedKomgaBooks(seriesMap.komgaSeriesId),
        this.getCachedSuwaChapters(seriesId)
      ]);

      if (komgaBooks.status === 'rejected') {
        logger.error({ error: komgaBooks.reason, seriesId: seriesMap.komgaSeriesId }, 'Failed to fetch Komga books');
        return;
      }

      if (suwaChapters.status === 'rejected') {
        logger.error({ error: suwaChapters.reason, seriesId }, 'Failed to fetch Suwayomi chapters');
        return;
      }

      // Create lookup maps for efficient matching
      const komgaBookMap = new Map(komgaBooks.value.map((book: any) => [book.id, book]));
      const suwaChapterMap = new Map(suwaChapters.value.map((chapter: any) => [chapter.chapterNumber, chapter]));

      // Sync chapters
      const syncPromises = chapters.map(chapter =>
        this.syncChapter(chapter, seriesMap, komgaBookMap, suwaChapterMap, direction)
      );

      await Promise.allSettled(syncPromises);
      this.lastSyncTimestamps.set(seriesId, now);

    } catch (err) {
      logger.error({ error: err, seriesId }, 'Error syncing series');
    }
  }

  private async syncChapter(
    chapter: any,
    seriesMap: any,
    komgaBookMap: Map<string, any>,
    suwaChapterMap: Map<number, any>,
    direction: 'bidirectional' | 'komga-to-suwa' | 'suwa-to-komga'
  ) {
    try {
      const komgaBook = komgaBookMap.get(chapter.komgaBookId);
      const suwaChapter = suwaChapterMap.get(chapter.chapter);

      if (!komgaBook || !suwaChapter) {
        logger.debug({
          chapterId: chapter.komgaBookId,
          hasKomgaBook: !!komgaBook,
          hasSuwaChapter: !!suwaChapter
        }, 'Missing book or chapter data, skipping');
        return;
      }

      const komgaProgress = komgaBook.readProgress || { page: 0, completed: false, readDate: null };

      // Determine sync direction
      if (direction === 'bidirectional' || direction === 'komga-to-suwa') {
        await this.syncKomgaToSuwaProgress(chapter, komgaProgress, suwaChapter);
      }

      if (direction === 'bidirectional' || direction === 'suwa-to-komga') {
        await this.syncSuwaToKomgaProgress(chapter, komgaBook, suwaChapter);
      }

    } catch (err) {
      logger.error({ error: err, chapter: chapter.komgaBookId }, 'Error syncing chapter');
    }
  }

  private async syncKomgaToSuwaProgress(chapter: any, komgaProgress: any, suwaChapter: any) {
    const shouldSync = (komgaProgress.completed || komgaProgress.page > 0) &&
      (!suwaChapter.isRead || suwaChapter.lastPageRead !== komgaProgress.page ||
       !chapter.lastPushedKomga || (suwaChapter.lastReadAt && new Date(suwaChapter.lastReadAt) < chapter.lastPushedKomga));

    if (shouldSync) {
      await this.rateLimitedApiCall(
        `suwa-progress-${suwaChapter.id}`,
        () => this.suwa.setChapterProgress(suwaChapter.id, komgaProgress.page || 0, komgaProgress.completed)
      );

      await this.repo.updateChapterMapLastPushedKomga(chapter.komgaBookId, new Date());

      logger.info({
        bookId: chapter.komgaBookId,
        chapterId: suwaChapter.id,
        page: komgaProgress.page || 0,
        completed: komgaProgress.completed
      }, '✅ Synced Komga → Suwayomi');
    }
  }

  private async syncSuwaToKomgaProgress(chapter: any, komgaBook: any, suwaChapter: any) {
    const komgaProgress = komgaBook.readProgress || { page: 0, completed: false, readDate: null };

    const shouldSync = (suwaChapter.isRead || suwaChapter.lastPageRead > 0) &&
      (!komgaProgress.completed || komgaProgress.page !== suwaChapter.lastPageRead ||
       !chapter.lastPushedSuwa || (komgaProgress.readDate && new Date(komgaProgress.readDate) < chapter.lastPushedSuwa));

    if (shouldSync) {
      const totalPages = komgaBook.media?.pagesCount || suwaChapter.pageCount || 0;
      const pageToSend = suwaChapter.isRead ? totalPages : (suwaChapter.lastPageRead || 0);

      await this.rateLimitedApiCall(
        `komga-progress-${chapter.komgaBookId}`,
        () => this.komga.patchReadProgress(chapter.komgaBookId, pageToSend, suwaChapter.isRead)
      );

      await this.repo.updateChapterMapLastPushedSuwa(chapter.suwaChapterId, new Date());

      logger.info({
        chapterId: suwaChapter.id,
        bookId: chapter.komgaBookId,
        page: pageToSend,
        completed: suwaChapter.isRead
      }, '✅ Synced Suwayomi → Komga');
    }
  }

  // Cached API methods with deduplication
  private async getCachedKomgaBooks(seriesId: string): Promise<any[]> {
    const cacheKey = `komga-books-${seriesId}`;
    const cached = this.getCache<any[]>(cacheKey);

    if (cached) {
      return cached;
    }

    // Check if request is already in progress
    if (this.apiCallQueue.has(cacheKey)) {
      return this.apiCallQueue.get(cacheKey)!;
    }

    const promise = this.rateLimitedApiCall(
      `komga-books-${seriesId}`,
      () => this.komga.getBooks(seriesId)
    );

    this.apiCallQueue.set(cacheKey, promise);

    try {
      const data = await promise;
      this.setCache(cacheKey, data);
      return data;
    } finally {
      this.apiCallQueue.delete(cacheKey);
    }
  }

  private async getCachedSuwaChapters(mangaId: string): Promise<any[]> {
    const cacheKey = `suwa-chapters-${mangaId}`;
    const cached = this.getCache<any[]>(cacheKey);

    if (cached) {
      return cached;
    }

    // Check if request is already in progress
    if (this.apiCallQueue.has(cacheKey)) {
      return this.apiCallQueue.get(cacheKey)!;
    }

    const promise = this.rateLimitedApiCall(
      `suwa-chapters-${mangaId}`,
      () => this.suwa.getChapters(mangaId)
    );

    this.apiCallQueue.set(cacheKey, promise);

    try {
      const data = await promise;
      this.setCache(cacheKey, data);
      return data;
    } finally {
      this.apiCallQueue.delete(cacheKey);
    }
  }

  // Cache management
  private getCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      return entry.data;
    }
    if (entry) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCache<T>(key: string, data: T, ttl: number = this.CACHE_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  // Rate limiting
  private async rateLimitedApiCall<T>(key: string, apiCall: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const lastCall = this.rateLimiter.get(key) || 0;

    if (now - lastCall < this.API_RATE_LIMIT) {
      const delay = this.API_RATE_LIMIT - (now - lastCall);
      await this.delay(delay);
    }

    this.rateLimiter.set(key, Date.now());
    return apiCall();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cleanup methods
  clearCache(): void {
    this.cache.clear();
    this.apiCallQueue.clear();
    this.lastSyncTimestamps.clear();
    this.rateLimiter.clear();
    logger.info('Cache and rate limiter cleared');
  }

  getCacheStats(): { cacheSize: number; activeRequests: number } {
    return {
      cacheSize: this.cache.size,
      activeRequests: this.apiCallQueue.size
    };
  }
}
