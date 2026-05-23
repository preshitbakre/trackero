/**
 * Shared auth helper for e2e regression specs.
 *
 * Logs in once per worker via the API and caches the tokens at module
 * scope. Includes a short retry loop because the default backend
 * throttle (30 requests/60s) bites hard when several spec files run
 * back-to-back — same pattern as responsive.spec.ts. Bump the throttle
 * on the backend (THROTTLE_LIMIT=5000) for chunky local runs.
 */
import type { APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3001/api';
const SEED = { email: 'visualtest@trackero.local', password: 'Visualtest123!' };

export interface SeedAuth {
  accessToken: string;
  refreshToken: string;
  user: { id: number; email: string; displayName: string };
}

let cache: SeedAuth | null = null;

export async function loginSeed(request: APIRequestContext): Promise<SeedAuth> {
  if (cache) return cache;
  let lastErr = '';
  for (let i = 0; i < 6; i += 1) {
    const res = await request.post(`${API}/auth/login`, { data: SEED });
    if (res.ok()) {
      const data = (await res.json()).data;
      cache = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      };
      return cache;
    }
    lastErr = `${res.status()} ${(await res.text()).slice(0, 200)}`;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(
    `Seed login failed for ${SEED.email}: ${lastErr}. ` +
      'Verify the seed user exists (see docs/operator/seed-migrations-baseline.sql) ' +
      'and consider restarting the backend with THROTTLE_LIMIT=5000.',
  );
}
