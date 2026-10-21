import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `npm run dev:local` builds into its own folder so it can run beside a normal `next dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Local dev database (server/dev-db.ts): load from node_modules instead of bundling its WASM.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
