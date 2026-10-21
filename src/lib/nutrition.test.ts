import { describe, expect, it } from 'vitest';
import {
  ageFromBirthYear,
  bangkokDate,
  bmr,
  dailyTargets,
  GOAL_RATES,
  sumComponents,
  tdee,
  type Nutrients,
} from './nutrition';

const now = new Date('2026-10-21T05:00:00Z');

describe('bangkokDate', () => {
  it('uses Asia/Bangkok, not UTC', () => {
    // 2026-10-21 18:30 UTC is already the 22nd in Bangkok (UTC+7).
    expect(bangkokDate(new Date('2026-10-21T18:30:00Z'))).toBe('2026-10-22');
    expect(bangkokDate(new Date('2026-10-21T16:59:00Z'))).toBe('2026-10-21');
  });
});

describe('ageFromBirthYear', () => {
  it('is current Bangkok year minus birth year', () => {
    expect(ageFromBirthYear(1993, now)).toBe(33);
    // New Year in Bangkok before it is in UTC.
    expect(ageFromBirthYear(1993, new Date('2026-12-31T17:30:00Z'))).toBe(34);
  });
});

describe('bmr', () => {
  it('Mifflin-St Jeor male', () => {
    expect(bmr({ sex: 'male', weightKg: 70, heightCm: 172, age: 33 })).toBe(1615);
  });
  it('Mifflin-St Jeor female', () => {
    expect(bmr({ sex: 'female', weightKg: 55, heightCm: 160, age: 30 })).toBe(1239);
  });
});

describe('tdee', () => {
  it('multiplies BMR by activity level', () => {
    expect(tdee(1615, 1.55)).toBeCloseTo(2503.25);
  });
});

describe('dailyTargets', () => {
  const base = { sex: 'male' as const, birthYear: 1993, heightCm: 172, activityLevel: 1.55 };

  it('matches the design sample (lose)', () => {
    const t = dailyTargets({ ...base, goalRate: GOAL_RATES.lose }, 70, now);
    expect(Math.round(t.bmr)).toBe(1615);
    expect(Math.round(t.tdee)).toBe(2503);
    expect(Math.round(t.kcal)).toBe(2128);
    expect(Math.round(t.proteinG)).toBe(126);
    expect(Math.round(t.fatG)).toBe(59);
    expect(Math.round(t.carbG)).toBe(273);
    expect(t.clampedToBmr).toBe(false);
  });

  it('macros add back up to the energy target', () => {
    const t = dailyTargets({ ...base, goalRate: GOAL_RATES.gain }, 70, now);
    expect(t.proteinG * 4 + t.carbG * 4 + t.fatG * 9).toBeCloseTo(t.kcal);
  });

  it('never targets below BMR', () => {
    const t = dailyTargets({ ...base, activityLevel: 1.2, goalRate: -0.2 }, 70, now);
    expect(t.kcal).toBe(t.bmr);
    expect(t.clampedToBmr).toBe(true);
  });

  it('honours custom protein and fat settings', () => {
    const t = dailyTargets({ ...base, goalRate: 0, proteinGPerKg: 2, fatPct: 0.3 }, 70, now);
    expect(t.proteinG).toBe(140);
    expect(t.fatG).toBeCloseTo((t.kcal * 0.3) / 9);
  });

  it('carb never goes negative', () => {
    const t = dailyTargets({ ...base, goalRate: 0, proteinGPerKg: 6, fatPct: 0.5 }, 120, now);
    expect(t.carbG).toBe(0);
  });
});

describe('sumComponents', () => {
  const rice: Nutrients = {
    kcal: 130,
    proteinG: 2.7,
    carbG: 28,
    fatG: 0.3,
    fiberG: 0.4,
    sodiumMg: 1,
  };
  const oil: Nutrients = {
    kcal: 884,
    proteinG: 0,
    carbG: 0,
    fatG: 100,
    fiberG: null,
    sodiumMg: null,
  };

  it('scales per-100 g values by grams', () => {
    const s = sumComponents([
      { per100: rice, grams: 200 },
      { per100: oil, grams: 10 },
    ]);
    expect(s.kcal).toBeCloseTo(260 + 88.4);
    expect(s.fatG).toBeCloseTo(0.6 + 10);
    expect(s.fiberG).toBeCloseTo(0.8);
  });

  it('applies the portion multiplier', () => {
    expect(sumComponents([{ per100: rice, grams: 100 }], 1.5).kcal).toBeCloseTo(195);
  });

  it('keeps optional nutrients null when nothing reports them', () => {
    const s = sumComponents([{ per100: oil, grams: 10 }]);
    expect(s.fiberG).toBeNull();
    expect(s.sodiumMg).toBeNull();
  });

  it('empty list is zero', () => {
    expect(sumComponents([]).kcal).toBe(0);
  });
});
