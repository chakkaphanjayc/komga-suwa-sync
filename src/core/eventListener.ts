import { KomgaClient } from '../clients/komga';
import { SuwaClient } from '../clients/suwa';
import { MappingRepository } from './mappingRepo';
import { EnhancedSyncService } from './enhancedSync';
import { logger } from '../utils/logger';

export interface EventListenerOptions {
  komgaClient: KomgaClient;
  suwaClient: SuwaClient;
  mappingRepo: MappingRepository;
  enhancedSyncService: EnhancedSyncService;
  eventCheckInterval?: number; // How often to check for events (default: 10 seconds)
  recentWindowHours?: number; // How far back to look for events (default: 1 hour)
}

export class EventListener {
  private komgaClient: KomgaClient;
  private suwaClient: SuwaClient;
  private mappingRepo: MappingRepository;
  private enhancedSyncService: EnhancedSyncService;
  private eventCheckInterval: number;
  private recentWindowHours: number;
  private intervalId: NodeJS.Timeout | null = null;
  private lastKomgaCheck: Date = new Date(0);
  private lastSuwaCheck: Date = new Date(0);
  private isRunning: boolean = false;

  constructor(options: EventListenerOptions) {
    this.komgaClient = options.komgaClient;
    this.suwaClient = options.suwaClient;
    this.mappingRepo = options.mappingRepo;
    this.enhancedSyncService = options.enhancedSyncService;
    this.eventCheckInterval = options.eventCheckInterval || 10000; // 10 seconds
    this.recentWindowHours = options.recentWindowHours || 1; // 1 hour
  }

  start() {
    if (this.isRunning) {
      logger.warn('Event listener is already running');
      return;
    }

    logger.info({ interval: this.eventCheckInterval }, 'Starting event listener');
    this.isRunning = true;

    // Start the event checking loop
    this.intervalId = setInterval(() => {
      this.checkForEvents();
    }, this.eventCheckInterval);

    // Do an initial check
    setTimeout(() => {
      this.checkForEvents();
    }, 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Event listener stopped');
  }

  private async checkForEvents() {
    try {
      await Promise.all([
        this.checkKomgaEvents(),
        this.checkSuwaEvents()
      ]);
    } catch (error) {
      logger.error(error, 'Error checking for events');
    }
  }

  private async checkKomgaEvents() {
    try {
      // Get recently read chapters from Komga
      const cutoffDate = new Date(Date.now() - this.recentWindowHours * 60 * 60 * 1000);

      // Get all series and check their books for recent read progress
      const series = await this.komgaClient.getSeries();
      let newReadEvents = 0;

      for (const serie of series) {
        try {
          const books = await this.komgaClient.getBooks(serie.id);

          for (const book of books) {
            if (book.readProgress && (book.readProgress.completed || book.readProgress.page > 0)) {
              const readDate = new Date(book.readProgress.readDate || Date.now());

              // Only process if this is a new read event since our last check
              if (readDate > this.lastKomgaCheck && readDate >= cutoffDate) {
                // Check if we have a mapping for this book
                const chapterMap = await this.mappingRepo.getChapterMap(book.id);

                if (chapterMap) {
                  // Update the last read timestamp
                  await this.mappingRepo.updateChapterMapLastReadKomga(book.id, readDate);

                  // Log the event
                  await this.mappingRepo.logAppEvent({
                    app: 'komga',
                    eventType: 'read_progress',
                    mangaTitle: serie.metadata?.title || serie.name || 'Unknown',
                    chapterTitle: book.metadata?.title || book.name || 'Unknown Chapter',
                    details: JSON.stringify({
                      bookId: book.id,
                      page: book.readProgress.page,
                      completed: book.readProgress.completed,
                      readDate: book.readProgress.readDate
                    })
                  });

                  newReadEvents++;

                  logger.debug({
                    manga: serie.metadata?.title || serie.name,
                    chapter: book.metadata?.title || book.name,
                    page: book.readProgress.page,
                    completed: book.readProgress.completed
                  }, 'Detected Komga read event');
                }
              }
            }
          }
        } catch (error) {
          logger.debug({ error: error instanceof Error ? error.message : String(error), seriesId: serie.id }, 'Error checking Komga series for events');
        }
      }

      if (newReadEvents > 0) {
        logger.info({ count: newReadEvents }, 'Detected new Komga read events, triggering event-based sync');

        // Trigger event-based sync for recently read chapters
        try {
          await this.enhancedSyncService.sync({
            mode: 'event-based',
            maxHoursForRecent: this.recentWindowHours,
            direction: (process.env.SYNC_DIRECTION as any) || 'bidirectional'
          });
        } catch (syncError) {
          logger.error(syncError, 'Event-based sync failed after Komga events');
        }
      }

      this.lastKomgaCheck = new Date();

    } catch (error) {
      logger.error(error, 'Error checking Komga events');
    }
  }

  private async checkSuwaEvents() {
    try {
      // Get recently read chapters from Suwayomi
      const cutoffDate = new Date(Date.now() - this.recentWindowHours * 60 * 60 * 1000);

      // Get all manga and check their chapters for recent read progress
      const mangaList = await this.suwaClient.getLibrary();
      let newReadEvents = 0;

      for (const manga of mangaList) {
        try {
          const chapters = await this.suwaClient.getChapters(manga.id);

          for (const chapter of chapters) {
            if (chapter.isRead || chapter.lastPageRead > 0) {
              const lastReadDate = chapter.lastReadAt ? new Date(chapter.lastReadAt) : new Date();

              // Only process if this is a read event since our last check
              if (lastReadDate > this.lastSuwaCheck && lastReadDate >= cutoffDate) {
                // Check if we have a mapping for this chapter
                const chapterMap = await this.mappingRepo.getChapterMapBySuwa(chapter.id);

                if (chapterMap) {
                  // Update the last read timestamp
                  await this.mappingRepo.updateChapterMapLastReadSuwa(chapter.id, lastReadDate);

                  // Log the event
                  await this.mappingRepo.logAppEvent({
                    app: 'suwayomi',
                    eventType: 'read_progress',
                    mangaTitle: manga.title,
                    chapterTitle: chapter.name || `Chapter ${chapter.chapterNumber}`,
                    details: JSON.stringify({
                      chapterId: chapter.id,
                      chapterNumber: chapter.chapterNumber,
                      isRead: chapter.isRead,
                      lastPageRead: chapter.lastPageRead,
                      lastReadAt: chapter.lastReadAt
                    })
                  });

                  newReadEvents++;

                  logger.debug({
                    manga: manga.title,
                    chapter: chapter.name || `Chapter ${chapter.chapterNumber}`,
                    isRead: chapter.isRead,
                    lastPageRead: chapter.lastPageRead
                  }, 'Detected Suwayomi read event');
                }
              }
            }
          }
        } catch (error) {
          logger.debug({ error: error instanceof Error ? error.message : String(error), mangaId: manga.id }, 'Error checking Suwayomi manga for events');
        }
      }

      if (newReadEvents > 0) {
        logger.info({ count: newReadEvents }, 'Detected new Suwayomi read events, triggering event-based sync');

        // Trigger event-based sync for recently read chapters
        try {
          await this.enhancedSyncService.sync({
            mode: 'event-based',
            maxHoursForRecent: this.recentWindowHours,
            direction: (process.env.SYNC_DIRECTION as any) || 'bidirectional'
          });
        } catch (syncError) {
          logger.error(syncError, 'Event-based sync failed after Suwayomi events');
        }
      }

      this.lastSuwaCheck = new Date();

    } catch (error) {
      logger.error(error, 'Error checking Suwayomi events');
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      eventCheckInterval: this.eventCheckInterval,
      recentWindowHours: this.recentWindowHours,
      lastKomgaCheck: this.lastKomgaCheck.toISOString(),
      lastSuwaCheck: this.lastSuwaCheck.toISOString()
    };
  }
}
