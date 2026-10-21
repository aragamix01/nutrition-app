// Pure nutrition math shared by the app and the server (no dependencies).

export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';

export const ACTIVITY_LEVELS = [1.2, 1.375, 1.55, 1.725, 1.9] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const GOAL_RATES: Record<Goal, number> = { lose: -0.15, maintain: 0, gain: 0.1 };

export const DEFAULT_PROTEIN_G_PER_KG = 1.8;
export const DEFAULT_FAT_PCT = 0.25;

export const TIME_ZONE = 'Asia/Bangkok';

/** Today's date in Bangkok as YYYY-MM-DD. */
export function bangkokDate(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now);
}

export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return Number(bangkokDate(now).slice(0, 4)) - birthYear;
}

/** Mifflin-St Jeor. */
export function bmr(p: { sex: Sex; weightKg: number; heightCm: number; age: number }): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

export function tdee(bmrKcal: number, activityLevel: number): number {
  return bmrKcal * activityLevel;
}

export type ProfileInput = {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  activityLevel: number;
  goalRate: number;
  proteinGPerKg?: number;
  fatPct?: number;
};

export type DailyTargets = {
  age: number;
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  /** True when TDEE × (1 + goalRate) fell below BMR and was raised to BMR for safety. */
  clampedToBmr: boolean;
};

export function dailyTargets(
  p: ProfileInput,
  weightKg: number,
  now: Date = new Date(),
): DailyTargets {
  const age = ageFromBirthYear(p.birthYear, now);
  const b = bmr({ sex: p.sex, weightKg, heightCm: p.heightCm, age });
  const t = tdee(b, p.activityLevel);
  const raw = t * (1 + p.goalRate);
  const kcal = Math.max(raw, b);
  const proteinG = weightKg * (p.proteinGPerKg ?? DEFAULT_PROTEIN_G_PER_KG);
  const fatG = (kcal * (p.fatPct ?? DEFAULT_FAT_PCT)) / 9;
  const carbG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);
  return { age, bmr: b, tdee: t, kcal, proteinG, carbG, fatG, clampedToBmr: raw < b };
}

export type Nutrients = {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number | null;
  sodiumMg: number | null;
};

export type Component = { per100: Nutrients; grams: number };

/** Σ (per-100 g value × grams ÷ 100) × portion. Optional nutrients stay null only if no component has them. */
export function sumComponents(components: Component[], portion = 1): Nutrients {
  const total: Nutrients = {
    kcal: 0,
    proteinG: 0,
    carbG: 0,
    fatG: 0,
    fiberG: null,
    sodiumMg: null,
  };
  for (const { per100, grams } of components) {
    const f = (grams / 100) * portion;
    total.kcal += per100.kcal * f;
    total.proteinG += per100.proteinG * f;
    total.carbG += per100.carbG * f;
    total.fatG += per100.fatG * f;
    if (per100.fiberG != null) total.fiberG = (total.fiberG ?? 0) + per100.fiberG * f;
    if (per100.sodiumMg != null) total.sodiumMg = (total.sodiumMg ?? 0) + per100.sodiumMg * f;
  }
  return total;
}
