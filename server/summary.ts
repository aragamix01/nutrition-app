// Daily and range summaries. Targets are computed live from the profile + latest weight (never stored).
import { and, desc, gte, lt, sql } from 'drizzle-orm';
import * as s from '@/db/schema';
import { dailyTargets, type DailyTargets, type Nutrients } from '@/src/lib/nutrition';
import { daysBetween, dateRange } from '@/src/lib/stats';
import { bangkokDayRange, BadInputError, listMeals, type AnyDb } from './meals';

export type DayTotals = {
  date: string;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  mealCount: number;
};

export async function currentTargets(db: AnyDb, now = new Date()): Promise<DailyTargets | null> {
  const [p] = await db.select().from(s.profile).limit(1);
  const [w] = await db.select().from(s.weightLog).orderBy(desc(s.weightLog.date)).limit(1);
  if (!p || !w) return null;
  return dailyTargets(p, w.weightKg, now);
}

export async function daySummary(db: AnyDb, date: string) {
  const { meals, totals } = await listMeals(db, date);
  return { date, totals, mealCount: meals.length, targets: await currentTargets(db) };
}

const MAX_RANGE_DAYS = 366;

/** One row per day in [from, to] (empty days are zeros) + averages over the days that have meals. */
export async function rangeSummary(db: AnyDb, from: string, to: string) {
  let span: number;
  try {
    span = daysBetween(from, to);
  } catch {
    throw new BadInputError('from/to must be YYYY-MM-DD');
  }
  if (span < 0) throw new BadInputError('from must not be after to');
  if (span >= MAX_RANGE_DAYS) throw new BadInputError(`range is limited to ${MAX_RANGE_DAYS} days`);

  const [start] = bangkokDayRange(from);
  const [, end] = bangkokDayRange(to);
  const day = sql<string>`to_char(${s.mealEntry.eatenAt} at time zone 'Asia/Bangkok', 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      date: day,
      kcal: sql<number>`sum(${s.mealEntry.kcal})`,
      proteinG: sql<number>`sum(${s.mealEntry.proteinG})`,
      carbG: sql<number>`sum(${s.mealEntry.carbG})`,
      fatG: sql<number>`sum(${s.mealEntry.fatG})`,
      mealCount: sql<number>`count(*)`,
    })
    .from(s.mealEntry)
    .where(and(gte(s.mealEntry.eatenAt, start), lt(s.mealEntry.eatenAt, end)))
    .groupBy(day);

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const days: DayTotals[] = dateRange(from, to).map((date) => {
    const r = byDate.get(date);
    return {
      date,
      kcal: Number(r?.kcal ?? 0),
      proteinG: Number(r?.proteinG ?? 0),
      carbG: Number(r?.carbG ?? 0),
      fatG: Number(r?.fatG ?? 0),
      mealCount: Number(r?.mealCount ?? 0),
    };
  });

  const logged = days.filter((d) => d.mealCount > 0);
  const avg = (k: keyof Omit<Nutrients, 'fiberG' | 'sodiumMg'>) =>
    logged.length ? logged.reduce((a, d) => a + d[k], 0) / logged.length : 0;

  return {
    from,
    to,
    days,
    loggedDays: logged.length,
    averages: {
      kcal: avg('kcal'),
      proteinG: avg('proteinG'),
      carbG: avg('carbG'),
      fatG: avg('fatG'),
    },
    targets: await currentTargets(db),
  };
}
