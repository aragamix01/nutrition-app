import { sql } from 'drizzle-orm';
import type { AnyDb } from './meals';

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`rate limited, retry in ${retryAfterSeconds}s`);
  }
}

/**
 * Fixed-window counter in the `rate_limit` table (serverless instances share no memory).
 * One atomic upsert: starts a new window when the old one expired, otherwise increments.
 */
export async function hitRateLimit(db: AnyDb, key: string, limit: number, windowSeconds: number) {
  const res = await db.execute(sql`
    insert into rate_limit (key, window_start, count, last_request_at)
    values (${key}, now(), 1, now())
    on conflict (key) do update set
      window_start = case when rate_limit.window_start <= now() - make_interval(secs => ${windowSeconds})
                          then now() else rate_limit.window_start end,
      count = case when rate_limit.window_start <= now() - make_interval(secs => ${windowSeconds})
                   then 1 else rate_limit.count + 1 end,
      last_request_at = now()
    returning count, extract(epoch from (window_start + make_interval(secs => ${windowSeconds}) - now()))::int as retry
  `);
  const row = res.rows[0] as { count: number | string; retry: number | string };
  if (Number(row.count) > limit) throw new RateLimitError(Math.max(1, Number(row.retry)));
}
