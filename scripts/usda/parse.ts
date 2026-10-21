// Pure helpers for the USDA FoodData Central CSV import (SR Legacy / Foundation Foods).

/** Streaming RFC 4180 CSV parser: feed chunks, get complete rows back (quoted commas/newlines/"" escapes). */
export class CsvParser {
  private field = '';
  private row: string[] = [];
  private inQuotes = false;
  private pendingQuote = false;

  push(chunk: string): string[][] {
    const rows: string[][] = [];
    for (const ch of chunk) {
      if (this.inQuotes) {
        if (this.pendingQuote) {
          this.pendingQuote = false;
          if (ch === '"') {
            this.field += '"';
            continue;
          }
          this.inQuotes = false;
          // fall through: ch is handled as an unquoted character below
        } else if (ch === '"') {
          this.pendingQuote = true;
          continue;
        } else {
          this.field += ch;
          continue;
        }
      }
      if (ch === '"' && this.field === '') this.inQuotes = true;
      else if (ch === ',') this.endField();
      else if (ch === '\n') rows.push(this.endRow());
      else if (ch !== '\r') this.field += ch;
    }
    return rows;
  }

  /** Flush the last row when the input does not end with a newline. */
  end(): string[][] {
    if (this.pendingQuote) {
      this.pendingQuote = false;
      this.inQuotes = false;
    }
    return this.field !== '' || this.row.length ? [this.endRow()] : [];
  }

  private endField() {
    this.row.push(this.field);
    this.field = '';
  }

  private endRow(): string[] {
    this.endField();
    const r = this.row;
    this.row = [];
    return r;
  }
}

export function parseCsv(text: string): string[][] {
  const p = new CsvParser();
  return [...p.push(text), ...p.end()];
}

/** Maps a header row to column indexes, failing loudly if the file layout changed. */
export function columns<K extends string>(
  header: string[],
  names: readonly K[],
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const n of names) {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`CSV is missing column "${n}" (have: ${header.join(', ')})`);
    out[n] = i;
  }
  return out;
}

export type NutrientKey = 'kcal' | 'proteinG' | 'fatG' | 'carbG' | 'fiberG' | 'sodiumMg';

/**
 * Which nutrient.csv rows we want, matched by name + unit (never by hard-coded id).
 * Earlier names win: SR Legacy reports "Energy" in KCAL; Foundation Foods may only have the Atwater variants.
 */
const WANTED: Record<NutrientKey, { names: string[]; unit: string }> = {
  kcal: {
    names: ['Energy', 'Energy (Atwater General Factors)', 'Energy (Atwater Specific Factors)'],
    unit: 'KCAL',
  },
  proteinG: { names: ['Protein'], unit: 'G' },
  fatG: { names: ['Total lipid (fat)'], unit: 'G' },
  carbG: { names: ['Carbohydrate, by difference'], unit: 'G' },
  fiberG: { names: ['Fiber, total dietary'], unit: 'G' },
  sodiumMg: { names: ['Sodium, Na'], unit: 'MG' },
};

export type NutrientRef = { key: NutrientKey; priority: number };

/** nutrient id → which field it fills (and its priority among alternatives). */
export function resolveNutrientIds(nutrientCsv: string[][]): Map<string, NutrientRef> {
  const [header, ...rows] = nutrientCsv;
  const c = columns(header, ['id', 'name', 'unit_name'] as const);
  const map = new Map<string, NutrientRef>();
  for (const r of rows) {
    const name = r[c.name].trim();
    const unit = r[c.unit_name].trim().toUpperCase();
    for (const [key, w] of Object.entries(WANTED) as [
      NutrientKey,
      (typeof WANTED)[NutrientKey],
    ][]) {
      const priority = w.names.indexOf(name);
      if (priority >= 0 && unit === w.unit) map.set(r[c.id], { key, priority });
    }
  }
  const found = new Set([...map.values()].map((v) => v.key));
  const missing = (Object.keys(WANTED) as NutrientKey[]).filter((k) => !found.has(k));
  if (missing.length) throw new Error(`nutrient.csv has no match for: ${missing.join(', ')}`);
  return map;
}

export type FoodValues = Partial<Record<NutrientKey, { value: number; priority: number }>>;

/** Folds one food_nutrient row into the per-food accumulator, keeping the best-priority value. */
export function addNutrient(
  acc: Map<string, FoodValues>,
  fdcId: string,
  ref: NutrientRef,
  amount: number,
) {
  let v = acc.get(fdcId);
  if (!v) acc.set(fdcId, (v = {}));
  const cur = v[ref.key];
  if (!cur || ref.priority < cur.priority) v[ref.key] = { value: amount, priority: ref.priority };
}

export type IngredientRow = {
  source: 'usda';
  sourceId: string;
  nameEn: string;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number | null;
  sodiumMg: number | null;
};

/** Foods without energy are skipped; missing macros count as 0 (USDA omits them when absent). */
export function toIngredient(
  fdcId: string,
  description: string,
  v: FoodValues | undefined,
): IngredientRow | null {
  if (!v?.kcal) return null;
  const n = (k: NutrientKey) => v[k]?.value ?? null;
  return {
    source: 'usda',
    sourceId: fdcId,
    nameEn: description.trim(),
    kcal: v.kcal.value,
    proteinG: n('proteinG') ?? 0,
    carbG: n('carbG') ?? 0,
    fatG: n('fatG') ?? 0,
    fiberG: n('fiberG'),
    sodiumMg: n('sodiumMg'),
  };
}
