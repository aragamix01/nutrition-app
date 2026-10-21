import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Local dev database (server/dev-db.ts): load from node_modules instead of bundling its WASM.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
