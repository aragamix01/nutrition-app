// Fake data for trying the dashboard: 14 days of meals and weights.
//
//   npm run db:seed-demo             # add demo data
//   npm run db:seed-demo -- --clear  # remove demo meals again
//
// Uses DATABASE_URL from .env.local (point it at a Neon *dev* branch, never your real data).
// Without DATABASE_URL it writes to the local dev database in .pglite/ — stop `npm run dev` first.
// Demo meals are tagged with note = 'demo'. Demo weights are only added on days without a weight.
import { config } from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import * as s from '@/db/schema';
import { searchIngredients } from '@/server/ingredients';
import { createMeal, type AnyDb, type MealType } from '@/server/meals';
import { bangkokDate } from '@/src/lib/nutrition';
import { addDays } from '@/src/lib/stats';

config({ path: '.env.local' });

const DAYS = 14;
const NOTE = 'demo';

// English queries match both the USDA import and the dev seed's name_en.
const MEALS: {
  type: MealType;
  hour: number;
  name: string;
  parts: [query: string, grams: number][];
}[] = [
  {
    type: 'breakfast',
    hour: 7,
    name: 'ข้าวไข่ดาว',
    parts: [
      ['rice white cooked', 150],
      ['egg whole fried', 50],
    ],
  },
  {
    type: 'breakfast',
    hour: 8,
    name: 'กล้วย + นม',
    parts: [
      ['banana raw', 120],
      ['milk whole', 200],
    ],
  },
  {
    type: 'lunch',
    hour: 12,
    name: 'กะเพราหมูสับ',
    parts: [
      ['rice white cooked', 180],
      ['pork ground cooked', 80],
      ['oil vegetable', 15],
      ['egg whole fried', 50],
    ],
  },
  {
    type: 'lunch',
    hour: 12,
    name: 'ข้าวอกไก่',
    parts: [
      ['rice white cooked', 180],
      ['chicken breast roasted', 120],
      ['oil vegetable', 5],
    ],
  },
  { type: 'snack', hour: 15, name: 'กล้วยหอม', parts: [['banana raw', 120]] },
  {
    type: 'dinner',
    hour: 19,
    name: 'ข้าวหมูทอด',
    parts: [
      ['rice white cooked', 200],
      ['pork ground cooked', 100],
      ['oil vegetable', 20],
    ],
  },
  {
    type: 'dinner',
    hour: 19,
    name: 'อกไก่ + ไข่',
    parts: [
      ['chicken breast roasted', 150],
      ['egg whole raw', 100],
      ['rice white cooked', 120],
    ],
  },
];

/** Deterministic pseudo-random so re-runs produce the same shape. */
function rng(seed: number) {
  let x = seed;
  return () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

async function openDb(): Promise<{ db: AnyDb; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-serverless');
    const pool = new Pool({ connectionString: url });
    return { db: drizzle(pool, { schema: s }), close: () => pool.end() };
  }
  const { openDevDb } = await import('@/server/dev-db');
  const db = await openDevDb();
  // PGlite keeps the event loop alive until closed.
  return { db, close: () => db.$client.close() };
}

async function main() {
  const { db, close } = await openDb();
  console.log(process.env.DATABASE_URL ? 'Using DATABASE_URL' : 'Using local .pglite');
  try {
    if (process.argv.includes('--clear')) {
      const gone = await db
        .delete(s.mealEntry)
        .where(eq(s.mealEntry.note, NOTE))
        .returning({ id: s.mealEntry.id });
      console.log(`Removed ${gone.length} demo meals.`);
      return;
    }

    const ids = new Map<string, number>();
    for (const q of new Set(MEALS.flatMap((m) => m.parts.map(([query]) => query)))) {
      const [hit] = await searchIngredients(db, q, 1);
      if (!hit)
        throw new Error(`No ingredient for "${q}". Import USDA first (npm run db:import-usda).`);
      ids.set(q, hit.id);
      console.log(`  ${q.padEnd(24)} → ${hit.nameEn}`);
    }

    const rand = rng(42);
    const today = bangkokDate();
    let meals = 0;
    for (let i = DAYS - 1; i >= 0; i--) {
      const date = addDays(today, -i);
      if (rand() < 0.1) continue; // a forgotten day now and then
      for (const type of ['breakfast', 'lunch', 'snack', 'dinner'] as const) {
        if (type === 'snack' && rand() < 0.5) continue;
        const options = MEALS.filter((m) => m.type === type);
        const m = options[Math.floor(rand() * options.length)];
        const minute = String(Math.floor(rand() * 50)).padStart(2, '0');
        await createMeal(db, {
          eatenAt: `${date}T${String(m.hour).padStart(2, '0')}:${minute}:00+07:00`,
          mealType: type,
          nameTh: m.name,
          note: NOTE,
          portionMultiplier: rand() < 0.2 ? 1.5 : 1,
          components: m.parts.map(([q, grams]) => ({ ingredientId: ids.get(q)!, grams })),
        });
        meals++;
      }
    }

    // Weight drifting down ~0.5 kg/week with daily noise, every day or two.
    const weights = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      if (rand() < 0.35) continue;
      weights.push({
        date: addDays(today, -i),
        weightKg: Math.round((71 - (DAYS - i) * 0.07 + (rand() - 0.5) * 0.8) * 10) / 10,
      });
    }
    const added = await db
      .insert(s.weightLog)
      .values(weights)
      .onConflictDoNothing()
      .returning({ id: s.weightLog.id });

    const [{ n }] = (
      await db.execute<{ n: number }>(
        sql`select count(*)::int as n from meal_entry where note = ${NOTE}`,
      )
    ).rows;
    console.log(
      `Added ${meals} demo meals (${n} total) and ${added.length} weights over ${DAYS} days.`,
    );
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
