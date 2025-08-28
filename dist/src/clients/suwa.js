"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuwaClient = void 0;
const graphql_request_1 = require("graphql-request");
const logger_1 = require("../utils/logger");
class SuwaClient {
    constructor(mappingRepo) {
        const headers = {};
        // Check for Bearer token first (existing method)
        if (process.env.SUWA_TOKEN) {
            headers['Authorization'] = `Bearer ${process.env.SUWA_TOKEN}`;
        }
        // Check for basic authentication (new method)
        else if (process.env.SUWA_USER && process.env.SUWA_PASS) {
            const credentials = Buffer.from(`${process.env.SUWA_USER}:${process.env.SUWA_PASS}`).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
        }
        this.client = new graphql_request_1.GraphQLClient(`${process.env.SUWA_BASE}/api/graphql`, { headers });
        this.mappingRepo = mappingRepo;
    }
    async getLibrary() {
        // Use the correct Suwayomi GraphQL query for library manga with pagination
        const query = (0, graphql_request_1.gql) `
      query GetMangasLibrary($condition: MangaConditionInput, $first: Int, $after: Cursor, $order: [MangaOrderInput!]) {
        mangas(condition: $condition, first: $first, after: $after, order: $order) {
          nodes {
            id
            title
            thumbnailUrl
            thumbnailUrlLastFetched
            inLibrary
            initialized
            sourceId
            unreadCount
            downloadCount
            bookmarkCount
            hasDuplicateChapters
            genre
            lastFetchedAt
            inLibraryAt
            status
            artist
            author
            description
            chapters {
              totalCount
            }
            firstUnreadChapter {
              id
              sourceOrder
              isRead
              mangaId
            }
            lastReadChapter {
              id
              sourceOrder
              lastReadAt
            }
            latestReadChapter {
              id
              sourceOrder
              lastReadAt
            }
            latestFetchedChapter {
              id
              fetchedAt
            }
            latestUploadedChapter {
              id
              uploadDate
            }
            meta {
              mangaId
              key
              value
            }
            source {
              id
              displayName
            }
            trackRecords {
              totalCount
              nodes {
                id
                trackerId
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
          totalCount
        }
      }
    `;
        const allManga = [];
        let after = null;
        const first = 100; // Suwayomi's default page size limit
        try {
            while (true) {
                const variables = {
                    condition: { inLibrary: true },
                    first,
                    after,
                    order: [{ by: 'TITLE', byType: 'ASC' }]
                };
                const data = await this.client.request(query, variables);
                if (data.mangas.nodes && data.mangas.nodes.length > 0) {
                    allManga.push(...data.mangas.nodes);
                    logger_1.logger.info({
                        page: Math.floor(allManga.length / first) + 1,
                        count: data.mangas.nodes.length,
                        total: allManga.length,
                        hasNextPage: data.mangas.pageInfo.hasNextPage
                    }, 'Fetched Suwayomi manga page');
                }
                // Check if there are more pages
                if (!data.mangas.pageInfo.hasNextPage || data.mangas.nodes.length === 0) {
                    break; // No more pages
                }
                after = data.mangas.pageInfo.endCursor;
            }
            logger_1.logger.info({ total: allManga.length }, 'Fetched all Suwayomi manga');
            // Log event
            if (this.mappingRepo) {
                await this.mappingRepo.logAppEvent({
                    app: 'suwayomi',
                    eventType: 'library_sync',
                    details: `Successfully fetched ${allManga.length} manga from Suwayomi library`
                });
            }
            return allManga;
        }
        catch (error) {
            logger_1.logger.error(error, 'Failed to fetch Suwayomi manga');
            // Log error event
            if (this.mappingRepo) {
                await this.mappingRepo.logAppEvent({
                    app: 'suwayomi',
                    eventType: 'error',
                    details: `Failed to fetch library: ${error.message}`
                });
            }
            throw error;
        }
    }
    async getChapters(mangaId) {
        const query = (0, graphql_request_1.gql) `
      query GetMangaChapters($id: Int!) {
        manga(id: $id) {
          chapters {
            nodes {
              id
              chapterNumber
              name
              isRead
              isDownloaded
              isBookmarked
              lastPageRead
              lastReadAt
              pageCount
              scanlator
              sourceOrder
              uploadDate
              url
              fetchedAt
              realUrl
            }
          }
        }
      }
    `;
        const data = await this.client.request(query, {
            id: parseInt(mangaId)
        });
        return data.manga.chapters.nodes || [];
    }
    async setChapterRead(chapterId, read) {
        if (process.env.SYNC_DRY_RUN === 'true') {
            logger_1.logger.info({ chapterId, read }, 'DRY RUN: Would set Suwayomi chapter read');
            return;
        }
        try {
            const mutation = (0, graphql_request_1.gql) `
        mutation UpdateChapter($input: UpdateChapterInput!) {
          updateChapter(input: $input) {
            chapter {
              id
              isRead
            }
          }
        }
      `;
            const variables = {
                input: {
                    id: parseInt(chapterId),
                    patch: {
                        isRead: read
                    }
                }
            };
            await this.client.request(mutation, variables);
            // Log successful chapter read update
            if (this.mappingRepo) {
                await this.mappingRepo.logAppEvent({
                    app: 'suwayomi',
                    eventType: 'chapter_read_update',
                    chapterTitle: `Chapter ${chapterId}`,
                    details: `Set chapter read status to: ${read}`
                });
            }
        }
        catch (error) {
            logger_1.logger.error({ chapterId, read, error: error.message }, 'Failed to set Suwayomi chapter read');
            // Log error event
            if (this.mappingRepo) {
                await this.mappingRepo.logAppEvent({
                    app: 'suwayomi',
                    eventType: 'error',
                    chapterTitle: `Chapter ${chapterId}`,
                    details: `Failed to update chapter read status: ${error.message}`
                });
            }
            throw error;
        }
    }
    async setChapterProgress(chapterId, page, completed = false) {
        if (process.env.SYNC_DRY_RUN === 'true') {
            logger_1.logger.info({ chapterId, page, completed }, 'DRY RUN: Would set Suwayomi chapter progress');
            return;
        }
        try {
            const mutation = (0, graphql_request_1.gql) `
        mutation UpdateChapter($input: UpdateChapterInput!) {
          updateChapter(input: $input) {
            chapter {
              id
              isRead
              lastPageRead
            }
          }
        }
      `;
            const variables = {
                input: {
                    id: parseInt(chapterId),
                    patch: {
                        isRead: completed,
                        lastPageRead: page
                    }
                }
            };
            await this.client.request(mutation, variables);
            // Log successful chapter progress update
            if (this.mappingRepo) {
                await this.mappingRepo.logAppEvent({
                    app: 'suwayomi',
                    eventType: 'chapter_progress_update',
                    chapterTitle: `Chapter ${chapterId}`,
                    details: `Updated progress: page ${page}, completed: ${completed}`
                });
            }
        }
        catch (error) {
            logger_1.logger.error({ chapterId, page, completed, error: error.message }, 'Failed to set Suwayomi chapter progress');
            // Log error event
            if (this.mappingRepo) {
                await this.mappingRepo.logAppEvent({
                    app: 'suwayomi',
                    eventType: 'error',
                    chapterTitle: `Chapter ${chapterId}`,
                    details: `Failed to update chapter progress: ${error.message}`
                });
            }
            throw error;
        }
    }
    async getSchemaInfo() {
        // Try to get schema information
        const introspectionQuery = (0, graphql_request_1.gql) `
      query {
        __schema {
          queryType {
            name
            fields {
              name
            }
          }
        }
      }
    `;
        try {
            const data = await this.client.request(introspectionQuery);
            logger_1.logger.info({ schema: data.__schema }, 'Suwayomi GraphQL schema retrieved');
            return data.__schema;
        }
        catch (error) {
            logger_1.logger.error({ error: error.message }, 'Failed to get GraphQL schema');
            throw error;
        }
    }
}
exports.SuwaClient = SuwaClient;
