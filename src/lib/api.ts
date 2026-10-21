// fetch wrapper for /api/*. The LIFF ID token is attached once src/lib/liff.ts exists (phase 7).

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let getToken: () => Promise<string | null> = async () => null;

/** Set by the LIFF provider so every request carries `Authorization: Bearer <idToken>`. */
export function setTokenProvider(fn: () => Promise<string | null>) {
  getToken = fn;
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = await getToken();
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined && { 'content-type': 'application/json' }),
      ...(token && { authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  return data as T;
}
