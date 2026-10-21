import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

/**
 * Single-user auth: verify the LIFF ID token with LINE, then require `sub` to match the allowlist.
 * DEV_BYPASS_AUTH=true skips this — local development only, never in Production.
 */
export const requireUser = createMiddleware(async (c, next) => {
  if (process.env.DEV_BYPASS_AUTH === 'true' && process.env.VERCEL_ENV !== 'production') {
    return next();
  }

  const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const channelId = process.env.LINE_CHANNEL_ID;
  const allowed = process.env.ALLOWED_LINE_USER_ID;
  if (!token) throw new HTTPException(401, { message: 'missing token' });
  if (!channelId || !allowed) throw new HTTPException(500, { message: 'auth not configured' });

  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token, client_id: channelId }),
  });
  if (!res.ok) throw new HTTPException(401, { message: 'invalid token' });
  const { sub } = (await res.json()) as { sub?: string };
  if (sub !== allowed) throw new HTTPException(403, { message: 'forbidden' });

  await next();
});
