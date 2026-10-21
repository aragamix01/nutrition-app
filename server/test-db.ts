// Test helper: an in-process Postgres (PGlite) with the real migrations applied.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as schema from '@/db/schema';

export const repoPath = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

export async function createTestDb() {
  const client = new PGlite({ extensions: { pg_trgm } });
  const files = readdirSync(repoPath('drizzle'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const sqlText = readFileSync(repoPath(`drizzle/${f}`), 'utf8');
    for (const stmt of sqlText.split('--> statement-breakpoint')) {
      if (stmt.trim()) await client.exec(stmt);
    }
  }
  return drizzle({ client, schema });
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
