import { MappingRepository } from '../core/mappingRepo';

const repo = new MappingRepository();

const [komgaId, suwaId, suwaMangaId, chapter, volume] = process.argv.slice(2);

if (!komgaId || !suwaId || !suwaMangaId || !chapter) {
  console.log('Usage: npm run map:book <komgaBookId> <suwaChapterId> <suwaMangaId> <chapter> [volume]');
  process.exit(1);
}

repo.insertChapterMap({
  komgaBookId: komgaId,
  suwaChapterId: suwaId,
  suwaMangaId,
  chapter: parseFloat(chapter),
  volume: volume ? parseFloat(volume) : undefined
});

console.log('Mapped book');
