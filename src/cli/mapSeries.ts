import { MappingRepository } from '../core/mappingRepo';
import { normalizeTitle } from '../utils/normalize';

const repo = new MappingRepository();

const [komgaId, suwaId, title] = process.argv.slice(2);

if (!komgaId || !suwaId || !title) {
  console.log('Usage: npm run map:series <komgaSeriesId> <suwaMangaId> <title>');
  process.exit(1);
}

repo.insertSeriesMap({
  komgaSeriesId: komgaId,
  suwaMangaId: suwaId,
  titleNorm: normalizeTitle(title)
});

console.log('Mapped series');
