// Parsers for Thai FCD responses. See README.md for the formats.

export class ThaiFcdParseError extends Error {}

export type SearchHit = { id: string; name: string; dbcode: string };

const stripBom = (s: string) => s.replace(/^\uFEFF+/, '');

export function parseSearch(body: string): SearchHit[] {
  let data: unknown;
  try {
    data = JSON.parse(stripBom(body).trim() || '[]');
  } catch {
    throw new ThaiFcdParseError('search response is not JSON');
  }
  if (!Array.isArray(data)) throw new ThaiFcdParseError('search response is not a list');
  return data
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      id: String(x.id ?? ''),
      name: String(x.name ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      dbcode: String(x.dbcode ?? 'STD'),
    }))
    .filter((x) => x.id && x.name);
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** The single word sent to the site (it matches one substring): the longest one, which is usually the most specific. */
export function searchTerm(query: string): string | null {
  const w = words(query).filter((x) => x.length >= 2);
  if (!w.length) return null;
  return w.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Rank the site's matches for the full query: more query words (as word prefixes) first, then shorter names. */
export function rankHits(hits: SearchHit[], query: string): SearchHit[] {
  const q = words(query);
  const score = (h: SearchHit) => {
    const name = words(h.name);
    return q.filter((w) => name.some((n) => n.startsWith(w))).length;
  };
  return hits
    .map((h) => ({ h, s: score(h) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.h.name.length - b.h.name.length)
    .map((x) => x.h);
}

/** Thai FCD value cell → number. "-"/NA → null (not analysed); ND/Tr → 0 (not detected / trace). */
export function parseValue(raw: string): number | null {
  const v = raw.replace(/&nbsp;/g, ' ').trim();
  if (!v || v === '-' || /^(n\/?a)$/i.test(v)) return null;
  if (/^(nd|tr|trace)\.?$/i.test(v)) return 0;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function headerField(html: string, label: string): string | null {
  const m = new RegExp(`${label}:\\s*</div>\\s*<div[^>]*>([\\s\\S]*?)</div>`).exec(html);
  if (!m) return null;
  const v = decode(m[1]);
  return v && v !== '-' ? v : null;
}

export type ThaiFcdItem = {
  foodCode: string;
  group: string;
  nameTh: string | null;
  nameEn: string;
  /** All per 100 g edible portion. */
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number | null;
  sodiumMg: number | null;
  /** Group T = mixed ready-to-eat dishes: a whole plate as one "ingredient". */
  isDish: boolean;
  /** Values were per 100 mL in the source and were converted with the density. */
  convertedFromMl: boolean;
};

export function parseDetail(body: string): ThaiFcdItem {
  const html = stripBom(body);
  const foodCode = headerField(html, 'Food Code');
  const nameEn = headerField(html, 'English name');
  if (!foodCode || !nameEn)
    throw new ThaiFcdParseError('detail page has no Food Code / English name');
  const nameTh = headerField(html, 'Thai name');

  const tbody = /<tbody[^>]*id="tbody_food_nutrients"[^>]*>([\s\S]*?)<\/tbody>/.exec(html)?.[1];
  if (!tbody) throw new ThaiFcdParseError('detail page has no nutrient table');
  const rows = new Map<string, number | null>();
  for (const tr of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => decode(c[1]));
    if (cells.length >= 3) rows.set(cells[0].toLowerCase(), parseValue(cells[2]));
  }
  const get = (name: string) => rows.get(name.toLowerCase()) ?? null;

  let kcal = get('Energy, by calculation') ?? get('Total energy - by calculation');
  if (kcal == null) throw new ThaiFcdParseError(`no energy value for ${foodCode}`);
  let proteinG = get('Protein, total') ?? 0;
  let fatG = get('Fat, total') ?? 0;
  let fiberG = get('Dietary fibre');
  const available = get('Carbohydrate, available');
  // "total" is by difference (includes fibre), like USDA; rebuild it when only "available" is given.
  let carbG = get('Carbohydrate, total') ?? (available != null ? available + (fiberG ?? 0) : 0);
  let sodiumMg = get('Sodium');

  const perMl = /per\s*100\s*ml|ต่อ\s*100\s*มล/i.test(`${nameEn} ${nameTh ?? ''}`);
  if (perMl) {
    const density = get('Density');
    if (!density) throw new ThaiFcdParseError(`${foodCode} is per 100 mL and has no density`);
    const k = 1 / density;
    kcal *= k;
    proteinG *= k;
    fatG *= k;
    carbG *= k;
    fiberG = fiberG == null ? null : fiberG * k;
    sodiumMg = sodiumMg == null ? null : sodiumMg * k;
  }

  const group = /^[A-Z]+/.exec(foodCode)?.[0] ?? '';
  return {
    foodCode,
    group,
    nameTh,
    nameEn,
    kcal,
    proteinG,
    carbG,
    fatG,
    fiberG,
    sodiumMg,
    isDish: group === 'T',
    convertedFromMl: perMl,
  };
}
