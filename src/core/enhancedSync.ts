import { KomgaClient } from '../clients/komga';
import { SuwaClient } from '../clients/suwa';
import { MappingRepository } from './mappingRepo';
import { Matcher } from './matcher';
import { logger } from '../utils/logger';
import { normalizeTitle } from '../utils/normalize';

export type SyncMode = 'full' | 'recent' | 'event-based';
export type SyncDirection = 'bidirectional' | 'komga-to-suwa' | 'suwa-to-komga';

export interface SyncOptions {
  mode: SyncMode;
  maxHoursForRecent?: number;
  forceFullSync?: boolean;
  direction?: SyncDirection;
}

export class EnhancedSyncService {
  constructor(
    private komga: KomgaClient,
    private suwa: SuwaClient,
    private repo: MappingRepository,
    private matcher: Matcher
  ) {}

  async sync(options: SyncOptions = { mode: 'full' }) {
    const { mode, maxHoursForRecent = 24, forceFullSync = false, direction = 'bidirectional' } = options;

    logger.info({ mode, maxHoursForRecent, forceFullSync, direction }, 'Starting enhanced sync cycle');

    try {
      switch (mode) {
        case 'event-based':
        case 'recent':
          await this.syncRecentlyRead(maxHoursForRecent, direction);
          break;
        case 'full':
        default:
          await this.syncFullLibrary(direction);
          break;
      }
    } catch (err) {
      logger.error(err, 'Enhanced sync cycle failed');
    }
  }

  async syncRecentlyRead(maxHours: number = 24, direction: SyncDirection = 'bidirectional') {
    logger.info({ maxHours, direction }, 'Starting event-based sync for recently read chapters');

    const recentlyReadChapters = await this.repo.getRecentlyReadChapters(maxHours);
    logger.info({ count: recentlyReadChapters.length }, 'Found recently read chapters');

    if (recentlyReadChapters.length === 0) {
      logger.info('No recently read chapters found, skipping sync');
      return;
    }

    await this.syncChapters(recentlyReadChapters, direction);
    logger.info('Completed event-based sync cycle');
  }

  async syncFullLibrary(direction: SyncDirection = 'bidirectional') {
    logger.info({ direction }, 'Starting full library sync');

    const allChapters = await this.repo.getAllChapterMaps();
    logger.info({ totalMappings: allChapters.length }, 'Starting full library sync');

    await this.syncChapters(allChapters, direction);
    logger.info('Completed full library sync cycle');
  }

  private async syncChapters(chapters: any[], direction: SyncDirection = 'bidirectional') {
    switch (direction) {
      case 'komga-to-suwa':
        await this.syncKomgaToSuwaForChapters(chapters);
        break;
      case 'suwa-to-komga':
        await this.syncSuwaToKomgaForChapters(chapters);
        break;
      case 'bidirectional':
      default:
        // Sync Komga to Suwayomi
        await this.syncKomgaToSuwaForChapters(chapters);
        // Sync Suwayomi to Komga
        await this.syncSuwaToKomgaForChapters(chapters);
        break;
    }
  }

  private async syncKomgaToSuwaForChapters(chapters: any[]) {
    logger.info({ totalMappings: chapters.length }, 'Starting Komga to Suwayomi sync for chapters');

    for (const chapter of chapters) {
      try {
        // Get the series mapping to find the Komga series ID
        const seriesMap = await this.repo.getSeriesMapBySuwa(chapter.suwaMangaId);
        if (!seriesMap) {
          logger.warn({ suwaMangaId: chapter.suwaMangaId }, 'No series mapping found, skipping');
          continue;
        }

        // Get the book data which includes read progress
        const books = await this.komga.getBooks(seriesMap.komgaSeriesId);
        const book = books.find((b: any) => b.id === chapter.komgaBookId);

        if (!book) {
          logger.warn({ bookId: chapter.komgaBookId }, 'Book not found in Komga, skipping');
          continue;
        }

        const progress = book.readProgress || { page: 0, completed: false, readDate: null };

        // Update last read timestamp if there's progress
        if (progress.completed || progress.page > 0) {
          await this.repo.updateChapterMapLastReadKomga(chapter.komgaBookId, new Date(progress.readDate || Date.now()));
        }

        logger.debug({
          bookId: chapter.komgaBookId,
          bookTitle: book.metadata?.title || book.name,
          komgaProgress: {
            completed: progress.completed,
            page: progress.page,
            readDate: progress.readDate
          }
        }, 'Komga reading progress retrieved');

        // Get all chapters and find the matching one by chapter number/title instead of ID
        const chapters_suwa = await this.suwa.getChapters(chapter.suwaMangaId);
        const chapter_suwa = chapters_suwa.find((c: any) => {
          // Try to match by chapter number first (most reliable)
          if (c.chapterNumber && chapter.chapter !== undefined) {
            return Math.abs(c.chapterNumber - chapter.chapter) < 0.001;
          }
          // Fallback to title matching if chapter numbers don't match
          if (c.name && book.metadata?.title) {
            return this.matcher.matchSeries(book.metadata.title, c.name);
          }
          return false;
        });

        if (!chapter_suwa) {
          logger.warn({
            bookId: chapter.komgaBookId,
            chapterNum: chapter.chapter,
            bookTitle: book.metadata?.title || book.name,
            availableChapters: chapters_suwa.slice(0, 3).map((c: any) => ({ id: c.id, number: c.chapterNumber, name: c.name }))
          }, 'Matching chapter not found in Suwayomi');
          continue;
        }

        logger.debug({
          chapterId: chapter_suwa.id,
          chapterNumber: chapter_suwa.chapterNumber,
          chapterName: chapter_suwa.name,
          isRead: chapter_suwa.isRead,
          lastReadAt: chapter_suwa.lastReadAt
        }, 'Suwayomi chapter found and matched');

        const shouldSync = (progress.completed || progress.page > 0) && (!chapter_suwa.isRead || chapter_suwa.lastPageRead !== progress.page ||
          !chapter.lastPushedKomga || (chapter_suwa.lastReadAt && new Date(chapter_suwa.lastReadAt) < chapter.lastPushedKomga));

        logger.info({
          bookId: chapter.komgaBookId,
          bookTitle: book.metadata?.title || book.name,
          chapterId: chapter_suwa.id,
          chapterNumber: chapter_suwa.chapterNumber,
          komgaCompleted: progress.completed,
          suwayomiRead: chapter_suwa.isRead,
          lastPushedKomga: chapter.lastPushedKomga,
          shouldSync: shouldSync
        }, 'Sync decision for Komga to Suwayomi');

        if (shouldSync) {
          logger.info({
            action: 'SYNC_KOMGA_TO_SUWA',
            bookId: chapter.komgaBookId,
            bookTitle: book.metadata?.title || book.name,
            chapterId: chapter_suwa.id,
            chapterNumber: chapter_suwa.chapterNumber,
            komgaProgress: {
              completed: progress.completed,
              page: progress.page,
              readDate: progress.readDate
            },
            suwayomiBefore: {
              isRead: chapter_suwa.isRead,
              lastReadAt: chapter_suwa.lastReadAt
            }
          }, 'Sending reading progress from Komga to Suwayomi');

          await this.suwa.setChapterProgress(chapter_suwa.id, progress.page || 0, progress.completed);
          await this.repo.updateChapterMapLastPushedKomga(chapter.komgaBookId, new Date());

          logger.info({
            bookId: chapter.komgaBookId,
            chapterId: chapter_suwa.id,
            chapterNum: chapter_suwa.chapterNumber,
            bookTitle: book.metadata?.title || book.name,
            page: progress.page || 0,
            completed: progress.completed
          }, '✅ Successfully synced Komga progress to Suwayomi');
        } else {
          logger.debug({
            bookId: chapter.komgaBookId,
            chapterId: chapter_suwa.id,
            reason: !progress.completed && progress.page === 0 ? 'No progress in Komga' :
                    chapter_suwa.isRead && chapter_suwa.lastPageRead === progress.page ? 'Already synced' :
                    'Recently synced'
          }, 'Skipping sync - no action needed');
        }
      } catch (err) {
        logger.error({
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          chapter: {
            komgaBookId: chapter.komgaBookId,
            suwaChapterId: chapter.suwaChapterId,
            chapter: chapter.chapter
          }
        }, 'Error syncing Komga to Suwa');
      }
    }

    logger.info('Completed Komga to Suwayomi sync cycle');
  }

  private async syncSuwaToKomgaForChapters(chapters: any[]) {
    logger.info({ totalMappings: chapters.length }, 'Starting Suwayomi to Komga sync for chapters');

    for (const chapter of chapters) {
      try {
        const chapters_suwa = await this.suwa.getChapters(chapter.suwaMangaId);
        // Find chapter by number/title matching instead of ID
        const chapter_suwa = chapters_suwa.find((c: any) => {
          // Try to match by chapter number first (most reliable)
          if (c.chapterNumber && chapter.chapter !== undefined) {
            return Math.abs(c.chapterNumber - chapter.chapter) < 0.001;
          }
          // Fallback to title matching if chapter numbers don't match
          if (c.name && chapter.chapter !== undefined) {
            return this.matcher.matchSeries(`Chapter ${chapter.chapter}`, c.name);
          }
          return false;
        });

        if (!chapter_suwa) {
          logger.warn({
            chapterId: chapter.suwaChapterId,
            mangaId: chapter.suwaMangaId,
            chapterNum: chapter.chapter,
            availableChapters: chapters_suwa.slice(0, 3).map((c: any) => ({ id: c.id, number: c.chapterNumber, name: c.name }))
          }, 'Matching chapter not found in Suwayomi');
          continue;
        }

        // Update last read timestamp if there's progress
        if (chapter_suwa.isRead || chapter_suwa.lastPageRead > 0) {
          await this.repo.updateChapterMapLastReadSuwa(chapter.suwaChapterId, new Date(chapter_suwa.lastReadAt || Date.now()));
        }

        logger.debug({
          chapterId: chapter_suwa.id,
          chapterNumber: chapter_suwa.chapterNumber,
          chapterName: chapter_suwa.name,
          isRead: chapter_suwa.isRead,
          lastReadAt: chapter_suwa.lastReadAt
        }, 'Suwayomi chapter found for Komga sync');

        // Get the series mapping to find the Komga series ID
        const seriesMap = await this.repo.getSeriesMapBySuwa(chapter.suwaMangaId);
        if (!seriesMap) {
          logger.warn({ suwaMangaId: chapter.suwaMangaId }, 'No series mapping found');
          continue;
        }

        // Get the book data which includes read progress
        const books = await this.komga.getBooks(seriesMap.komgaSeriesId);
        const book = books.find((b: any) => b.id === chapter.komgaBookId);

        if (!book) {
          logger.warn({ bookId: chapter.komgaBookId }, 'Book not found in Komga');
          continue;
        }

        const progress = book.readProgress || { page: 0, completed: false, readDate: null };

        logger.debug({
          bookId: chapter.komgaBookId,
          bookTitle: book.metadata?.title || book.name,
          komgaProgress: {
            completed: progress.completed,
            page: progress.page,
            readDate: progress.readDate
          }
        }, 'Komga reading progress retrieved for Suwayomi sync');

        const shouldSync = (chapter_suwa.isRead || chapter_suwa.lastPageRead > 0) && (!progress.completed || progress.page !== chapter_suwa.lastPageRead ||
          !chapter.lastPushedSuwa || (progress.readDate && new Date(progress.readDate) < chapter.lastPushedSuwa));

        logger.info({
          chapterId: chapter_suwa.id,
          chapterNumber: chapter_suwa.chapterNumber,
          chapterTitle: chapter_suwa.name,
          bookId: chapter.komgaBookId,
          bookTitle: book.metadata?.title || book.name,
          suwayomiRead: chapter_suwa.isRead,
          komgaCompleted: progress.completed,
          lastPushedSuwa: chapter.lastPushedSuwa,
          shouldSync: shouldSync
        }, 'Sync decision for Suwayomi to Komga');

        if (shouldSync) {
          logger.info({
            action: 'SYNC_SUWA_TO_KOMGA',
            chapterId: chapter_suwa.id,
            chapterTitle: chapter_suwa.name,
            chapterNumber: chapter_suwa.chapterNumber,
            bookId: chapter.komgaBookId,
            bookTitle: book.metadata?.title || book.name,
            suwayomiState: {
              isRead: chapter_suwa.isRead,
              lastReadAt: chapter_suwa.lastReadAt
            },
            komgaBefore: {
              completed: progress.completed,
              page: progress.page,
              readDate: progress.readDate
            }
          }, 'Sending reading progress from Suwayomi to Komga');

          // When marking as completed, use the total page count instead of 0
          const totalPages = book.media?.pagesCount || chapter_suwa.pageCount || 0;
          const pageToSend = chapter_suwa.isRead ? totalPages : (chapter_suwa.lastPageRead || 0);

          await this.komga.patchReadProgress(chapter.komgaBookId, pageToSend, chapter_suwa.isRead);
          await this.repo.updateChapterMapLastPushedSuwa(chapter.suwaChapterId, new Date());

          logger.info({
            chapterId: chapter_suwa.id,
            bookId: chapter.komgaBookId,
            chapterNum: chapter_suwa.chapterNumber,
            chapterTitle: chapter_suwa.name,
            bookTitle: book.metadata?.title || book.name,
            pageSent: pageToSend,
            totalPages: totalPages,
            completed: chapter_suwa.isRead
          }, '✅ Successfully synced Suwayomi progress to Komga');
        } else {
          logger.debug({
            chapterId: chapter_suwa.id,
            bookId: chapter.komgaBookId,
            reason: !chapter_suwa.isRead && chapter_suwa.lastPageRead === 0 ? 'No progress in Suwayomi' :
                    progress.completed && progress.page === chapter_suwa.lastPageRead ? 'Already synced' :
                    'Recently synced'
          }, 'Skipping sync - no action needed');
        }
      } catch (err) {
        logger.error({
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          chapter: {
            komgaBookId: chapter.komgaBookId,
            suwaChapterId: chapter.suwaChapterId,
            chapter: chapter.chapter
          }
        }, 'Error syncing Suwa to Komga');
      }
    }

    logger.info('Completed Suwayomi to Komga sync cycle');
  }

  // Legacy method for backward compatibility - renamed to avoid conflict
  async performFullSync() {
    await this.syncFullLibrary();
  }

  async matchAndMap() {
    logger.info('Starting initial matching and mapping');
    const komgaSeries = await this.komga.getSeries();
    const suwaMangas = await this.suwa.getLibrary();

    for (const komgaSerie of komgaSeries) {
      for (const suwaManga of suwaMangas) {
        if (this.matcher.matchSeries(komgaSerie.metadata.title, suwaManga.title)) {
          await this.repo.insertSeriesMap({
            komgaSeriesId: komgaSerie.id,
            suwaMangaId: suwaManga.id,
            titleNorm: normalizeTitle(komgaSerie.metadata.title)
          });
          logger.info({ komgaId: komgaSerie.id, suwaId: suwaManga.id }, 'Mapped series');

          // Map chapters
          const books = await this.komga.getBooks(komgaSerie.id);
          const chapters = await this.suwa.getChapters(suwaManga.id);
          for (const book of books) {
            for (const chapter of chapters) {
              if (this.matcher.matchChapter(book, chapter)) {
                await this.repo.insertChapterMap({
                  komgaBookId: book.id,
                  suwaChapterId: chapter.id,
                  suwaMangaId: suwaManga.id,
                  chapter: chapter.chapterNumber,
                  volume: book.metadata.volume ? parseFloat(book.metadata.volume) : undefined
                });
                logger.info({
                  bookId: book.id,
                  chapterId: chapter.id,
                  bookTitle: book.metadata?.title || book.name,
                  chapterTitle: chapter.name || `Chapter ${chapter.chapterNumber}`,
                  chapterNumber: chapter.chapterNumber
                }, 'Mapped chapter');
              }
            }
          }
        }
      }
    }
  }
}
