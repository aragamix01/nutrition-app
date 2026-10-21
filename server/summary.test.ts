import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as s from '@/db/schema';
import { createMeal } from './meals';
import { currentTargets, daySummary, rangeSummary } from './summary';
import { createTestDb, type TestDb } from './test-db';

let db: TestDb;
let rice: number;

beforeAll(async () => {
  db = await createTestDb();
}, 30_000);

beforeEach(async () => {
  await db.execute(
    sql`truncate meal_component, meal_entry, dish_component, dish, ingredient, profile, weight_log restart identity cascade`,
  );
  [{ id: rice }] = await db
    .insert(s.ingredient)
    .values({
      source: 'usda',
      sourceId: '1',
      nameEn: 'Rice',
      kcal: 130,
      proteinG: 2.7,
      carbG: 28,
      fatG: 0.3,
    })
    .returning({ id: s.ingredient.id });
});

const eat = (eatenAt: string, grams: number) =>
  createMeal(db, {
    eatenAt,
    mealType: 'lunch',
    nameTh: 'ข้าว',
    components: [{ ingredientId: rice, grams }],
  });

describe('currentTargets', () => {
  it('is null until both profile and a weight exist', async () => {
    expect(await currentTargets(db)).toBeNull();
    await db.insert(s.profile).values({
      sex: 'male',
      birthYear: 1993,
      heightCm: 172,
      activityLevel: 1.55,
      goal: 'lose',
      goalRate: -0.15,
    });
    expect(await currentTargets(db)).toBeNull();
    await db.insert(s.weightLog).values([
      { date: '2026-10-01', weightKg: 72 },
      { date: '2026-10-20', weightKg: 70 },
    ]);
    const t = await currentTargets(db, new Date('2026-10-21T05:00:00Z'));
    expect(Math.round(t!.kcal)).toBe(2128); // uses the latest weight (70 kg)
  });
});

describe('daySummary', () => {
  it('totals one Bangkok day', async () => {
    await eat('2026-10-21T01:00:00Z', 100);
    await eat('2026-10-21T12:00:00Z', 200);
    await eat('2026-10-21T18:00:00Z', 100); // already the 22nd in Bangkok
    const d = await daySummary(db, '2026-10-21');
    expect(d.mealCount).toBe(2);
    expect(d.totals.kcal).toBeCloseTo(390);
  });
});

describe('rangeSummary', () => {
  it('fills empty days with zeros and averages logged days only', async () => {
    await eat('2026-10-15T05:00:00Z', 100);
    await eat('2026-10-15T11:00:00Z', 100);
    await eat('2026-10-21T05:00:00Z', 300);
    const r = await rangeSummary(db, '2026-10-15', '2026-10-21');
    expect(r.days).toHaveLength(7);
    expect(r.days[0]).toMatchObject({ date: '2026-10-15', mealCount: 2 });
    expect(r.days[0].kcal).toBeCloseTo(260);
    expect(r.days[1]).toEqual({
      date: '2026-10-16',
      kcal: 0,
      proteinG: 0,
      carbG: 0,
      fatG: 0,
      mealCount: 0,
    });
    expect(r.loggedDays).toBe(2);
    expect(r.averages.kcal).toBeCloseTo((260 + 390) / 2);
  });

  it('groups by Bangkok day at the UTC boundary', async () => {
    await eat('2026-10-20T16:59:00Z', 100); // 23:59 on the 20th
    await eat('2026-10-20T17:00:00Z', 100); // 00:00 on the 21st
    const r = await rangeSummary(db, '2026-10-20', '2026-10-21');
    expect(r.days.map((d) => d.mealCount)).toEqual([1, 1]);
  });

  it('rejects reversed, oversized and malformed ranges', async () => {
    await expect(rangeSummary(db, '2026-10-21', '2026-10-01')).rejects.toThrow(/after/);
    await expect(rangeSummary(db, '2025-01-01', '2026-10-21')).rejects.toThrow(/limited/);
    await expect(rangeSummary(db, 'last week', '2026-10-21')).rejects.toThrow(/YYYY-MM-DD/);
  });
});
