import { beforeAll, describe, expect, it } from 'vitest';
import { ingredient } from '@/db/schema';
import { readUsda } from '@/scripts/usda/read';
import { prefixTsQuery, searchIngredients } from './ingredients';
import { createTestDb, repoPath } from './test-db';

/** Real migrations + USDA fixtures in an in-process Postgres. */
async function setup() {
  const db = await createTestDb();
  const { rows } = await readUsda(repoPath('scripts/usda/__fixtures__'));
  const extra = [
    ['1001', 'Rice, white, long-grain, regular, raw, enriched', 365],
    ['1002', 'Rice, white, glutinous, cooked', 97],
    ['1003', 'Rice, white, short-grain, enriched, cooked', 130],
    ['1004', 'Rice noodles, cooked', 108],
    ['1005', 'Snacks, rice cakes, brown rice, plain', 387],
    ['1006', 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', 165],
    ['1007', 'Beverages, coffee, brewed, prepared with tap water', 1],
  ] as const;
  await db.insert(ingredient).values([
    ...rows,
    ...extra.map(([id, nameEn, kcal]) => ({
      source: 'usda' as const,
      sourceId: id,
      nameEn,
      kcal,
      proteinG: 0,
      carbG: 0,
      fatG: 0,
    })),
    {
      source: 'thaifcd' as const,
      sourceId: 'T001',
      nameEn: 'Rice, cooked',
      nameTh: 'ข้าวสวย',
      kcal: 129,
      proteinG: 2.4,
      carbG: 28.6,
      fatG: 0.2,
      useCount: 5,
    },
  ]);
  return db;
}

describe('prefixTsQuery', () => {
  it('ANDs words and prefix-matches the last one', () => {
    expect(prefixTsQuery('Rice, white  cook')).toBe('rice & white & cook:*');
  });
  it('is null for Thai-only input', () => {
    expect(prefixTsQuery('ข้าวสวย')).toBeNull();
  });
});

describe('searchIngredients (PGlite)', () => {
  let db: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    db = await setup();
  }, 30_000);

  const names = async (q: string, limit?: number) =>
    (await searchIngredients(db, q, limit)).map((h) => h.nameEn);

  it('"rice white cooked" ranks cooked white rice first, raw rice below', async () => {
    const hits = await names('rice white cooked');
    expect(hits.slice(0, 3).every((n) => /white/.test(n) && /cooked/.test(n))).toBe(true);
    expect(hits).not.toContain('Snacks, rice cakes, brown rice, plain');
    const raw = hits.indexOf('Rice, white, long-grain, regular, raw, enriched');
    if (raw >= 0) expect(raw).toBeGreaterThan(2);
  });

  it('returns per-100 g values with nulls preserved', async () => {
    const [hit] = await searchIngredients(db, 'rice white long grain cooked');
    expect(hit).toMatchObject({
      nameEn: 'Rice, white, long-grain, regular, enriched, cooked',
      source: 'usda',
      kcal: 130,
      proteinG: 2.69,
      fiberG: 0.4,
      isDish: false,
    });
    const [oil] = await searchIngredients(db, 'oil soybean');
    expect(oil).toMatchObject({ kcal: 884, fiberG: null, sodiumMg: null });
  });

  it('matches while typing (prefix)', async () => {
    expect((await names('chick'))[0]).toMatch(/^Chicken/);
  });

  it('tolerates typos (trigram)', async () => {
    expect(await names('chiken breast')).toContainEqual(expect.stringMatching(/^Chicken/));
  });

  it('finds Thai names', async () => {
    expect((await searchIngredients(db, 'ข้าว'))[0]).toMatchObject({
      nameTh: 'ข้าวสวย',
      source: 'thaifcd',
    });
  });

  it('treats LIKE wildcards literally and respects the limit', async () => {
    expect(await names('%')).toEqual([]);
    expect(await names('rice', 2)).toHaveLength(2);
  });

  it('blank query returns nothing', async () => {
    expect(await names('   ')).toEqual([]);
  });
});
