import { sql, type SQL } from 'drizzle-orm';

/** Anything with drizzle's `execute` (Neon HTTP in the app, PGlite in tests). */
export type SqlRunner = { execute: (query: SQL) => Promise<{ rows: unknown[] }> };

export type IngredientHit = {
  id: number;
  source: 'usda' | 'thaifcd' | 'manual';
  nameEn: string;
  nameTh: string | null;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number | null;
  sodiumMg: number | null;
  isDish: boolean;
};

/**
 * English prefix query for the tsvector column: "rice white cook" → 'rice & white & cook:*',
 * so results show up while typing. Null when the query has no latin words (e.g. Thai only).
 */
export function prefixTsQuery(q: string): string | null {
  const words = q.toLowerCase().match(/[a-z0-9]+/g);
  if (!words) return null;
  return words.map((w, i) => (i === words.length - 1 ? `${w}:*` : w)).join(' & ');
}

/** word_similarity cut-off: "chiken breast" vs a long USDA chicken name scores ~0.5, unrelated foods < 0.35. */
const FUZZY_MIN = 0.45;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Top matches across English full-text search, trigram similarity (typos, Thai names) and substring.
 * Shorter names and often-used ingredients rank higher, so "rice white cooked" prefers the plain entry.
 */
export async function searchIngredients(
  db: SqlRunner,
  q: string,
  limit = 10,
): Promise<IngredientHit[]> {
  const term = q.trim();
  if (!term) return [];
  const tsq = prefixTsQuery(term);
  const query = tsq ? sql`to_tsquery('english', ${tsq})` : sql`null::tsquery`;
  const like = `%${escapeLike(term)}%`;

  // Rows containing every word (full-text) always outrank fuzzy-only matches; within each group,
  // closer spelling, Thai-name hits, frequent use and shorter names win.
  const { rows } = await db.execute(sql`
    with q as (select ${query} as tsq),
    scored as (
      select i.*,
        coalesce(q.tsq is not null and i.search @@ q.tsq, false) as fts,
        greatest(word_similarity(${term}, i.name_en), word_similarity(${term}, coalesce(i.name_th, ''))) as wsim,
        greatest(similarity(i.name_en, ${term}), similarity(coalesce(i.name_th, ''), ${term})) as sim,
        coalesce(i.name_en ilike ${like} or i.name_th ilike ${like}, false) as sub,
        coalesce(i.name_th ilike ${like}, false) as sub_th
      from ingredient i, q
    )
    select id, source, name_en, name_th, kcal, protein_g, carb_g, fat_g, fiber_g, sodium_mg, is_dish
    from scored
    where fts or sub or wsim >= ${FUZZY_MIN}
    order by
      (case when fts then 1 else 0 end)
      + sim
      + (case when sub_th then 0.5 else 0 end)
      + ln(1 + use_count) * 0.1
      - length(name_en) / 400.0
      desc,
      id
    limit ${Math.min(Math.max(limit, 1), 20)}
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    source: r.source as IngredientHit['source'],
    nameEn: r.name_en as string,
    nameTh: (r.name_th as string | null) ?? null,
    kcal: Number(r.kcal),
    proteinG: Number(r.protein_g),
    carbG: Number(r.carb_g),
    fatG: Number(r.fat_g),
    fiberG: r.fiber_g == null ? null : Number(r.fiber_g),
    sodiumMg: r.sodium_mg == null ? null : Number(r.sodium_mg),
    isDish: Boolean(r.is_dish),
  }));
}
