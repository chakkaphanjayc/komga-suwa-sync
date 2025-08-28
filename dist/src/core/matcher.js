"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Matcher = void 0;
const fastest_levenshtein_1 = require("fastest-levenshtein");
const normalize_1 = require("../utils/normalize");
class Matcher {
    constructor() {
        this.fuzzyThreshold = parseFloat(process.env.FUZZY_THRESHOLD || '0.80');
    }
    matchSeries(komgaTitle, suwaTitle) {
        const normKomga = (0, normalize_1.normalizeTitle)(komgaTitle);
        const normSuwa = (0, normalize_1.normalizeTitle)(suwaTitle);
        if (normKomga === normSuwa)
            return true;
        const dist = (0, fastest_levenshtein_1.distance)(normKomga, normSuwa);
        const maxLen = Math.max(normKomga.length, normSuwa.length);
        const similarity = 1 - dist / maxLen;
        return similarity >= this.fuzzyThreshold;
    }
    matchChapter(komgaBook, suwaChapter) {
        // Extract chapter numbers from both sources
        const komgaChapter = this.extractChapterNumber(komgaBook);
        const suwaChapterNum = suwaChapter.chapterNumber;
        // PRIORITY 1: Exact number match (highest priority)
        if (Math.abs(komgaChapter - suwaChapterNum) < 0.001) {
            console.log(`Chapter MATCH by NUMBER: Book ${komgaChapter} ↔ Chapter ${suwaChapterNum}`);
            return true;
        }
        // PRIORITY 2: Close number match (within 0.1 tolerance for decimal chapters)
        if (Math.abs(komgaChapter - suwaChapterNum) < 0.1) {
            console.log(`Chapter MATCH by CLOSE NUMBER: Book ${komgaChapter} ≈ Chapter ${suwaChapterNum}`);
            return true;
        }
        // PRIORITY 3: Try to match by title/name similarity if numbers don't match
        const komgaTitle = this.extractChapterTitle(komgaBook);
        const suwaTitle = suwaChapter.name || `Chapter ${suwaChapterNum}`;
        if (komgaTitle && suwaTitle) {
            const similarity = this.calculateTitleSimilarity(komgaTitle, suwaTitle);
            if (similarity >= 0.8) { // High similarity threshold for title matching
                console.log(`Chapter MATCH by TITLE: "${komgaTitle}" ≈ "${suwaTitle}" (${similarity.toFixed(2)})`);
                return true;
            }
        }
        // Log when no match is found
        console.log(`Chapter NO MATCH: Book ${komgaChapter} "${komgaTitle}" vs Chapter ${suwaChapterNum} "${suwaTitle}"`);
        return false;
    }
    extractChapterNumber(komgaBook) {
        // Try multiple ways to extract chapter number
        // 1. From metadata.number
        if (komgaBook.metadata && komgaBook.metadata.number) {
            const num = parseFloat(komgaBook.metadata.number);
            if (!isNaN(num))
                return num;
        }
        // 2. From metadata.title (e.g., "Ch.33", "Chapter 33", "Vol.1 Ch.5")
        if (komgaBook.metadata && komgaBook.metadata.title) {
            const title = komgaBook.metadata.title;
            // Match patterns like "Ch.33", "Chapter 33", "Chap 33", "#33"
            const patterns = [
                /ch\.?\s*(\d+(?:\.\d+)?)/i,
                /chapter\s+(\d+(?:\.\d+)?)/i,
                /chap\s+(\d+(?:\.\d+)?)/i,
                /#\s*(\d+(?:\.\d+)?)/i,
                /vol\.?\s*\d+\s*ch\.?\s*(\d+(?:\.\d+)?)/i, // "Vol.1 Ch.5"
                /(\d+(?:\.\d+)?)/ // Just a number at the end
            ];
            for (const pattern of patterns) {
                const match = title.match(pattern);
                if (match) {
                    const num = parseFloat(match[1]);
                    if (!isNaN(num))
                        return num;
                }
            }
        }
        // 3. From book.name as fallback
        if (komgaBook.name) {
            const patterns = [
                /ch\.?\s*(\d+(?:\.\d+)?)/i,
                /chapter\s+(\d+(?:\.\d+)?)/i,
                /(\d+(?:\.\d+)?)/
            ];
            for (const pattern of patterns) {
                const match = komgaBook.name.match(pattern);
                if (match) {
                    const num = parseFloat(match[1]);
                    if (!isNaN(num))
                        return num;
                }
            }
        }
        // Default to 0 if no chapter number found
        return 0;
    }
    extractChapterTitle(komgaBook) {
        if (komgaBook.metadata && komgaBook.metadata.title) {
            return komgaBook.metadata.title;
        }
        return komgaBook.name || null;
    }
    calculateTitleSimilarity(title1, title2) {
        const norm1 = (0, normalize_1.normalizeTitle)(title1);
        const norm2 = (0, normalize_1.normalizeTitle)(title2);
        if (norm1 === norm2)
            return 1.0;
        const dist = (0, fastest_levenshtein_1.distance)(norm1, norm2);
        const maxLen = Math.max(norm1.length, norm2.length);
        return 1 - dist / maxLen;
    }
}
exports.Matcher = Matcher;
