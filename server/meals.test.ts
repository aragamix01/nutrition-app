import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as s from '@/db/schema';
import { searchIngredients } from './ingredients';
import {
  bangkokDayRange,
  createDish,
  createManualIngredient,
  createMeal,
  deleteMeal,
  getDish,
  listDishes,
  listMeals,
  updateDish,
} from './meals';
import { createTestDb, type TestDb } from './test-db';

let db: TestDb;
let rice: number;
let oil: number;
let pork: number;

beforeAll(async () => {
  db = await createTestDb();
}, 30_000);

beforeEach(async () => {
  await db.execute(
    sql`truncate meal_component, meal_entry, dish_component, dish, ingredient restart identity cascade`,
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
        fiberG: 0.4,
        sodiumMg: 1,
      },
      {
        source: 'usda',
        sourceId: '2',
        nameEn: 'Oil, vegetable',
        kcal: 884,
        proteinG: 0,
        carbG: 0,
        fatG: 100,
      },
      {
        source: 'usda',
        sourceId: '3',
        nameEn: 'Pork, ground, cooked',
        kcal: 297,
        proteinG: 25.7,
        carbG: 0,
        fatG: 20.8,
        sodiumMg: 73,
      },
    ])
    .returning({ id: s.ingredient.id });
  [rice, oil, pork] = rows.map((r) => r.id);
});

const kaprao = () => [
  { ingredientId: rice, grams: 200 },
  { ingredientId: pork, grams: 80 },
  { ingredientId: oil, grams: 15 },
];

describe('bangkokDayRange', () => {
  it('starts at 00:00 Bangkok (17:00 UTC the day before)', () => {
    const [a, b] = bangkokDayRange('2026-10-21');
    expect(a.toISOString()).toBe('2026-10-20T17:00:00.000Z');
    expect(b.toISOString()).toBe('2026-10-21T17:00:00.000Z');
  });
  it('rejects garbage', () => {
    expect(() => bangkokDayRange('yesterday')).toThrow(/bad date/);
  });
});

describe('meals', () => {
  it('computes the nutrient snapshot on the server', async () => {
    const id = await createMeal(db, {
      eatenAt: '2026-10-21T05:30:00Z',
      mealType: 'lunch',
      nameTh: 'กะเพราหมูสับ',
      portionMultiplier: 1.5,
      components: kaprao(),
    });
    const { meals, totals } = await listMeals(db, '2026-10-21');
    expect(meals).toHaveLength(1);
    const m = meals[0];
    expect(m.id).toBe(id);
    // (260 + 237.6 + 132.6) × 1.5
    expect(m.kcal).toBeCloseTo(945.3, 1);
    expect(m.fatG).toBeCloseTo((0.6 + 16.64 + 15) * 1.5, 1);
    expect(m.fiberG).toBeCloseTo(1.2, 2);
    expect(totals.kcal).toBeCloseTo(m.kcal);

    const comps = await db
      .select()
      .from(s.mealComponent)
      .where(eq(s.mealComponent.mealEntryId, id));
    expect(comps.map((c) => c.grams).sort()).toEqual([15, 200, 80]);
  });

  it('groups by Bangkok day, not UTC day', async () => {
    const base = {
      mealType: 'snack' as const,
      nameTh: 'x',
      components: [{ ingredientId: rice, grams: 100 }],
    };
    await createMeal(db, { ...base, eatenAt: '2026-10-21T16:59:00Z' }); // 23:59 on the 21st
    await createMeal(db, { ...base, eatenAt: '2026-10-21T17:00:00Z' }); // 00:00 on the 22nd
    expect((await listMeals(db, '2026-10-21')).meals).toHaveLength(1);
    expect((await listMeals(db, '2026-10-22')).meals).toHaveLength(1);
  });

  it('sums the day', async () => {
    await createMeal(db, {
      eatenAt: '2026-10-21T01:00:00Z',
      mealType: 'breakfast',
      nameTh: 'ข้าว',
      components: [{ ingredientId: rice, grams: 100 }],
    });
    await createMeal(db, {
      eatenAt: '2026-10-21T05:00:00Z',
      mealType: 'lunch',
      nameTh: 'หมู',
      components: [{ ingredientId: pork, grams: 100 }],
    });
    const { totals } = await listMeals(db, '2026-10-21');
    expect(totals.kcal).toBeCloseTo(427);
    expect(totals.proteinG).toBeCloseTo(28.4);
    expect(totals.sodiumMg).toBeCloseTo(74);
  });

  it('rejects unknown ingredients and empty meals', async () => {
    await expect(
      createMeal(db, {
        mealType: 'lunch',
        nameTh: 'x',
        components: [{ ingredientId: 9999, grams: 10 }],
      }),
    ).rejects.toThrow(/unknown ingredient id: 9999/);
    await expect(createMeal(db, { mealType: 'lunch', nameTh: 'x' })).rejects.toThrow(
      /components or dishId/,
    );
    expect((await db.select().from(s.mealEntry)).length).toBe(0);
  });

  it('delete removes the meal and its components', async () => {
    const id = await createMeal(db, { mealType: 'lunch', nameTh: 'x', components: kaprao() });
    await deleteMeal(db, id);
    expect(await db.select().from(s.mealComponent)).toHaveLength(0);
    await expect(deleteMeal(db, id)).rejects.toThrow(/not found/);
  });

  it('delete undoes dish and ingredient use counts', async () => {
    const d = await createDish(db, { nameTh: 'กะเพรา', components: kaprao() });
    const id = await createMeal(db, { mealType: 'lunch', nameTh: d.nameTh, dishId: d.id });
    expect((await getDish(db, d.id)).useCount).toBe(1);
    await deleteMeal(db, id);
    expect((await getDish(db, d.id)).useCount).toBe(0);
    const [r] = await db.select().from(s.ingredient).where(eq(s.ingredient.id, rice));
    expect(r.useCount).toBe(0);
  });

  it('counts ingredient use', async () => {
    await createMeal(db, { mealType: 'lunch', nameTh: 'x', components: kaprao() });
    const [r] = await db.select().from(s.ingredient).where(eq(s.ingredient.id, rice));
    expect(r.useCount).toBe(1);
  });
});

describe('dishes', () => {
  it('creates a dish with totals per serving', async () => {
    const d = await createDish(db, {
      nameTh: 'กะเพราหมูสับ',
      nameAliases: ['ผัดกะเพรา'],
      components: kaprao(),
    });
    expect(d.components).toHaveLength(3);
    expect(d.components[0].ingredient.nameEn).toBe('Rice, white, cooked');
    expect(d.totals.kcal).toBeCloseTo(630.2, 1);
  });

  it('one-tap log from the library copies the recipe and bumps use counts', async () => {
    const d = await createDish(db, { nameTh: 'กะเพราหมูสับ', components: kaprao() });
    const id = await createMeal(db, { mealType: 'dinner', nameTh: d.nameTh, dishId: d.id });
    const comps = await db
      .select()
      .from(s.mealComponent)
      .where(eq(s.mealComponent.mealEntryId, id));
    expect(comps).toHaveLength(3);
    expect((await getDish(db, d.id)).useCount).toBe(1);
  });

  it('editing a recipe never changes past meals', async () => {
    const d = await createDish(db, { nameTh: 'กะเพรา', components: kaprao() });
    await createMeal(db, {
      eatenAt: '2026-10-21T05:00:00Z',
      mealType: 'lunch',
      nameTh: d.nameTh,
      dishId: d.id,
    });
    const before = (await listMeals(db, '2026-10-21')).meals[0].kcal;

    const updated = await updateDish(db, d.id, {
      nameTh: 'กะเพรา (น้ำมันน้อย)',
      components: [{ ingredientId: rice, grams: 200 }],
    });
    expect(updated.components).toHaveLength(1);
    expect(updated.nameTh).toBe('กะเพรา (น้ำมันน้อย)');
    expect((await listMeals(db, '2026-10-21')).meals[0].kcal).toBe(before);
  });

  it('lists most used first and searches name and aliases', async () => {
    const a = await createDish(db, {
      nameTh: 'ข้าวมันไก่',
      components: [{ ingredientId: rice, grams: 200 }],
    });
    await createDish(db, {
      nameTh: 'กะเพราหมูสับ',
      nameAliases: ['basil pork'],
      components: kaprao(),
    });
    await createMeal(db, { mealType: 'lunch', nameTh: a.nameTh, dishId: a.id });
    expect((await listDishes(db)).map((d) => d.nameTh)).toEqual(['ข้าวมันไก่', 'กะเพราหมูสับ']);
    expect((await listDishes(db, 'กะเพรา')).map((d) => d.nameTh)).toEqual(['กะเพราหมูสับ']);
    expect((await listDishes(db, 'basil')).map((d) => d.nameTh)).toEqual(['กะเพราหมูสับ']);
  });

  it('update of a missing dish is a 404', async () => {
    await expect(updateDish(db, 999, { nameTh: 'x', components: kaprao() })).rejects.toThrow(
      /not found/,
    );
  });
});

describe('manual ingredients', () => {
  it('are saved and searchable by Thai name', async () => {
    const i = await createManualIngredient(db, {
      nameTh: 'ซอสหอยนางรม',
      kcal: 51,
      proteinG: 1.4,
      carbG: 11,
      fatG: 0.3,
    });
    expect(i).toMatchObject({ source: 'manual', nameEn: 'ซอสหอยนางรม', fiberG: null });
    const [hit] = await searchIngredients(db, 'หอยนางรม');
    expect(hit.id).toBe(i.id);
  });
});
