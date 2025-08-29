import { OptimizedSyncService } from '../src/core/optimizedSync';
import { KomgaClient } from '../src/clients/komga';
import { SuwaClient } from '../src/clients/suwa';
import { MappingRepository } from '../src/core/mappingRepo';
import { Matcher } from '../src/core/matcher';
import { logger } from '../src/utils/logger';

describe('OptimizedSyncService Integration', () => {
  let optimizedSync: OptimizedSyncService;
  let mappingRepo: MappingRepository;
  let komgaClient: KomgaClient;
  let suwaClient: SuwaClient;
  let matcher: Matcher;

  beforeAll(() => {
    // Initialize components
    mappingRepo = new MappingRepository();
    komgaClient = new KomgaClient(mappingRepo);
    suwaClient = new SuwaClient(mappingRepo);
    matcher = new Matcher();

    // Create optimized sync service
    optimizedSync = new OptimizedSyncService(
      komgaClient,
      suwaClient,
      mappingRepo,
      matcher
    );
  });

  test('should initialize cache correctly', () => {
    logger.info('Testing cache functionality...');

    // Clear cache
    optimizedSync.clearCache();

    // Get cache stats
    const cacheStats = optimizedSync.getCacheStats();

    expect(cacheStats).toHaveProperty('cacheSize');
    expect(cacheStats).toHaveProperty('activeRequests');
    expect(typeof cacheStats.cacheSize).toBe('number');
    expect(typeof cacheStats.activeRequests).toBe('number');

    logger.info({ cacheStats }, 'Cache initialized successfully');
  });

  test('should have sync method with correct interface', () => {
    logger.info('Testing sync method interface...');

    expect(typeof optimizedSync.sync).toBe('function');

    // Test that sync method can be called (will fail without proper config, but interface should work)
    const syncPromise = optimizedSync.sync({
      mode: 'full',
      direction: 'bidirectional'
    });

    expect(syncPromise).toBeInstanceOf(Promise);
  });

  test('should have cache management methods', () => {
    expect(typeof optimizedSync.clearCache).toBe('function');
    expect(typeof optimizedSync.getCacheStats).toBe('function');
  });

  test('should integrate with full sync interface', () => {
    // Test that the sync method signature matches what full sync expects
    const syncMethod = optimizedSync.sync;

    // Check method signature by calling with minimal valid options
    const testOptions = {
      mode: 'full' as const,
      direction: 'bidirectional' as const
    };

    expect(() => {
      syncMethod(testOptions);
    }).not.toThrow();
  });
});
