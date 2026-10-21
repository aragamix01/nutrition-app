// Thai FCD fallback client. Only runs when the user presses search; see README.md.
import { and, eq, gt, sql } from 'drizzle-orm';
import * as s from '@/db/schema';
import { toHit, type IngredientHit } from '../ingredients';
import { BadInputError, type AnyDb } from '../meals';
import {
  parseDetail,
  parseSearch,
  rankHits,
  searchTerm,
  ThaiFcdParseError,
  type SearchHit,
} from './parse';

const BASE = 'https://inmu.mahidol.ac.th/thaifcd';
const TIMEOUT_MS = 10_000;
const MIN_GAP_MS = 1_000;
const CACHE_DAYS = 30;

/** Food group letter → the site's food_group_id. */
export const GROUPS: Record<string, string> = {
  A: '70',
  B: '71',
  C: '73',
  D: '74',
  E: '75',
  F: '76',
  G: '77',
  H: '78',
  J: '79',
  K: '80',
  M: '81',
  N: '72',
  Q: '82',
  S: '83',
  T: '84',
  U: '85',
  Z: '69',
};

export class ThaiFcdError extends Error {
  constructor(
    message: string,
    public status: 502 | 504,
  ) {
    super(message);
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export const detailUrl = (id: string) =>
  `${BASE}/foodsearch/food_name_result?mode=food_group_result&selected_dbcode=STD&selected_id=${encodeURIComponent(id)}`;

/**
 * Reserves the next free 1-second slot in rate_limit('thaifcd') and waits for it, so concurrent
 * serverless invocations never hit the site faster than 1 request/second between them.
 */
async function throttle(db: AnyDb) {
  const res = await db.execute(sql`
    insert into rate_limit (key, window_start, count, last_request_at)
    values ('thaifcd', now(), 1, now())
    on conflict (key) do update set
      count = rate_limit.count + 1,
      last_request_at = greatest(now(), rate_limit.last_request_at + make_interval(secs => ${MIN_GAP_MS / 1000}))
    returning (extract(epoch from (last_request_at - clock_timestamp())) * 1000)::int as wait_ms
  `);
  const wait = Number((res.rows[0] as { wait_ms: number | string }).wait_ms);
  if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 5_000)));
}

async function get(db: AnyDb, url: string, fetcher: Fetcher): Promise<string> {
  await throttle(db);
  const contact = process.env.SCRAPER_CONTACT || 'not set';
  try {
    const res = await fetcher(url, {
      headers: {
        'user-agent': `nutrition-app/1.0 (personal, non-commercial use; contact: ${contact})`,
        accept: 'application/json, text/html;q=0.9',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok)
      throw new ThaiFcdError(`Thai FCD ตอบกลับ ${res.status} ลองใหม่ภายหลังหรือกรอกเอง`, 502);
    return await res.text();
  } catch (err) {
    if (err instanceof ThaiFcdError) throw err;
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new ThaiFcdError('Thai FCD ตอบช้าเกินไป ลองใหม่หรือกรอกเอง', 504);
    }
    throw new ThaiFcdError('ติดต่อ Thai FCD ไม่ได้ ลองใหม่หรือกรอกเอง', 502);
  }
}

const parseOr502 = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ThaiFcdParseError) {
      console.error('thaifcd parse error', err.message);
      throw new ThaiFcdError(
        'Thai FCD เปลี่ยนรูปแบบหน้าเว็บ อ่านข้อมูลไม่ได้ — กรอกค่าเองแทน',
        502,
      );
    }
    throw err;
  }
};

export type ThaiFcdResult = SearchHit & { imported: IngredientHit | null };

/** Search results, ranked for the full query. Cached 30 days per (word, group); imported items are flagged. */
export async function searchThaiFcd(
  db: AnyDb,
  query: string,
  group?: string,
  fetcher: Fetcher = fetch,
): Promise<ThaiFcdResult[]> {
  const term = searchTerm(query);
  if (!term) throw new BadInputError('Thai FCD ค้นได้เฉพาะชื่อภาษาอังกฤษ เช่น "fried rice"');
  const groupId = group ? GROUPS[group.toUpperCase()] : '';
  if (group && !groupId) throw new BadInputError(`unknown food group: ${group}`);

  const key = `thaifcd:search:${groupId}:${term}`;
  const [cached] = await db
    .select()
    .from(s.httpCache)
    .where(and(eq(s.httpCache.key, key), gt(s.httpCache.expiresAt, new Date())));
  let hits: SearchHit[];
  if (cached) {
    hits = cached.body as SearchHit[];
  } else {
    const url = `${BASE}/appassistant/get_json_food_name?food_group_id=${groupId}&term=${encodeURIComponent(term)}`;
    const body = await get(db, url, fetcher);
    hits = parseOr502(() => parseSearch(body));
    const expiresAt = new Date(Date.now() + CACHE_DAYS * 24 * 3600 * 1000);
    await db
      .insert(s.httpCache)
      .values({ key, body: hits, expiresAt })
      .onConflictDoUpdate({ target: s.httpCache.key, set: { body: hits, expiresAt } });
  }

  const ranked = rankHits(hits, query).slice(0, 20);
  const urls = ranked.map((h) => detailUrl(h.id));
  const imported = urls.length
    ? await db
        .select()
        .from(s.ingredient)
        .where(and(eq(s.ingredient.source, 'thaifcd'), sql`${s.ingredient.sourceUrl} in ${urls}`))
    : [];
  const byUrl = new Map(imported.map((r) => [r.sourceUrl, toHit(r)]));
  return ranked.map((h) => ({ ...h, imported: byUrl.get(detailUrl(h.id)) ?? null }));
}

/** Imports one item into `ingredient` (source 'thaifcd', source_id = Food Code). Never re-fetches an imported item. */
export async function importThaiFcd(
  db: AnyDb,
  hit: { id: string; name: string },
  fetcher: Fetcher = fetch,
): Promise<IngredientHit> {
  if (!/^\d+$/.test(hit.id)) throw new BadInputError('bad Thai FCD id');
  const url = detailUrl(hit.id);
  const [existing] = await db
    .select()
    .from(s.ingredient)
    .where(and(eq(s.ingredient.source, 'thaifcd'), eq(s.ingredient.sourceUrl, url)));
  if (existing) return toHit(existing);

  const fullUrl = `${url}&selected_name=${encodeURIComponent(hit.name)}&food_name=${encodeURIComponent(hit.name)}&food_group_id=&page_no=1&status=A`;
  const body = await get(db, fullUrl, fetcher);
  const d = parseOr502(() => parseDetail(body));
  const values = {
    nameEn: d.nameEn,
    nameTh: d.nameTh,
    kcal: d.kcal,
    proteinG: d.proteinG,
    carbG: d.carbG,
    fatG: d.fatG,
    fiberG: d.fiberG,
    sodiumMg: d.sodiumMg,
    isDish: d.isDish,
    sourceUrl: url,
    fetchedAt: new Date(),
  };
  const [row] = await db
    .insert(s.ingredient)
    .values({ source: 'thaifcd', sourceId: d.foodCode, ...values })
    .onConflictDoUpdate({ target: [s.ingredient.source, s.ingredient.sourceId], set: values })
    .returning();
  return toHit(row);
}
