// Photo → draft meal. Nothing is saved here; the user reviews the draft first.
// Trust order: the user's own library recipe > database ingredients > the model's guesses.
import { z } from 'zod';
import { callGemini, buildPrompt, parseAiResult, type ModelCall } from './gemini';
import { searchIngredients, type IngredientHit } from './ingredients';
import { listDishes, type AnyDb } from './meals';

export const AnalyzeInput = z.object({
  /** Base64 without the data: prefix. ~1 MB of JPEG after client-side resizing. */
  image: z
    .string()
    .min(100)
    .max(1_400_000, 'รูปใหญ่เกิน 1 MB')
    .regex(/^[A-Za-z0-9+/=]+$/, 'image must be base64'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});
export type AnalyzeInput = z.input<typeof AnalyzeInput>;

export type DraftIngredient = {
  nameTh: string;
  grams: number;
  usdaQuery: string;
  thaiQuery: string;
  /** Best database match, or null when nothing was found (UI offers search / manual entry). */
  match: IngredientHit | null;
  alternatives: IngredientHit[];
};

export type DraftDish = {
  nameTh: string;
  source: 'library' | 'ai';
  dishId: number | null;
  portionMultiplier: number;
  confidence: number;
  ingredients: DraftIngredient[];
};

export type AnalyzeResult = { dishes: DraftDish[]; notes: string };

const LIBRARY_HINTS = 50;

async function matchIngredient(
  db: AnyDb,
  ing: { name_th: string; usda_query: string; thai_query: string; grams: number },
): Promise<DraftIngredient> {
  let hits = ing.usda_query ? await searchIngredients(db, ing.usda_query, 5) : [];
  // Thai name as a fallback: finds manual / Thai FCD ingredients saved with name_th.
  if (!hits.length) hits = await searchIngredients(db, ing.name_th, 5);
  return {
    nameTh: ing.name_th,
    grams: Math.round(ing.grams),
    usdaQuery: ing.usda_query,
    thaiQuery: ing.thai_query,
    match: hits[0] ?? null,
    alternatives: hits.slice(1),
  };
}

export async function analyzeImage(
  db: AnyDb,
  raw: AnalyzeInput,
  callModel: ModelCall = callGemini,
): Promise<AnalyzeResult> {
  const input = AnalyzeInput.parse(raw);
  const library = await listDishes(db, undefined, LIBRARY_HINTS);
  const prompt = buildPrompt(
    library.map((d) => ({ id: d.id, nameTh: d.nameTh, aliases: d.nameAliases })),
  );
  const ai = parseAiResult(
    await callModel({ data: input.image, mimeType: input.mimeType }, prompt),
  );
  const byId = new Map(library.map((d) => [d.id, d]));

  const dishes = await Promise.all(
    ai.dishes.map(async (d): Promise<DraftDish> => {
      const portion = Math.round(d.portion_multiplier * 10) / 10;
      const lib = d.matched_dish_id != null ? byId.get(d.matched_dish_id) : undefined;
      if (lib) {
        return {
          nameTh: lib.nameTh,
          source: 'library',
          dishId: lib.id,
          portionMultiplier: portion,
          confidence: d.confidence,
          ingredients: lib.components.map((c) => ({
            nameTh: c.ingredient.nameTh ?? c.ingredient.nameEn,
            grams: c.grams,
            usdaQuery: '',
            thaiQuery: '',
            match: c.ingredient,
            alternatives: [],
          })),
        };
      }
      return {
        nameTh: d.name_th,
        source: 'ai',
        dishId: null,
        // New dish: grams already describe what is on the plate.
        portionMultiplier: 1,
        confidence: d.confidence,
        ingredients: await Promise.all(d.ingredients.map((i) => matchIngredient(db, i))),
      };
    }),
  );

  return { dishes, notes: ai.notes };
}

/** GEMINI_MOCK=true outside production returns a canned answer (for trying the flow without a key). */
export async function modelForEnv(): Promise<ModelCall> {
  if (process.env.GEMINI_MOCK === 'true' && process.env.VERCEL_ENV !== 'production') {
    return (await import('./gemini')).mockGemini;
  }
  return callGemini;
}
