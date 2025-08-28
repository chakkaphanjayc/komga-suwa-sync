import { distance } from 'fastest-levenshtein';
import { normalizeTitle } from '../utils/normalize';

export class Matcher {
  private fuzzyThreshold: number;

  constructor() {
    this.fuzzyThreshold = parseFloat(process.env.FUZZY_THRESHOLD || '0.80');
  }

  matchSeries(komgaTitle: string, suwaTitle: string): boolean {
    const normKomga = normalizeTitle(komgaTitle);
    const normSuwa = normalizeTitle(suwaTitle);
    if (normKomga === normSuwa) return true;
    const dist = distance(normKomga, normSuwa);
    const maxLen = Math.max(normKomga.length, normSuwa.length);
    const similarity = 1 - dist / maxLen;
    return similarity >= this.fuzzyThreshold;
  }

  matchChapter(komgaBook: any, suwaChapter: any): boolean {
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

  private extractChapterNumber(komgaBook: any): number {
    // Try multiple ways to extract chapter number

    // 1. From metadata.number
    if (komgaBook.metadata && komgaBook.metadata.number) {
      const num = parseFloat(komgaBook.metadata.number);
      if (!isNaN(num)) return num;
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
          if (!isNaN(num)) return num;
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
          if (!isNaN(num)) return num;
        }
      }
    }

    // Default to 0 if no chapter number found
    return 0;
  }

  private extractChapterTitle(komgaBook: any): string | null {
    if (komgaBook.metadata && komgaBook.metadata.title) {
      return komgaBook.metadata.title;
    }
    return komgaBook.name || null;
  }

  private calculateTitleSimilarity(title1: string, title2: string): number {
    const norm1 = normalizeTitle(title1);
    const norm2 = normalizeTitle(title2);

    if (norm1 === norm2) return 1.0;

    const dist = distance(norm1, norm2);
    const maxLen = Math.max(norm1.length, norm2.length);
    return 1 - dist / maxLen;
  }
}
