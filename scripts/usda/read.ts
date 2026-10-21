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

function foldersWithFoodCsv(dir: string, depth: number): string[] {
  if (existsSync(join(dir, 'food.csv'))) return [dir];
  if (depth === 0) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => foldersWithFoodCsv(join(dir, d.name), depth - 1));
}

/**
 * Accepts the extracted folder itself or any parent up to 3 levels above it
 * (the SR Legacy zip extracts as FoodData_Central_.../FoodData_Central_.../food.csv).
 */
export function findCsvDir(dir: string): string {
  const found = foldersWithFoodCsv(dir, 3);
  if (found.length === 1) return found[0];
  if (found.length > 1) {
    throw new Error(`Several USDA folders in ${dir}; pass one:\n  ${found.join('\n  ')}`);
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
