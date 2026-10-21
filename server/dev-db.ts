// Local development only: PGlite (Postgres in WASM) stored in .pglite/, migrated and seeded on first use.
// Never used when DATABASE_URL is set, and never in production builds.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import { createDish } from './meals';

// Approximate per-100 g values for trying the app before the USDA import. Not for real tracking.
const SEED: [nameTh: string, nameEn: string, kcal: number, p: number, c: number, f: number][] = [
  ['ข้าวสวย', 'Rice, white, cooked', 130, 2.7, 28.2, 0.3],
  ['ข้าวเหนียวนึ่ง', 'Rice, glutinous, cooked', 97, 2, 21.1, 0.2],
  ['เส้นก๋วยเตี๋ยว (ลวก)', 'Rice noodles, cooked', 108, 1.8, 24, 0.2],
  ['หมูสับ (สุก)', 'Pork, ground, cooked', 297, 25.7, 0, 20.8],
  ['หมูสามชั้น', 'Pork belly, raw', 518, 9.3, 0, 53],
  ['อกไก่ (สุก)', 'Chicken breast, roasted', 165, 31, 0, 3.6],
  ['สะโพกไก่ (สุก)', 'Chicken thigh, roasted', 209, 26, 0, 10.9],
  ['กุ้ง (สุก)', 'Shrimp, cooked', 99, 24, 0.2, 0.3],
  ['ไข่ไก่', 'Egg, whole, raw', 143, 12.6, 0.7, 9.5],
  ['ไข่ดาว', 'Egg, whole, fried', 196, 13.6, 0.8, 14.8],
  ['เต้าหู้แข็ง', 'Tofu, firm', 144, 17.3, 2.8, 8.7],
  ['น้ำมันพืช', 'Oil, vegetable', 884, 0, 0, 100],
  ['น้ำตาลทราย', 'Sugar, granulated', 387, 0, 100, 0],
  ['น้ำปลา', 'Fish sauce', 35, 5.1, 3.6, 0],
  ['ซอสหอยนางรม', 'Oyster sauce', 51, 1.4, 10.9, 0.3],
  ['กะทิ', 'Coconut milk, canned', 197, 2, 2.8, 21.3],
  ['ใบกะเพรา', 'Holy basil, fresh', 23, 3.2, 2.7, 0.6],
  ['กระเทียม', 'Garlic, raw', 149, 6.4, 33.1, 0.5],
  ['พริก', 'Chili pepper, red, raw', 40, 1.9, 8.8, 0.4],
  ['ผักบุ้ง', 'Water spinach, cooked', 20, 2.1, 3.1, 0.2],
  ['แตงกวา', 'Cucumber, raw', 15, 0.7, 3.6, 0.1],
  ['กล้วยหอม', 'Banana, raw', 89, 1.1, 22.8, 0.3],
  ['นมสด', 'Milk, whole', 61, 3.2, 4.8, 3.3],
  ['นมข้นหวาน', 'Milk, condensed, sweetened', 321, 7.9, 54.4, 8.7],
  ['กาแฟดำ', 'Coffee, brewed', 1, 0.1, 0, 0],
];

export async function openDevDb() {
  const client = new PGlite({ dataDir: '.pglite', extensions: { pg_trgm } });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: 'drizzle' });

  const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from ingredient`))
    .rows;
  if (n === 0) {
    const rows = await db
      .insert(schema.ingredient)
      .values(
        SEED.map(([nameTh, nameEn, kcal, proteinG, carbG, fatG], i) => ({
          source: 'manual' as const,
          sourceId: `dev-seed-${i}`,
          nameTh,
          nameEn,
          kcal,
          proteinG,
          carbG,
          fatG,
        })),
      )
      .returning({ id: schema.ingredient.id, nameTh: schema.ingredient.nameTh });
    const id = (th: string) => rows.find((r) => r.nameTh === th)!.id;
    await createDish(db, {
      nameTh: 'ข้าวกะเพราหมูสับไข่ดาว',
      nameAliases: ['กะเพราหมูสับ'],
      components: [
        { ingredientId: id('ข้าวสวย'), grams: 180 },
        { ingredientId: id('หมูสับ (สุก)'), grams: 80 },
        { ingredientId: id('ไข่ดาว'), grams: 50 },
        { ingredientId: id('น้ำมันพืช'), grams: 15 },
        { ingredientId: id('ซอสหอยนางรม'), grams: 10 },
        { ingredientId: id('ใบกะเพรา'), grams: 10 },
      ],
    });
    await createDish(db, {
      nameTh: 'โจ๊กหมูใส่ไข่',
      components: [
        { ingredientId: id('ข้าวสวย'), grams: 120 },
        { ingredientId: id('หมูสับ (สุก)'), grams: 40 },
        { ingredientId: id('ไข่ไก่'), grams: 50 },
      ],
    });
    console.log('[dev-db] seeded local PGlite with sample ingredients and 2 dishes');
  }
  return db;
}
