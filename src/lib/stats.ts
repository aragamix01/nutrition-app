// Pure date-series helpers for summaries and charts (dates are Bangkok calendar days, YYYY-MM-DD).

const DAY = 24 * 3600 * 1000;

const toUtc = (date: string) => {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad date: ${date}`);
  return t;
};

export function addDays(date: string, n: number): string {
  return new Date(toUtc(date) + n * DAY).toISOString().slice(0, 10);
}

/** Inclusive list of days from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const start = toUtc(from);
  const end = toUtc(to);
  const out: string[] = [];
  for (let t = start; t <= end; t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY);
}

/** Calendar-window moving average: each point averages the readings in the `window` days ending on its date. */
export function movingAverage(
  points: { date: string; value: number }[],
  window = 7,
): { date: string; value: number; avg: number }[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p) => {
    const start = addDays(p.date, -(window - 1));
    const inWindow = sorted.filter((q) => q.date >= start && q.date <= p.date);
    return { ...p, avg: inWindow.reduce((a, q) => a + q.value, 0) / inWindow.length };
  });
}
