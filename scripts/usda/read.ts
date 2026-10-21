import { createReadStream, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addNutrient,
  columns,
  CsvParser,
  parseCsv,
  resolveNutrientIds,
  toIngredient,
  type FoodValues,
  type IngredientRow,
} from './parse';

/** Foundation Foods downloads also contain sample/sub-sample rows; keep only real foods. */
const KEEP_TYPES = new Set(['sr_legacy_food', 'foundation_food']);

/** Accepts the extracted folder itself or a parent holding one FoodData_Central_* folder. */
export function findCsvDir(dir: string): string {
  if (existsSync(join(dir, 'food.csv'))) return dir;
  const inner = readdirSync(dir, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && existsSync(join(dir, d.name, 'food.csv')),
  );
  if (inner.length === 1) return join(dir, inner[0].name);
  if (inner.length > 1) {
    throw new Error(
      `Several USDA folders in ${dir}; pass one: ${inner.map((d) => d.name).join(', ')}`,
    );
  }
  throw new Error(
    `No food.csv in ${dir}. Download SR Legacy CSV from fdc.nal.usda.gov and extract it there.`,
  );
}

async function* streamRows(file: string): AsyncGenerator<string[]> {
  const parser = new CsvParser();
  for await (const chunk of createReadStream(file, { encoding: 'utf8' })) {
    yield* parser.push(chunk as string);
  }
  yield* parser.end();
}

export type ReadResult = { rows: IngredientRow[]; skippedNoEnergy: number; skippedType: number };

export async function readUsda(dir: string): Promise<ReadResult> {
  const nutrients = resolveNutrientIds(parseCsv(readFileSync(join(dir, 'nutrient.csv'), 'utf8')));

  // food_nutrient.csv is the big one (hundreds of MB for some releases): stream it.
  const values = new Map<string, FoodValues>();
  let fn: Record<'fdc_id' | 'nutrient_id' | 'amount', number> | null = null;
  for await (const r of streamRows(join(dir, 'food_nutrient.csv'))) {
    if (!fn) {
      fn = columns(r, ['fdc_id', 'nutrient_id', 'amount'] as const);
      continue;
    }
    const ref = nutrients.get(r[fn.nutrient_id]);
    const amount = Number(r[fn.amount]);
    if (ref && r[fn.amount] !== '' && Number.isFinite(amount))
      addNutrient(values, r[fn.fdc_id], ref, amount);
  }

  const rows: IngredientRow[] = [];
  let skippedNoEnergy = 0;
  let skippedType = 0;
  let fc: Record<'fdc_id' | 'data_type' | 'description', number> | null = null;
  for await (const r of streamRows(join(dir, 'food.csv'))) {
    if (!fc) {
      fc = columns(r, ['fdc_id', 'data_type', 'description'] as const);
      continue;
    }
    if (!KEEP_TYPES.has(r[fc.data_type])) {
      skippedType++;
      continue;
    }
    const row = toIngredient(r[fc.fdc_id], r[fc.description], values.get(r[fc.fdc_id]));
    if (row) rows.push(row);
    else skippedNoEnergy++;
  }
  return { rows, skippedNoEnergy, skippedType };
}
