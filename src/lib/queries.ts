'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ProfileBody } from '@/server/app';
import type { IngredientHit } from '@/server/ingredients';
import type { Dish, Meal, MealInput, MealType } from '@/server/meals';
import { api } from './api';
import { bangkokDate, type DailyTargets, type Nutrients } from './nutrition';

export type { Dish, IngredientHit, Meal, MealType };

export type ProfileRow = ProfileBody & { id: number; updatedAt: string };
export type WeightRow = { id: number; date: string; weightKg: number };
export type ProfileResponse = { profile: ProfileRow | null; weight: WeightRow | null };

export const useProfile = () =>
  useQuery({ queryKey: ['profile'], queryFn: () => api<ProfileResponse>('/profile') });

export const useMeals = (date: string) =>
  useQuery({
    queryKey: ['meals', date],
    queryFn: () => api<{ meals: Meal[]; totals: Nutrients }>(`/meals?date=${date}`),
    // The date is computed client-side; skip the prerender/hydration pass where it is still ''.
    enabled: date !== '',
  });

export const useDishes = (q = '') =>
  useQuery({
    queryKey: ['dishes', q],
    queryFn: () => api<{ dishes: Dish[] }>(`/dishes${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    placeholderData: (prev) => prev,
  });

export const useDish = (id: number | null) =>
  useQuery({
    queryKey: ['dish', id],
    queryFn: () => api<{ dish: Dish }>(`/dishes/${id}`),
    enabled: id != null,
  });

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const useIngredientSearch = (q: string) => {
  const term = useDebounced(q.trim());
  return useQuery({
    queryKey: ['ingredients', term],
    queryFn: () =>
      api<{ ingredients: IngredientHit[] }>(`/ingredients/search?q=${encodeURIComponent(term)}`),
    enabled: term.length > 0,
    placeholderData: (prev) => prev,
  });
};

/** Logs a meal and refreshes everything that shows totals or use counts. */
export function useLogMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: MealInput) => api<{ id: number }>('/meals', { method: 'POST', json: m }),
    onSuccess: () => {
      for (const k of ['meals', 'dishes', 'range']) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export function useDeleteMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/meals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      for (const k of ['meals', 'dishes', 'range']) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export type RangeSummary = {
  from: string;
  to: string;
  days: {
    date: string;
    kcal: number;
    proteinG: number;
    carbG: number;
    fatG: number;
    mealCount: number;
  }[];
  loggedDays: number;
  averages: { kcal: number; proteinG: number; carbG: number; fatG: number };
  targets: DailyTargets | null;
};

export const useRange = (from: string, to: string) =>
  useQuery({
    queryKey: ['range', from, to],
    queryFn: () => api<RangeSummary>(`/summary/range?from=${from}&to=${to}`),
    enabled: from !== '' && to !== '',
    placeholderData: (prev) => prev,
  });

export const useWeights = (from: string) =>
  useQuery({
    queryKey: ['weights', from],
    queryFn: () => api<{ weights: WeightRow[] }>(`/weight?from=${from}`),
    enabled: from !== '',
  });

export function useLogWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (weightKg: number) => api('/weight', { method: 'POST', json: { weightKg } }),
    onSuccess: () => {
      for (const k of ['weights', 'profile', 'range']) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

/** Guess the meal from the Bangkok clock. */
export function mealTypeNow(now = new Date()): MealType {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      hour12: false,
    }).format(now),
  );
  if (h < 10) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h < 17) return 'snack';
  return 'dinner';
}

export const today = () => bangkokDate();
