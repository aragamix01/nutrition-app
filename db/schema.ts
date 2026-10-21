import { sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

/** Single row (id = 1). Daily targets are computed live from this + the latest weight. */
export const profile = pgTable('profile', {
  id: integer('id').primaryKey().default(1),
  sex: text('sex', { enum: ['male', 'female'] }).notNull(),
  birthYear: integer('birth_year').notNull(),
  heightCm: real('height_cm').notNull(),
  activityLevel: real('activity_level').notNull(),
  goal: text('goal', { enum: ['lose', 'maintain', 'gain'] }).notNull(),
  goalRate: real('goal_rate').notNull(),
  proteinGPerKg: real('protein_g_per_kg').notNull().default(1.8),
  fatPct: real('fat_pct').notNull().default(0.25),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const weightLog = pgTable(
  'weight_log',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull(),
    weightKg: real('weight_kg').notNull(),
  },
  (t) => [uniqueIndex('weight_log_date_uq').on(t.date)],
);

/** Ingredients — all values per 100 g edible portion. */
export const ingredient = pgTable(
  'ingredient',
  {
    id: serial('id').primaryKey(),
    source: text('source', { enum: ['usda', 'thaifcd', 'manual'] }).notNull(),
    sourceId: text('source_id').notNull(),
    nameEn: text('name_en').notNull(),
    nameTh: text('name_th'),
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g').notNull(),
    carbG: real('carb_g').notNull(),
    fatG: real('fat_g').notNull(),
    fiberG: real('fiber_g'),
    sodiumMg: real('sodium_mg'),
    isDish: boolean('is_dish').notNull().default(false),
    sourceUrl: text('source_url'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    useCount: integer('use_count').notNull().default(0),
    search: tsvector('search').generatedAlwaysAs((): SQL => sql`to_tsvector('english', "name_en")`),
  },
  (t) => [
    uniqueIndex('ingredient_source_uq').on(t.source, t.sourceId),
    index('ingredient_search_idx').using('gin', t.search),
    index('ingredient_name_en_trgm_idx').using('gin', t.nameEn.op('gin_trgm_ops')),
    index('ingredient_name_th_trgm_idx').using('gin', t.nameTh.op('gin_trgm_ops')),
  ],
);

/** "คลังอาหารของฉัน" — saved recipes. */
export const dish = pgTable('dish', {
  id: serial('id').primaryKey(),
  nameTh: text('name_th').notNull(),
  nameAliases: jsonb('name_aliases').$type<string[]>().notNull().default([]),
  defaultServingDesc: text('default_serving_desc'),
  useCount: integer('use_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dishComponent = pgTable('dish_component', {
  id: serial('id').primaryKey(),
  dishId: integer('dish_id')
    .notNull()
    .references(() => dish.id, { onDelete: 'cascade' }),
  ingredientId: integer('ingredient_id')
    .notNull()
    .references(() => ingredient.id),
  grams: real('grams').notNull(),
});

/** Nutrient numbers are a snapshot at save time, so editing a recipe never rewrites history. */
export const mealEntry = pgTable(
  'meal_entry',
  {
    id: serial('id').primaryKey(),
    eatenAt: timestamp('eaten_at', { withTimezone: true }).notNull(),
    mealType: text('meal_type', { enum: ['breakfast', 'lunch', 'dinner', 'snack'] }).notNull(),
    dishId: integer('dish_id').references(() => dish.id, { onDelete: 'set null' }),
    nameTh: text('name_th').notNull(),
    portionMultiplier: real('portion_multiplier').notNull().default(1),
    note: text('note'),
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g').notNull(),
    carbG: real('carb_g').notNull(),
    fatG: real('fat_g').notNull(),
    fiberG: real('fiber_g'),
    sodiumMg: real('sodium_mg'),
  },
  (t) => [index('meal_entry_eaten_at_idx').on(t.eatenAt)],
);

export const mealComponent = pgTable('meal_component', {
  id: serial('id').primaryKey(),
  mealEntryId: integer('meal_entry_id')
    .notNull()
    .references(() => mealEntry.id, { onDelete: 'cascade' }),
  ingredientId: integer('ingredient_id')
    .notNull()
    .references(() => ingredient.id),
  grams: real('grams').notNull(),
});

/** Thai FCD search cache. */
export const httpCache = pgTable('http_cache', {
  key: text('key').primaryKey(),
  body: jsonb('body').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** Rate-limit state shared across serverless invocations. */
export const rateLimit = pgTable('rate_limit', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull().default(0),
  lastRequestAt: timestamp('last_request_at', { withTimezone: true }),
});
