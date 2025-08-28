"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mappingRepo_1 = require("../src/core/mappingRepo");
describe('MappingRepository', () => {
    let repo;
    beforeEach(async () => {
        process.env.DB_PATH = ':memory:';
        repo = new mappingRepo_1.MappingRepository();
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
