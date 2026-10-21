import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { searchIngredients } from '../ingredients';
import { createTestDb, type TestDb } from '../test-db';
import { detailUrl, importThaiFcd, searchThaiFcd, ThaiFcdError, type Fetcher } from './client';

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

let db: TestDb;
let calls: { url: string; ua: string; at: number }[];

/** Fake site: answers from fixtures and records every request. */
const site =
  (routes: Record<string, string | number>): Fetcher =>
  async (url, init) => {
    calls.push({ url, ua: new Headers(init.headers).get('user-agent') ?? '', at: Date.now() });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const body = key ? routes[key] : 404;
    return typeof body === 'number'
      ? new Response('', { status: body })
      : new Response(body, { status: 200 });
  };

beforeAll(async () => {
  db = await createTestDb();
}, 30_000);

beforeEach(async () => {
  await db.execute(
    sql`truncate http_cache, rate_limit, meal_component, dish_component, ingredient restart identity cascade`,
  );
  calls = [];
  process.env.SCRAPER_CONTACT = 'me@example.com';
});

describe('searchThaiFcd', () => {
  it('sends one word, ranks for the full query, identifies itself', async () => {
    const hits = await searchThaiFcd(
      db,
      'fried rice pork',
      undefined,
      site({ get_json_food_name: fixture('search-rice.json') }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('term=fried');
    expect(calls[0].ua).toContain('me@example.com');
    expect(hits[0]).toMatchObject({ id: '1554', imported: null });
  });

  it('caches searches: the second identical search does not touch the site', async () => {
    const f = site({ get_json_food_name: fixture('search-rice.json') });
    await searchThaiFcd(db, 'fried rice', undefined, f);
    await searchThaiFcd(db, 'Fried rice, with vegetables', undefined, f); // longest word differs → one more request
    await searchThaiFcd(db, 'fried rice', undefined, f);
    expect(calls.map((c) => new URL(c.url).searchParams.get('term'))).toEqual([
      'fried',
      'vegetables',
    ]);
  });

  it('filters by food group', async () => {
    await searchThaiFcd(db, 'rice', 'T', site({ get_json_food_name: '[]' }));
    expect(calls[0].url).toContain('food_group_id=84');
    await expect(searchThaiFcd(db, 'rice', 'X', site({}))).rejects.toThrow(/unknown food group/);
  });

  it('rejects Thai-only queries without calling the site', async () => {
    await expect(searchThaiFcd(db, 'ข้าวผัด', undefined, site({}))).rejects.toThrow(/ภาษาอังกฤษ/);
    expect(calls).toHaveLength(0);
  });

  it('turns site errors into readable 502s', async () => {
    const err = await searchThaiFcd(db, 'rice', undefined, site({ get_json_food_name: 500 })).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ThaiFcdError);
    expect(err.status).toBe(502);
    const changed = await searchThaiFcd(
      db,
      'rice',
      undefined,
      site({ get_json_food_name: '<html>new site</html>' }),
    ).catch((e) => e);
    expect(changed.message).toMatch(/เปลี่ยนรูปแบบ/);
  });

  it('spaces requests at least 1 second apart', async () => {
    const f = site({ get_json_food_name: '[]' });
    await searchThaiFcd(db, 'alpha', undefined, f);
    await searchThaiFcd(db, 'bravo', undefined, f);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(950);
  });
});

describe('importThaiFcd', () => {
  const detail = { food_name_result: fixture('detail-T56-fried-rice.html') };

  it('imports into ingredient and is then found by the normal search', async () => {
    const ing = await importThaiFcd(
      db,
      { id: '1554', name: 'Fried rice with pork, vegetable and egg' },
      site(detail),
    );
    expect(ing).toMatchObject({ source: 'thaifcd', nameTh: 'ข้าวผัดหมู', kcal: 144, isDish: true });
    const [hit] = await searchIngredients(db, 'ข้าวผัดหมู');
    expect(hit.id).toBe(ing.id);
  });

  it('never re-fetches an imported item, and search marks it imported', async () => {
    const f = site({ ...detail, get_json_food_name: fixture('search-rice.json') });
    const a = await importThaiFcd(db, { id: '1554', name: 'x' }, f);
    const b = await importThaiFcd(db, { id: '1554', name: 'x' }, f);
    expect(b.id).toBe(a.id);
    expect(calls.filter((c) => c.url.includes('food_name_result'))).toHaveLength(1);
    const hits = await searchThaiFcd(db, 'fried rice pork', undefined, f);
    expect(hits.find((h) => h.id === '1554')?.imported?.id).toBe(a.id);
    expect(detailUrl('1554')).toContain('selected_id=1554');
  });

  it('rejects ids that are not numbers', async () => {
    await expect(importThaiFcd(db, { id: '1; drop', name: 'x' }, site({}))).rejects.toThrow(
      /bad Thai FCD id/,
    );
  });
});
