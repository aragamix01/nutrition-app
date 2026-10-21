import { handle } from 'hono/vercel';
import { app } from '@/server/app';

// All API routes live in one Hono app = one Vercel function.
export const runtime = 'nodejs';
export const maxDuration = 30;

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
