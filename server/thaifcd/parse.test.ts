import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseDetail,
  parseSearch,
  parseValue,
  rankHits,
  searchTerm,
  ThaiFcdParseError,
} from './parse';

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

describe('parseSearch', () => {
  it('reads the BOM-prefixed JSON list', () => {
    const hits = parseSearch(fixture('search-rice.json'));
    expect(hits.length).toBe(6);
    expect(hits).toContainEqual({
      id: '1554',
      name: 'Fried rice with pork, vegetable and egg',
      dbcode: 'STD',
    });
  });
  it('collapses double spaces in names', () => {
    expect(parseSearch(fixture('search-rice.json')).map((h) => h.name)).toContain(
      'Khao-mun (Rice cooked in chicken broth)',
    );
  });
  it('treats an empty body as no results and garbage as a parse error', () => {
    expect(parseSearch('\uFEFF[]')).toEqual([]);
    expect(parseSearch('')).toEqual([]);
    expect(() => parseSearch('<html>maintenance</html>')).toThrow(ThaiFcdParseError);
  });
});

describe('searchTerm + rankHits', () => {
  it('sends the longest word, ranks by matched words then length', () => {
    expect(searchTerm('rice, cooked')).toBe('cooked');
    expect(searchTerm('fried rice pork')).toBe('fried');
    expect(searchTerm('ข้าวผัด')).toBeNull();
    const hits = parseSearch(fixture('search-rice.json'));
    expect(rankHits(hits, 'fried rice pork').map((h) => h.id)[0]).toBe('1554');
    // Both words match; the shorter (more generic) name wins.
    expect(
      rankHits(hits, 'fried rice')
        .slice(0, 2)
        .map((h) => h.name),
    ).toEqual(['Fried rice, not specified', 'Fried rice, with vegetables']);
  });
  it('drops hits that match none of the words', () => {
    expect(rankHits([{ id: '1', name: 'Oil, corn', dbcode: 'STD' }], 'rice')).toEqual([]);
  });
});

describe('parseValue', () => {
  it.each([
    ['5.75', 5.75],
    ['1,234.5', 1234.5],
    ['-', null],
    ['NA', null],
    ['N/A', null],
    ['ND', 0],
    ['Tr', 0],
    ['trace', 0],
    ['', null],
  ])('%s → %s', (raw, out) => expect(parseValue(raw)).toBe(out));
});

describe('parseDetail', () => {
  it('reads a ready-to-eat dish (group T)', () => {
    expect(parseDetail(fixture('detail-T56-fried-rice.html'))).toEqual({
      foodCode: 'T56',
      group: 'T',
      nameTh: 'ข้าวผัดหมู',
      nameEn: 'Fried rice with pork, vegetable and egg',
      kcal: 144, // "Energy, by calculation" is "-", so the total-energy row is used
      proteinG: 5.75,
      carbG: 15.9,
      fatG: 6.34,
      fiberG: null,
      sodiumMg: 141,
      isDish: true,
      convertedFromMl: false,
    });
  });

  it('rebuilds total carbohydrate from available + fibre', () => {
    const basil = parseDetail(fixture('detail-N3-holy-basil.html'));
    expect(basil).toMatchObject({
      foodCode: 'N3',
      group: 'N',
      nameTh: 'กระเพรา, ใบ',
      kcal: 41,
      isDish: false,
    });
    expect(basil.carbG).toBeCloseTo(4.04 + 4.1);
    expect(basil.fiberG).toBe(4.1);
  });

  it('converts per-100 mL items to per 100 g with the density', () => {
    const oil = parseDetail(fixture('detail-K19-corn-oil-per-100ml.html'));
    expect(oil.convertedFromMl).toBe(true);
    expect(oil.kcal).toBeCloseTo(833 / 0.924);
    expect(oil.fatG).toBeCloseTo(92.6 / 0.924);
    expect(oil.sodiumMg).toBeNull();
  });

  it('fails readably when the markup changes', () => {
    expect(() => parseDetail('<p>new design</p>')).toThrow(/Food Code/);
    const noEnergy = fixture('detail-N3-holy-basil.html').replace(
      /Energy, by calculation/,
      'Something else',
    );
    expect(() => parseDetail(noEnergy)).toThrow(/no energy/);
  });
});
