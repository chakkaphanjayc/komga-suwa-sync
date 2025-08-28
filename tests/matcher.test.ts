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
    expect(matcher.matchChapter(1.0, 1.0)).toBe(true);
    expect(matcher.matchChapter(1.0, 1.002)).toBe(false);
  });
});
