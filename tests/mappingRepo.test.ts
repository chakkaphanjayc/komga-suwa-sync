import { MappingRepository } from '../src/core/mappingRepo';

describe('MappingRepository', () => {
  let repo: MappingRepository;

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    repo = new MappingRepository();
    // Wait for DB initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  test('insert and get series map', async () => {
    await repo.insertSeriesMap({
      komgaSeriesId: 'k1',
      suwaMangaId: 's1',
      titleNorm: 'one piece'
    });
    const map = await repo.getSeriesMap('k1');
    expect(map?.suwaMangaId).toBe('s1');
  });
});
