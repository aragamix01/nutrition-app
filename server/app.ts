import { desc, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { profile, weightLog } from '@/db/schema';
import { ACTIVITY_LEVELS, bangkokDate } from '@/src/lib/nutrition';
import { requireUser } from './auth';
import { getDb } from './db';
import { searchIngredients } from './ingredients';

function db() {
  const d = getDb();
  if (!d) throw new HTTPException(503, { message: 'DATABASE_URL is not set' });
  return d;
}

async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: z.prettifyError(parsed.error) });
  return parsed.data;
}

export const ProfileBody = z.object({
  sex: z.enum(['male', 'female']),
  birthYear: z.number().int().min(1900).max(2100),
  heightCm: z.number().min(50).max(260),
  activityLevel: z.union(ACTIVITY_LEVELS.map((v) => z.literal(v))),
  goal: z.enum(['lose', 'maintain', 'gain']),
  goalRate: z.number().min(-0.2).max(0.2),
  proteinGPerKg: z.number().min(0.5).max(4).default(1.8),
  fatPct: z.number().min(0.1).max(0.6).default(0.25),
});
export type ProfileBody = z.infer<typeof ProfileBody>;

export const WeightBody = z.object({
  date: z.iso.date().optional(),
  weightKg: z.number().min(20).max(400),
});

export const app = new Hono().basePath('/api');

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'internal error' }, 500);
});

app.get('/health', async (c) => {
  const d = getDb();
  if (!d) return c.json({ ok: true, db: 'not_configured' });
  try {
    await d.execute(sql`select 1`);
    return c.json({ ok: true, db: 'ok' });
  } catch {
    return c.json({ ok: false, db: 'error' }, 503);
  }
});

app.use('/*', requireUser);

app.get('/profile', async (c) => {
  const [row] = await db().select().from(profile).limit(1);
  const [latest] = await db().select().from(weightLog).orderBy(desc(weightLog.date)).limit(1);
  return c.json({ profile: row ?? null, weight: latest ?? null });
});

app.put('/profile', async (c) => {
  const p = await body(c.req.raw, ProfileBody);
  const values = { id: 1, ...p, updatedAt: new Date() };
  const [row] = await db()
    .insert(profile)
    .values(values)
    .onConflictDoUpdate({ target: profile.id, set: values })
    .returning();
  return c.json({ profile: row });
});

app.get('/weight', async (c) => {
  const from = c.req.query('from');
  const rows = await db()
    .select()
    .from(weightLog)
    .where(from ? sql`${weightLog.date} >= ${from}` : undefined)
    .orderBy(weightLog.date);
  return c.json({ weights: rows });
});

/** One entry per Bangkok day: logging twice on the same day replaces the value. */
app.post('/weight', async (c) => {
  const { date, weightKg } = await body(c.req.raw, WeightBody);
  const d = date ?? bangkokDate();
  const [row] = await db()
    .insert(weightLog)
    .values({ date: d, weightKg })
    .onConflictDoUpdate({ target: weightLog.date, set: { weightKg } })
    .returning();
  return c.json({ weight: row });
});

const SearchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

app.get('/ingredients/search', async (c) => {
  const parsed = SearchQuery.safeParse(c.req.query());
  if (!parsed.success) throw new HTTPException(400, { message: z.prettifyError(parsed.error) });
  const { q, limit } = parsed.data;
  return c.json({ ingredients: await searchIngredients(db(), q, limit) });
});
