import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CsvParser, parseCsv, resolveNutrientIds } from './parse';
import { readUsda } from './read';

const FIXTURES = fileURLToPath(new URL('./__fixtures__', import.meta.url));

describe('CsvParser', () => {
  it('handles quoted commas, escaped quotes, empty fields and CRLF', () => {
    expect(parseCsv('"a,b","say ""hi""",,x\r\n1,"",3,\n')).toEqual([
      ['a,b', 'say "hi"', '', 'x'],
      ['1', '', '3', ''],
    ]);
  });

  it('keeps newlines inside quotes', () => {
    expect(parseCsv('"line1\nline2",z')).toEqual([['line1\nline2', 'z']]);
  });

  it('works across arbitrary chunk boundaries', () => {
    const text = '"fdc_id","description"\n"1","Rice, ""white"""\n"2","Oil"\n';
    const p = new CsvParser();
    const rows = [...text].flatMap((ch) => p.push(ch)).concat(p.end());
    expect(rows).toEqual(parseCsv(text));
    expect(rows[1]).toEqual(['1', 'Rice, "white"']);
  });
});

describe('resolveNutrientIds', () => {
  it('matches by name and unit, ignoring kJ energy', () => {
    const map = resolveNutrientIds(
      parseCsv(
        '"id","name","unit_name"\n"1008","Energy","KCAL"\n"1062","Energy","kJ"\n"1003","Protein","G"\n' +
          '"1004","Total lipid (fat)","G"\n"1005","Carbohydrate, by difference","G"\n' +
          '"1079","Fiber, total dietary","G"\n"1093","Sodium, Na","MG"\n',
      ),
    );
    expect(map.get('1008')?.key).toBe('kcal');
    expect(map.has('1062')).toBe(false);
  });

  it('fails loudly when a nutrient is missing', () => {
    expect(() =>
      resolveNutrientIds(parseCsv('"id","name","unit_name"\n"1003","Protein","G"\n')),
    ).toThrow(/no match for: kcal/);
  });
});

describe('readUsda (fixtures)', () => {
  it('pivots food_nutrient into one row per food', async () => {
    const { rows, skippedNoEnergy } = await readUsda(FIXTURES);
    const byId = Object.fromEntries(rows.map((r) => [r.sourceId, r]));

    expect(byId['169756']).toEqual({
      source: 'usda',
      sourceId: '169756',
      nameEn: 'Rice, white, long-grain, regular, enriched, cooked',
      kcal: 130,
      proteinG: 2.69,
      carbG: 28.17,
      fatG: 0.28,
      fiberG: 0.4,
      sodiumMg: 1,
    });
    // Missing macros are 0, missing optional nutrients null.
    expect(byId['171413']).toMatchObject({
      kcal: 884,
      fatG: 100,
      proteinG: 0,
      carbG: 0,
      fiberG: null,
    });
    // Foundation food with only Atwater energy still imports.
    expect(byId['999002']).toMatchObject({ kcal: 143, proteinG: 12.4 });
    // Water has no energy row at all.
    expect(byId['999001']).toBeUndefined();
    expect(skippedNoEnergy).toBe(1);
    expect(rows).toHaveLength(4);
  });
});
