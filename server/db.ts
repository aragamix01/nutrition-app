import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from '@/db/schema';

export type Db = NeonHttpDatabase<typeof schema>;

let db: Db | null = null;

/** Lazily connects over Neon's HTTP driver (no pooled sockets in serverless). Null when DATABASE_URL is unset. */
export function getDb(): Db | null {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  db = drizzle(neon(url), { schema });
  return db;
}
