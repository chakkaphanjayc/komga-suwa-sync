"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KomgaClient = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
class KomgaClient {
    constructor(mappingRepo) {
        this.client = axios_1.default.create({
            baseURL: process.env.KOMGA_BASE,
            auth: {
                username: process.env.KOMGA_USER,
                password: process.env.KOMGA_PASS
            },
            timeout: 15000
        });
        this.mappingRepo = mappingRepo;
    }
    async getSeries() {
        const allSeries = [];
        let page = 0;
        const size = 500; // Komga's default page size limit
        try {
            while (true) {
                const response = await this.client.get(`/api/v1/series?page=${page}&size=${size}`);
                const data = response.data;
                if (data.content && data.content.length > 0) {
                    allSeries.push(...data.content);
                    logger_1.logger.info({ page, count: data.content.length, total: allSeries.length }, 'Fetched Komga series page');
                }
                // Check if there are more pages
                if (data.last === true || data.content.length === 0 || data.content.length < size) {
                    break; // No more pages or last page reached
                }
                page++;
            }
            logger_1.logger.info({ total: allSeries.length }, 'Fetched all Komga series');
            // Log event
            if (this.mappingRepo) {
                await this.mappingRepo.logAppEvent({
                    app: 'komga',
                    eventType: 'library_sync',
                    details: `Successfully fetched ${allSeries.length} series from Komga library`
                });
            }
            return allSeries;
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to fetch Komga series');
            // Log error event
            if (this.mappingRepo) {
                await this.mappingRepo.logAppEvent({
                    app: 'komga',
                    eventType: 'error',
                    details: `Failed to fetch series: ${error.message}`
                });
            }
            throw error;
        }
    }
    async getBooks(seriesId) {
        const allBooks = [];
        let page = 0;
        const size = 1000; // Komga's default page size for books
        while (true) {
            const response = await this.client.get(`/api/v1/series/${seriesId}/books?page=${page}&size=${size}&include=readProgress`);
            const data = response.data;
            if (data.content && data.content.length > 0) {
                // Books already include read progress data when using include parameter
                allBooks.push(...data.content);
            }
            // Check if there are more pages
            if (data.last === true || data.content.length === 0 || data.content.length < size) {
                break; // No more pages or last page reached
            }
            page++;
        }
        return allBooks;
    }
    async getReadProgress(bookId) {
        try {
            // Try GET method first (standard Komga API)
            const response = await this.client.get(`/api/v1/books/${bookId}/read-progress`);
            return response.data;
        }
        catch (error) {
            if (error.response?.status === 404) {
                // If read progress doesn't exist, return default
                logger_1.logger.info({ bookId }, 'No read progress found for book, using default');
                return {
                    page: 0,
                    completed: false,
                    readDate: null
                };
            }
            else if (error.response?.status === 400) {
                // Bad request - try alternative endpoint
                try {
                    const response = await this.client.get(`/api/v1/books/${bookId}`);
                    return response.data.readProgress || {
                        page: 0,
                        completed: false,
                        readDate: null
                    };
                }
                catch (altError) {
                    logger_1.logger.warn({ bookId, error: altError.message }, 'Alternative read progress method failed, using default');
                    return {
                        page: 0,
                        completed: false,
                        readDate: null
                    };
                }
            }
            else {
                // For other errors, return default progress
                logger_1.logger.warn({ bookId, error: error.message }, 'Read progress request failed, using default');
                return {
                    page: 0,
                    completed: false,
                    readDate: null
                };
            }
        }
    }
    async patchReadProgress(bookId, page, completed) {
        if (process.env.SYNC_DRY_RUN === 'true') {
            logger_1.logger.info({ bookId, page, completed }, 'DRY RUN: Would patch Komga read progress');
            return;
        }
        try {
            await this.client.patch(`/api/v1/books/${bookId}/read-progress`, { page, completed });
            // Log successful read progress update
            if (this.mappingRepo) {
                await this.mappingRepo.logAppEvent({
                    app: 'komga',
                    eventType: 'read_progress_update',
                    mangaTitle: `Book ${bookId}`,
                    details: `Updated read progress: page ${page}, completed: ${completed}`
                });
            }
        }
        catch (error) {
            logger_1.logger.error({ bookId, page, completed, error: error.message }, 'Failed to patch Komga read progress');
            // Log error event
            if (this.mappingRepo) {
                await this.mappingRepo.logAppEvent({
                    app: 'komga',
                    eventType: 'error',
                    mangaTitle: `Book ${bookId}`,
                    details: `Failed to update read progress: ${error.message}`
                });
            }
            throw error;
        }
    }
}
exports.KomgaClient = KomgaClient;
