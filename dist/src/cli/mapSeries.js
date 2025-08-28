"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mappingRepo_1 = require("../core/mappingRepo");
const normalize_1 = require("../utils/normalize");
const repo = new mappingRepo_1.MappingRepository();
const [komgaId, suwaId, title] = process.argv.slice(2);
if (!komgaId || !suwaId || !title) {
    console.log('Usage: npm run map:series <komgaSeriesId> <suwaMangaId> <title>');
    process.exit(1);
}
repo.insertSeriesMap({
    komgaSeriesId: komgaId,
    suwaMangaId: suwaId,
    titleNorm: (0, normalize_1.normalizeTitle)(title)
});
console.log('Mapped series');
