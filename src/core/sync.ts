import { KomgaClient } from '../clients/komga';
import { SuwaClient } from '../clients/suwa';
import { MappingRepository } from './mappingRepo';
import { Matcher } from './matcher';
import { logger } from '../utils/logger';
import { normalizeTitle } from '../utils/normalize';

export class SyncService {
  constructor(
    private komga: KomgaClient,
    private suwa: SuwaClient,
    private repo: MappingRepository,
    private matcher: Matcher
  ) {}

  async sync() {
    logger.info('Starting sync cycle');
    try {
      await this.syncKomgaToSuwa();
      await this.syncSuwaToKomga();
    } catch (err) {
      logger.error(err, 'Sync cycle failed');
    }
  }

  private async syncKomgaToSuwa() {
    const chapterMaps = await this.repo.getAllChapterMaps();
    logger.info({ totalMappings: chapterMaps.length }, 'Starting Komga to Suwayomi sync');

    for (const map of chapterMaps) {
      try {
        // Get the series mapping to find the Komga series ID
        const seriesMap = await this.repo.getSeriesMapBySuwa(map.suwaMangaId);
        if (!seriesMap) {
          logger.warn({ suwaMangaId: map.suwaMangaId }, 'No series mapping found, skipping');
          continue;
        }

        // Get the book data which includes read progress
        const books = await this.komga.getBooks(seriesMap.komgaSeriesId);
        const book = books.find((b: any) => b.id === map.komgaBookId);

        if (!book) {
          logger.warn({ bookId: map.komgaBookId }, 'Book not found in Komga, skipping');
          continue;
        }

        const progress = book.readProgress || { page: 0, completed: false, readDate: null };

        logger.debug({
          bookId: map.komgaBookId,
          bookTitle: book.metadata?.title || book.name,
          komgaProgress: {
            completed: progress.completed,
            page: progress.page,
            readDate: progress.readDate
          }
        }, 'Komga reading progress retrieved');

        // Get all chapters and find the matching one by chapter number/title instead of ID
        const chapters = await this.suwa.getChapters(map.suwaMangaId);
        const chapter = chapters.find((c: any) => {
          // Try to match by chapter number first (most reliable)
          if (c.chapterNumber && map.chapter !== undefined) {
            return Math.abs(c.chapterNumber - map.chapter) < 0.001;
          }
          // Fallback to title matching if chapter numbers don't match
          if (c.name && book.metadata?.title) {
            return this.matcher.matchSeries(book.metadata.title, c.name);
          }
          return false;
        });

        if (!chapter) {
          logger.warn({
            bookId: map.komgaBookId,
            chapterNum: map.chapter,
            bookTitle: book.metadata?.title || book.name,
            availableChapters: chapters.slice(0, 3).map((c: any) => ({ id: c.id, number: c.chapterNumber, name: c.name }))
          }, 'Matching chapter not found in Suwayomi');
          continue;
        }

        logger.debug({
          chapterId: chapter.id,
          chapterNumber: chapter.chapterNumber,
          chapterName: chapter.name,
          isRead: chapter.isRead,
          lastReadAt: chapter.lastReadAt
        }, 'Suwayomi chapter found and matched');

        const shouldSync = (progress.completed || progress.page > 0) && (!chapter.isRead || chapter.lastPageRead !== progress.page ||
          !map.lastPushedKomga || (chapter.lastReadAt && new Date(chapter.lastReadAt) < map.lastPushedKomga));

        logger.info({
          bookId: map.komgaBookId,
          bookTitle: book.metadata?.title || book.name,
          chapterId: chapter.id,
          chapterNumber: chapter.chapterNumber,
          komgaCompleted: progress.completed,
          suwayomiRead: chapter.isRead,
          lastPushedKomga: map.lastPushedKomga,
          shouldSync: shouldSync
        }, 'Sync decision for Komga to Suwayomi');

        if (shouldSync) {
          logger.info({
            action: 'SYNC_KOMGA_TO_SUWA',
            bookId: map.komgaBookId,
            bookTitle: book.metadata?.title || book.name,
            chapterId: chapter.id,
            chapterNumber: chapter.chapterNumber,
            komgaProgress: {
              completed: progress.completed,
              page: progress.page,
              readDate: progress.readDate
            },
            suwayomiBefore: {
              isRead: chapter.isRead,
              lastReadAt: chapter.lastReadAt
            }
          }, 'Sending reading progress from Komga to Suwayomi');

          await this.suwa.setChapterProgress(chapter.id, progress.page || 0, progress.completed);
          await this.repo.updateChapterMapLastPushedKomga(map.komgaBookId, new Date());

          logger.info({
            bookId: map.komgaBookId,
            chapterId: chapter.id,
            chapterNum: chapter.chapterNumber,
            bookTitle: book.metadata?.title || book.name,
            page: progress.page || 0,
            completed: progress.completed
          }, '✅ Successfully synced Komga progress to Suwayomi');
        } else {
          logger.debug({
            bookId: map.komgaBookId,
            chapterId: chapter.id,
            reason: !progress.completed && progress.page === 0 ? 'No progress in Komga' :
                    chapter.isRead && chapter.lastPageRead === progress.page ? 'Already synced' :
                    'Recently synced'
          }, 'Skipping sync - no action needed');
        }
      } catch (err) {
        logger.error({ err, map }, 'Error syncing Komga to Suwa');
      }
    }

    logger.info('Completed Komga to Suwayomi sync cycle');
  }

  private async syncSuwaToKomga() {
    const chapterMaps = await this.repo.getAllChapterMaps();
    logger.info({ totalMappings: chapterMaps.length }, 'Starting Suwayomi to Komga sync');

    for (const map of chapterMaps) {
      try {
        const chapters = await this.suwa.getChapters(map.suwaMangaId);
        // Find chapter by number/title matching instead of ID
        const chapter = chapters.find((c: any) => {
          // Try to match by chapter number first (most reliable)
          if (c.chapterNumber && map.chapter !== undefined) {
            return Math.abs(c.chapterNumber - map.chapter) < 0.001;
          }
          // Fallback to title matching if chapter numbers don't match
          if (c.name && map.chapter !== undefined) {
            return this.matcher.matchSeries(`Chapter ${map.chapter}`, c.name);
          }
          return false;
        });

        if (!chapter) {
          logger.warn({
            chapterId: map.suwaChapterId,
            mangaId: map.suwaMangaId,
            chapterNum: map.chapter,
            availableChapters: chapters.slice(0, 3).map((c: any) => ({ id: c.id, number: c.chapterNumber, name: c.name }))
          }, 'Matching chapter not found in Suwayomi');
          continue;
        }

        logger.debug({
          chapterId: chapter.id,
          chapterNumber: chapter.chapterNumber,
          chapterName: chapter.name,
          isRead: chapter.isRead,
          lastReadAt: chapter.lastReadAt
        }, 'Suwayomi chapter found for Komga sync');

        // Get the series mapping to find the Komga series ID
        const seriesMap = await this.repo.getSeriesMapBySuwa(map.suwaMangaId);
        if (!seriesMap) {
          logger.warn({ suwaMangaId: map.suwaMangaId }, 'No series mapping found');
          continue;
        }

        // Get the book data which includes read progress
        const books = await this.komga.getBooks(seriesMap.komgaSeriesId);
        const book = books.find((b: any) => b.id === map.komgaBookId);

        if (!book) {
          logger.warn({ bookId: map.komgaBookId }, 'Book not found in Komga');
          continue;
        }

        const progress = book.readProgress || { page: 0, completed: false, readDate: null };

        logger.debug({
          bookId: map.komgaBookId,
          bookTitle: book.metadata?.title || book.name,
          komgaProgress: {
            completed: progress.completed,
            page: progress.page,
            readDate: progress.readDate
          }
        }, 'Komga reading progress retrieved for Suwayomi sync');

        const shouldSync = (chapter.isRead || chapter.lastPageRead > 0) && (!progress.completed || progress.page !== chapter.lastPageRead ||
          !map.lastPushedSuwa || (progress.readDate && new Date(progress.readDate) < map.lastPushedSuwa));

        logger.info({
          chapterId: chapter.id,
          chapterNumber: chapter.chapterNumber,
          chapterTitle: chapter.name,
          bookId: map.komgaBookId,
          bookTitle: book.metadata?.title || book.name,
          suwayomiRead: chapter.isRead,
          komgaCompleted: progress.completed,
          lastPushedSuwa: map.lastPushedSuwa,
          shouldSync: shouldSync
        }, 'Sync decision for Suwayomi to Komga');

        if (shouldSync) {
          logger.info({
            action: 'SYNC_SUWA_TO_KOMGA',
            chapterId: chapter.id,
            chapterTitle: chapter.name,
            chapterNumber: chapter.chapterNumber,
            bookId: map.komgaBookId,
            bookTitle: book.metadata?.title || book.name,
            suwayomiState: {
              isRead: chapter.isRead,
              lastReadAt: chapter.lastReadAt
            },
            komgaBefore: {
              completed: progress.completed,
              page: progress.page,
              readDate: progress.readDate
            }
          }, 'Sending reading progress from Suwayomi to Komga');

          // When marking as completed, use the total page count instead of 0
          const totalPages = book.media?.pagesCount || chapter.pageCount || 0;
          const pageToSend = chapter.isRead ? totalPages : (chapter.lastPageRead || 0);

          await this.komga.patchReadProgress(map.komgaBookId, pageToSend, chapter.isRead);
          await this.repo.updateChapterMapLastPushedSuwa(chapter.id, new Date());

          logger.info({
            chapterId: chapter.id,
            bookId: map.komgaBookId,
            chapterNum: chapter.chapterNumber,
            chapterTitle: chapter.name,
            bookTitle: book.metadata?.title || book.name,
            pageSent: pageToSend,
            totalPages: totalPages,
            completed: chapter.isRead
          }, '✅ Successfully synced Suwayomi progress to Komga');
        } else {
          logger.debug({
            chapterId: chapter.id,
            bookId: map.komgaBookId,
            reason: !chapter.isRead && chapter.lastPageRead === 0 ? 'No progress in Suwayomi' :
                    progress.completed && progress.page === chapter.lastPageRead ? 'Already synced' :
                    'Recently synced'
          }, 'Skipping sync - no action needed');
        }
      } catch (err) {
        logger.error({ err, map }, 'Error syncing Suwa to Komga');
      }
    }

    logger.info('Completed Suwayomi to Komga sync cycle');
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
