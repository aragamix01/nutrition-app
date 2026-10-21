// Meals, the dish library ("คลังอาหารของฉัน") and manual ingredients.
// Multi-table writes are single SQL statements (data-modifying CTEs): the Neon HTTP driver has no
// interactive transactions, and one statement is atomic on its own.
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import * as s from '@/db/schema';
import { sumComponents, type Nutrients } from '@/src/lib/nutrition';
import { toHit, type IngredientHit } from './ingredients';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Neon HTTP in the app, PGlite in tests
export type AnyDb = PgDatabase<any, typeof s>;

export class NotFoundError extends Error {}
export class BadInputError extends Error {}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const ComponentInput = z.object({
  ingredientId: z.number().int().positive(),
  grams: z.number().min(0).max(5000),
});
export type ComponentInput = z.infer<typeof ComponentInput>;

export const MealInput = z
  .object({
    eatenAt: z.iso.datetime({ offset: true }).optional(),
    mealType: z.enum(MEAL_TYPES),
    nameTh: z.string().trim().min(1).max(120),
    portionMultiplier: z.number().min(0.1).max(10).default(1),
    note: z.string().trim().max(500).optional(),
    dishId: z.number().int().positive().optional(),
    /** Omit to use the dish's saved recipe (one-tap logging). */
    components: z.array(ComponentInput).min(1).max(30).optional(),
  })
  .refine((m) => m.dishId || m.components, { message: 'components or dishId is required' });
export type MealInput = z.input<typeof MealInput>;

export const DishInput = z.object({
  nameTh: z.string().trim().min(1).max(120),
  nameAliases: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  defaultServingDesc: z.string().trim().max(120).optional(),
  components: z.array(ComponentInput).min(1).max(30),
});
export type DishInput = z.input<typeof DishInput>;

export const ManualIngredientInput = z.object({
  nameTh: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().max(200).optional(),
  kcal: z.number().min(0).max(900),
  proteinG: z.number().min(0).max(100),
  carbG: z.number().min(0).max(100),
  fatG: z.number().min(0).max(100),
  fiberG: z.number().min(0).max(100).nullable().optional(),
  sodiumMg: z.number().min(0).max(50000).nullable().optional(),
});
export type ManualIngredientInput = z.input<typeof ManualIngredientInput>;

export type Meal = {
  id: number;
  eatenAt: string;
  mealType: MealType;
  dishId: number | null;
  nameTh: string;
  portionMultiplier: number;
  note: string | null;
} & Nutrients;

export type DishComponentView = { ingredientId: number; grams: number; ingredient: IngredientHit };
export type Dish = {
  id: number;
  nameTh: string;
  nameAliases: string[];
  defaultServingDesc: string | null;
  useCount: number;
  /** For one serving of the saved recipe. */
  totals: Nutrients;
  components: DishComponentView[];
};

const per100 = (i: IngredientHit): Nutrients => ({
  kcal: i.kcal,
  proteinG: i.proteinG,
  carbG: i.carbG,
  fatG: i.fatG,
  fiberG: i.fiberG,
  sodiumMg: i.sodiumMg,
});

async function loadIngredients(db: AnyDb, ids: number[]): Promise<Map<number, IngredientHit>> {
  const unique = [...new Set(ids)];
  const rows = unique.length
    ? await db.select().from(s.ingredient).where(inArray(s.ingredient.id, unique))
    : [];
  const map = new Map(rows.map((r) => [r.id, toHit(r)]));
  const missing = unique.filter((id) => !map.has(id));
  if (missing.length) throw new BadInputError(`unknown ingredient id: ${missing.join(', ')}`);
  return map;
}

const componentsJson = (cs: ComponentInput[]) =>
  JSON.stringify(cs.map((c) => ({ ingredient_id: c.ingredientId, grams: c.grams })));

const firstId = (res: { rows: unknown[] }) => {
  const row = res.rows[0] as { id: number | string } | undefined;
  return row ? Number(row.id) : null;
};

// ---------------------------------------------------------------- meals

/** Saves a meal with a nutrient snapshot computed here (never trusted from the client). */
export async function createMeal(db: AnyDb, raw: MealInput, now = new Date()): Promise<number> {
  const m = MealInput.parse(raw);
  let components = m.components;
  if (!components) {
    const dish = await getDish(db, m.dishId!);
    components = dish.components.map((c) => ({ ingredientId: c.ingredientId, grams: c.grams }));
  } else if (m.dishId) {
    await getDish(db, m.dishId); // must exist
  }

  const ingredients = await loadIngredients(
    db,
    components.map((c) => c.ingredientId),
  );
  const t = sumComponents(
    components.map((c) => ({ per100: per100(ingredients.get(c.ingredientId)!), grams: c.grams })),
    m.portionMultiplier,
  );
  const json = componentsJson(components);

  const res = await db.execute(sql`
    with e as (
      insert into meal_entry (eaten_at, meal_type, dish_id, name_th, portion_multiplier, note,
                              kcal, protein_g, carb_g, fat_g, fiber_g, sodium_mg)
      values (${m.eatenAt ?? now.toISOString()}::timestamptz, ${m.mealType}, ${m.dishId ?? null}::int,
              ${m.nameTh}, ${m.portionMultiplier}, ${m.note ?? null}::text,
              ${t.kcal}, ${t.proteinG}, ${t.carbG}, ${t.fatG}, ${t.fiberG}::real, ${t.sodiumMg}::real)
      returning id
    ),
    c as (
      insert into meal_component (meal_entry_id, ingredient_id, grams)
      select e.id, x.ingredient_id, x.grams
      from e, jsonb_to_recordset(${json}::jsonb) as x(ingredient_id int, grams real)
    ),
    ui as (
      update ingredient set use_count = use_count + 1
      where id in (select (x->>'ingredient_id')::int from jsonb_array_elements(${json}::jsonb) x)
    ),
    ud as (
      update dish set use_count = use_count + 1 where id = ${m.dishId ?? null}::int
    )
    select id from e
  `);
  return firstId(res)!;
}

/** Bangkok calendar day → [start, end) instants. */
export function bangkokDayRange(date: string): [Date, Date] {
  const start = new Date(`${date}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime())) throw new BadInputError(`bad date: ${date}`);
  return [start, new Date(start.getTime() + 24 * 3600 * 1000)];
}

const toMeal = (r: typeof s.mealEntry.$inferSelect): Meal => ({
  id: r.id,
  eatenAt: r.eatenAt.toISOString(),
  mealType: r.mealType,
  dishId: r.dishId,
  nameTh: r.nameTh,
  portionMultiplier: r.portionMultiplier,
  note: r.note,
  kcal: r.kcal,
  proteinG: r.proteinG,
  carbG: r.carbG,
  fatG: r.fatG,
  fiberG: r.fiberG,
  sodiumMg: r.sodiumMg,
});

export async function listMeals(
  db: AnyDb,
  date: string,
): Promise<{ meals: Meal[]; totals: Nutrients }> {
  const [start, end] = bangkokDayRange(date);
  const rows = await db
    .select()
    .from(s.mealEntry)
    .where(and(gte(s.mealEntry.eatenAt, start), lt(s.mealEntry.eatenAt, end)))
    .orderBy(s.mealEntry.eatenAt, s.mealEntry.id);
  const meals = rows.map(toMeal);
  // Snapshots already include grams and portion: sum them as 100 g "components" of themselves.
  const totals = sumComponents(meals.map((m) => ({ per100: m, grams: 100 })));
  return { meals, totals };
}

/** Also undoes the use counts the meal added, so a mistaken log doesn't push a dish up "กินบ่อย". */
export async function deleteMeal(db: AnyDb, id: number): Promise<void> {
  const res = await db.execute(sql`
    with d as (
      delete from meal_entry where id = ${id} returning id, dish_id
    ),
    ud as (
      update dish set use_count = greatest(use_count - 1, 0)
      where id in (select dish_id from d)
    ),
    ui as (
      update ingredient set use_count = greatest(use_count - 1, 0)
      where id in (select ingredient_id from meal_component where meal_entry_id in (select id from d))
    )
    select id from d
  `);
  if (firstId(res) == null) throw new NotFoundError(`meal ${id} not found`);
}

// ---------------------------------------------------------------- dishes

async function hydrateDishes(db: AnyDb, dishes: (typeof s.dish.$inferSelect)[]): Promise<Dish[]> {
  if (!dishes.length) return [];
  const rows = await db
    .select()
    .from(s.dishComponent)
    .innerJoin(s.ingredient, eq(s.dishComponent.ingredientId, s.ingredient.id))
    .where(
      inArray(
        s.dishComponent.dishId,
        dishes.map((d) => d.id),
      ),
    )
    .orderBy(s.dishComponent.id);
  return dishes.map((d) => {
    const components = rows
      .filter((r) => r.dish_component.dishId === d.id)
      .map((r) => ({
        ingredientId: r.ingredient.id,
        grams: r.dish_component.grams,
        ingredient: toHit(r.ingredient),
      }));
    return {
      id: d.id,
      nameTh: d.nameTh,
      nameAliases: d.nameAliases,
      defaultServingDesc: d.defaultServingDesc,
      useCount: d.useCount,
      totals: sumComponents(
        components.map((c) => ({ per100: per100(c.ingredient), grams: c.grams })),
      ),
      components,
    };
  });
}

/** Most-used first. `q` matches the Thai name or any alias. */
export async function listDishes(db: AnyDb, q?: string, limit = 50): Promise<Dish[]> {
  const term = q?.trim();
  const like = term ? `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const dishes = await db
    .select()
    .from(s.dish)
    .where(
      like
        ? or(ilike(s.dish.nameTh, like), sql`${s.dish.nameAliases}::text ilike ${like}`)
        : undefined,
    )
    .orderBy(desc(s.dish.useCount), desc(s.dish.updatedAt))
    .limit(limit);
  return hydrateDishes(db, dishes);
}

export async function getDish(db: AnyDb, id: number): Promise<Dish> {
  const rows = await db.select().from(s.dish).where(eq(s.dish.id, id));
  if (!rows.length) throw new NotFoundError(`dish ${id} not found`);
  return (await hydrateDishes(db, rows))[0];
}

export async function createDish(db: AnyDb, raw: DishInput): Promise<Dish> {
  const d = DishInput.parse(raw);
  await loadIngredients(
    db,
    d.components.map((c) => c.ingredientId),
  );
  const res = await db.execute(sql`
    with d as (
      insert into dish (name_th, name_aliases, default_serving_desc)
      values (${d.nameTh}, ${JSON.stringify(d.nameAliases)}::jsonb, ${d.defaultServingDesc ?? null}::text)
      returning id
    ),
    c as (
      insert into dish_component (dish_id, ingredient_id, grams)
      select d.id, x.ingredient_id, x.grams
      from d, jsonb_to_recordset(${componentsJson(d.components)}::jsonb) as x(ingredient_id int, grams real)
    )
    select id from d
  `);
  return getDish(db, firstId(res)!);
}

/** Replaces the recipe. Past meals keep their own snapshot. */
export async function updateDish(db: AnyDb, id: number, raw: DishInput): Promise<Dish> {
  const d = DishInput.parse(raw);
  await loadIngredients(
    db,
    d.components.map((c) => c.ingredientId),
  );
  const res = await db.execute(sql`
    with u as (
      update dish set name_th = ${d.nameTh}, name_aliases = ${JSON.stringify(d.nameAliases)}::jsonb,
        default_serving_desc = ${d.defaultServingDesc ?? null}::text, updated_at = now()
      where id = ${id}
      returning id
    ),
    del as (
      delete from dish_component where dish_id in (select id from u)
    ),
    ins as (
      insert into dish_component (dish_id, ingredient_id, grams)
      select u.id, x.ingredient_id, x.grams
      from u, jsonb_to_recordset(${componentsJson(d.components)}::jsonb) as x(ingredient_id int, grams real)
    )
    select id from u
  `);
  if (firstId(res) == null) throw new NotFoundError(`dish ${id} not found`);
  return getDish(db, id);
}

// ---------------------------------------------------------------- manual ingredients

export async function createManualIngredient(
  db: AnyDb,
  raw: ManualIngredientInput,
): Promise<IngredientHit> {
  const i = ManualIngredientInput.parse(raw);
  const [row] = await db
    .insert(s.ingredient)
    .values({
      source: 'manual',
      sourceId: randomUUID(),
      nameEn: i.nameEn || i.nameTh,
      nameTh: i.nameTh,
      kcal: i.kcal,
      proteinG: i.proteinG,
      carbG: i.carbG,
      fatG: i.fatG,
      fiberG: i.fiberG ?? null,
      sodiumMg: i.sodiumMg ?? null,
    })
    .returning();
  return toHit(row);
}
