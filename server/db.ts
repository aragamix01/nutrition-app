import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { AnyDb } from './meals';
import * as schema from '@/db/schema';

export type Db = AnyDb;
export type DbKind = 'neon' | 'pglite' | null;

let opening: Promise<{ db: Db | null; kind: DbKind }> | null = null;

/**
 * Neon over HTTP when DATABASE_URL is set (no pooled sockets in serverless).
 * In `next dev` without DATABASE_URL: a local PGlite database in .pglite/ so the app works before Neon exists.
 */
export function getDb(): Promise<{ db: Db | null; kind: DbKind }> {
  return (opening ??= open());
}

async function open(): Promise<{ db: Db | null; kind: DbKind }> {
  const url = process.env.DATABASE_URL;
  if (url) return { db: drizzle(neon(url), { schema }), kind: 'neon' };
  if (process.env.NODE_ENV === 'development') {
    const { openDevDb } = await import('./dev-db');
    return { db: await openDevDb(), kind: 'pglite' };
  }
  return { db: null, kind: null };
}
