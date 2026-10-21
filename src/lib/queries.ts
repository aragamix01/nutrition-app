'use client';

import { useQuery } from '@tanstack/react-query';
import type { ProfileBody } from '@/server/app';
import { api } from './api';

export type ProfileRow = ProfileBody & { id: number; updatedAt: string };
export type WeightRow = { id: number; date: string; weightKg: number };
export type ProfileResponse = { profile: ProfileRow | null; weight: WeightRow | null };

export const useProfile = () =>
  useQuery({ queryKey: ['profile'], queryFn: () => api<ProfileResponse>('/profile') });
