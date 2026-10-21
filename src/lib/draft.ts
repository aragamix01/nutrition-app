'use client';

// AI drafts waiting for review, one dish per Review screen. Kept in sessionStorage so a reload
// (or the LIFF browser re-rendering) doesn't lose them; never persisted beyond the tab.
import type { AnalyzeResult, DraftDish } from '@/server/analyze';
import type { MealType } from '@/server/meals';

export type { DraftDish };

type Stored = { result: AnalyzeResult; mealType: MealType };
const KEY = 'nutrition:ai-drafts';

export function saveDrafts(result: AnalyzeResult, mealType: MealType) {
  sessionStorage.setItem(KEY, JSON.stringify({ result, mealType } satisfies Stored));
}

export function loadDraft(
  index: number,
): { dish: DraftDish; notes: string; total: number; mealType: MealType } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const { result, mealType } = JSON.parse(raw) as Stored;
    const dish = result.dishes[index];
    return dish ? { dish, notes: result.notes, total: result.dishes.length, mealType } : null;
  } catch {
    return null;
  }
}

export function clearDrafts() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
}
