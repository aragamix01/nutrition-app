import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as s from '@/db/schema';
import { analyzeImage } from './analyze';
import {
  AiUnavailableError,
  buildPrompt,
  callGemini,
  mockGemini,
  parseAiResult,
  type ModelCall,
} from './gemini';
import { createDish } from './meals';
import { hitRateLimit, RateLimitError } from './ratelimit';
import { createTestDb, type TestDb } from './test-db';

let db: TestDb;
let rice: number;
let pork: number;

const IMAGE = { image: 'A'.repeat(200), mimeType: 'image/jpeg' as const };
const model =
  (reply: unknown): ModelCall =>
  async () =>
    typeof reply === 'string' ? reply : JSON.stringify(reply);

beforeAll(async () => {
  db = await createTestDb();
}, 30_000);

beforeEach(async () => {
  await db.execute(
    sql`truncate meal_component, meal_entry, dish_component, dish, ingredient, rate_limit restart identity cascade`,
  );
  const rows = await db
    .insert(s.ingredient)
    .values([
      {
        source: 'usda',
        sourceId: '1',
        nameEn: 'Rice, white, cooked',
        kcal: 130,
        proteinG: 2.7,
        carbG: 28,
        fatG: 0.3,
      },
      {
        source: 'usda',
        sourceId: '2',
        nameEn: 'Pork, ground, cooked',
        kcal: 297,
        proteinG: 25.7,
        carbG: 0,
        fatG: 20.8,
      },
      {
        source: 'manual',
        sourceId: 'm1',
        nameEn: 'Oyster sauce',
        nameTh: 'ซอสหอยนางรม',
        kcal: 51,
        proteinG: 1.4,
        carbG: 11,
        fatG: 0.3,
      },
    ])
    .returning({ id: s.ingredient.id });
  [rice, pork] = rows.map((r) => r.id);
});

describe('buildPrompt', () => {
  it('lists library dishes with ids and aliases', () => {
    const p = buildPrompt([{ id: 7, nameTh: 'กะเพราหมูสับ', aliases: ['ผัดกะเพรา'] }]);
    expect(p).toContain('- id 7: กะเพราหมูสับ / ผัดกะเพรา');
    expect(p).toContain('น้ำมัน น้ำตาล และกะทิ');
  });
});

describe('callGemini', () => {
  it('fails cleanly with 503 when the key is not configured', async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const err = await callGemini({ data: 'AAAA', mimeType: 'image/jpeg' }, 'x').catch((e) => e);
      expect(err).toBeInstanceOf(AiUnavailableError);
      expect(err.status).toBe(503);
    } finally {
      if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
    }
  });
});

describe('parseAiResult', () => {
  it('fills defaults', () => {
    const r = parseAiResult(
      JSON.stringify({
        dishes: [{ name_th: 'ข้าว', ingredients: [{ name_th: 'ข้าว', grams: 100 }] }],
      }),
    );
    expect(r.dishes[0]).toMatchObject({
      matched_dish_id: null,
      portion_multiplier: 1,
      confidence: 0.5,
    });
    expect(r.notes).toBe('');
  });
  it('turns garbage into a 502, not a crash', () => {
    expect(() => parseAiResult('not json')).toThrow(AiUnavailableError);
    expect(() => parseAiResult('{"dishes":"x"}')).toThrow(/ไม่ครบ/);
  });
});

describe('analyzeImage', () => {
  it('matches each AI ingredient to the database, null when nothing fits', async () => {
    const r = await analyzeImage(db, IMAGE, mockGemini);
    const [dish] = r.dishes;
    expect(dish).toMatchObject({ source: 'ai', dishId: null, nameTh: 'ข้าวกะเพราหมูสับไข่ดาว' });
    const byName = Object.fromEntries(dish.ingredients.map((i) => [i.nameTh, i]));
    expect(byName['ข้าวสวย'].match?.id).toBe(rice);
    expect(byName['ข้าวสวย'].grams).toBe(180);
    expect(byName['หมูสับ'].match?.id).toBe(pork);
    // "sauce oyster" finds the manual ingredient by its English name.
    expect(byName['ซอสหอยนางรม'].match?.nameTh).toBe('ซอสหอยนางรม');
    expect(byName['ผงชูรส'].match).toBeNull();
    expect(r.notes).toContain('mock');
  });

  it('falls back to the Thai name when the English query finds nothing', async () => {
    const r = await analyzeImage(
      db,
      IMAGE,
      model({
        dishes: [
          {
            name_th: 'x',
            ingredients: [{ name_th: 'ซอสหอยนางรม', usda_query: 'zzz qqq', grams: 10 }],
          },
        ],
      }),
    );
    expect(r.dishes[0].ingredients[0].match?.nameTh).toBe('ซอสหอยนางรม');
  });

  it('trusts the library recipe when the model recognises a saved dish', async () => {
    const d = await createDish(db, {
      nameTh: 'กะเพราหมูสับ',
      components: [
        { ingredientId: rice, grams: 200 },
        { ingredientId: pork, grams: 90 },
      ],
    });
    let prompt = '';
    const r = await analyzeImage(db, IMAGE, async (_img, p) => {
      prompt = p;
      return JSON.stringify({
        dishes: [
          {
            name_th: 'ผัดกะเพรา',
            matched_dish_id: d.id,
            portion_multiplier: 1.46,
            ingredients: [{ name_th: 'ข้าว', usda_query: 'rice', grams: 999 }],
            confidence: 0.9,
          },
        ],
        notes: '',
      });
    });
    expect(prompt).toContain(`id ${d.id}: กะเพราหมูสับ`);
    expect(r.dishes[0]).toMatchObject({
      source: 'library',
      dishId: d.id,
      nameTh: 'กะเพราหมูสับ',
      portionMultiplier: 1.5,
    });
    expect(r.dishes[0].ingredients.map((i) => i.grams)).toEqual([200, 90]); // library grams, not the AI's 999
  });

  it('ignores a matched_dish_id that is not in the library', async () => {
    const r = await analyzeImage(
      db,
      IMAGE,
      model({
        dishes: [
          {
            name_th: 'ข้าว',
            matched_dish_id: 999,
            ingredients: [{ name_th: 'ข้าว', usda_query: 'rice white cooked', grams: 150 }],
          },
        ],
      }),
    );
    expect(r.dishes[0]).toMatchObject({ source: 'ai', dishId: null });
  });

  it('rejects bad uploads before calling the model', async () => {
    let called = false;
    const spy: ModelCall = async () => {
      called = true;
      return '{"dishes":[]}';
    };
    await expect(
      analyzeImage(db, { image: 'not base64!!', mimeType: 'image/jpeg' }, spy),
    ).rejects.toThrow();
    await expect(
      analyzeImage(db, { ...IMAGE, mimeType: 'image/gif' as 'image/jpeg' }, spy),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });
});

describe('hitRateLimit', () => {
  it('allows up to the limit per window, then throws with a retry time', async () => {
    await hitRateLimit(db, 'k', 2, 3600);
    await hitRateLimit(db, 'k', 2, 3600);
    const err = await hitRateLimit(db, 'k', 2, 3600).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfterSeconds).toBeGreaterThan(3500);
  });

  it('starts a new window once the old one has passed', async () => {
    await hitRateLimit(db, 'k', 1, 3600);
    await db.execute(
      sql`update rate_limit set window_start = now() - interval '2 hours' where key = 'k'`,
    );
    await expect(hitRateLimit(db, 'k', 1, 3600)).resolves.toBeUndefined();
  });

  it('keys are independent', async () => {
    await hitRateLimit(db, 'a', 1, 3600);
    await expect(hitRateLimit(db, 'b', 1, 3600)).resolves.toBeUndefined();
  });
});
