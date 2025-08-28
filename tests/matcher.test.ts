import { Matcher } from '../src/core/matcher';

describe('Matcher', () => {
  const matcher = new Matcher();

  test('exact match', () => {
    expect(matcher.matchSeries('One Piece', 'One Piece')).toBe(true);
  });

  test('fuzzy match', () => {
    expect(matcher.matchSeries('One Piece', 'One-Piece')).toBe(true);
  });

  test('no match', () => {
    expect(matcher.matchSeries('One Piece', 'Naruto')).toBe(false);
  });

  test('chapter match', () => {
    const komgaBook = { metadata: { number: 1.0, title: 'Chapter 1' } };
    const suwaChapter = { chapterNumber: 1.0, name: 'Chapter 1' };
    
    expect(matcher.matchChapter(komgaBook, suwaChapter)).toBe(true);
    
    const suwaChapterDifferent = { chapterNumber: 2.0, name: 'Special Episode' };
    expect(matcher.matchChapter(komgaBook, suwaChapterDifferent)).toBe(false);
  });
});
