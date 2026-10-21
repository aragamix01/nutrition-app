// Import USDA FoodData Central CSV (SR Legacy, optionally Foundation Foods) into `ingredient`.
//
//   npm run db:import-usda                       # reads data/usda/
//   npm run db:import-usda -- data/usda/FoodData_Central_sr_legacy_food_csv_2018-04
//
// Re-runnable: rows upsert on (source, source_id). name_th and use_count are never overwritten.
// Runs from your machine with DATABASE_URL from .env.local (point it at a Neon dev branch first).
import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { ingredient } from '@/db/schema';
import { findCsvDir, readUsda } from './usda/read';

config({ path: '.env.local' });

const BATCH = 500;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (run `vercel env pull .env.local`)');

  const dir = findCsvDir(process.argv[2] ?? 'data/usda');
  console.log(`Reading ${dir}`);
  const { rows, skippedNoEnergy, skippedType } = await readUsda(dir);
  console.log(
    `Parsed ${rows.length} foods (skipped: ${skippedNoEnergy} without energy, ${skippedType} non-food rows)`,
  );

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  const now = new Date();
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((r) => ({
        ...r,
        sourceUrl: `https://fdc.nal.usda.gov/food-details/${r.sourceId}/nutrients`,
        fetchedAt: now,
      }));
      await db
        .insert(ingredient)
        .values(batch)
        .onConflictDoUpdate({
          target: [ingredient.source, ingredient.sourceId],
          set: {
            nameEn: sql`excluded.name_en`,
            kcal: sql`excluded.kcal`,
            proteinG: sql`excluded.protein_g`,
            carbG: sql`excluded.carb_g`,
            fatG: sql`excluded.fat_g`,
            fiberG: sql`excluded.fiber_g`,
            sodiumMg: sql`excluded.sodium_mg`,
            sourceUrl: sql`excluded.source_url`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
      process.stdout.write(`\rUpserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
    }
    process.stdout.write('\n');
    const [{ count }] = (
      await db.execute<{ count: string }>(
        sql`select count(*) from ingredient where source = 'usda'`,
      )
    ).rows;
    console.log(`Done. ingredient rows from USDA: ${count}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
