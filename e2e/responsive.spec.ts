/**
 * Responsive visual smoke tests.
 *
 * For every breakpoint × route combination:
 *  1. Authenticate via API once per worker (avoids rate-limited UI logins).
 *  2. Inject the auth tokens into localStorage before page navigation.
 *  3. Navigate to the route and wait for it to settle.
 *  4. Assert no element overflows the viewport width and no horizontal scrollbar
 *     is present on <body> / <html>.
 *  5. Capture a screenshot under test-results/responsive/.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const API = 'http://localhost:3001/api';
const TEST_USER = { email: 'visualtest@trackero.local', password: 'Visualtest123!' };

const BREAKPOINTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const OUTPUT_DIR = path.join('test-results', 'responsive');

interface AuthTokens { accessToken: string; refreshToken: string; user: any; }
interface ProjectRef { id: number; prefix: string; name: string; }

let authCache: AuthTokens | null = null;
let projectCache: ProjectRef | null = null;

async function getAuth(request: APIRequestContext): Promise<AuthTokens> {
  if (authCache) return authCache;
  // Try a few times to absorb rate-limit blips that may linger from earlier runs.
  let lastError = '';
  for (let i = 0; i < 6; i++) {
    const res = await request.post(`${API}/auth/login`, { data: TEST_USER });
    if (res.ok()) {
      const data = (await res.json()).data;
      authCache = { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user };
      return authCache;
    }
    lastError = `${res.status()} ${await res.text()}`.slice(0, 200);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Could not authenticate visualtest@trackero.local: ${lastError}`);
}

async function getProject(request: APIRequestContext): Promise<ProjectRef | null> {
  if (projectCache) return projectCache;
  const { accessToken } = await getAuth(request);
  // One short retry past a transient throttle blip. If the backend's default
  // `THROTTLE_LIMIT` (30/60s) is in effect, longer retries just compound the
  // problem — bump THROTTLE_LIMIT on the backend instead. See e2e/README.md.
  for (let i = 0; i < 2; i++) {
    const res = await request.get(`${API}/projects?limit=1`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok()) {
      const list = (await res.json()).data?.list ?? [];
      projectCache = list[0] ?? null;
      return projectCache;
    }
    if (res.status() !== 429) break;
    await new Promise((r) => setTimeout(r, 8_000));
  }
  return null;
}

async function authenticate(page: Page, request: APIRequestContext) {
  const tokens = await getAuth(request);
  await page.addInitScript((t) => {
    localStorage.setItem('accessToken', t.accessToken);
    localStorage.setItem('refreshToken', t.refreshToken);
  }, tokens);
  // Intercept /auth/me — every fresh page mount calls it, which burns the
  // per-IP throttle window across a multi-route suite. Serve the cached user.
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, code: 'S-0001', data: tokens.user, message: 'ok', errors: null, validationErrors: null }),
    });
  });
}

async function settle(page: Page) {
  await Promise.race([
    page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => null),
    page.waitForTimeout(2500),
  ]);
}

/** Fail loudly if a test that should be authenticated landed on /login.
 *  Otherwise no-overflow checks pass trivially and we miss real bugs. */
async function ensureAuthenticatedPage(page: Page, expectedPath: string) {
  await new Promise((r) => setTimeout(r, 600)); // let any redirect settle
  const url = page.url();
  if (url.includes('/login') && !expectedPath.includes('/login')) {
    throw new Error(`Auth fell through: ${expectedPath} redirected to ${url} — backend likely throttled (THROTTLE_LIMIT). Bump it or wait.`);
  }
}

async function assertNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const vw = window.innerWidth;

    /** Element is inside something that scrolls horizontally → not a real overflow. */
    const insideScroller = (el: Element): boolean => {
      let cur: Element | null = el.parentElement;
      while (cur && cur !== document.body) {
        const cs = getComputedStyle(cur);
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true;
        cur = cur.parentElement;
      }
      return false;
    };

    let widest: { tag: string; cls: string; w: number; vw: number; text: string } | null = null;
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || r.width <= 8) return;
      if (insideScroller(el)) return; // Inside a scroll container — intentional.

      // Skip fixed/absolute drawers/menus that intentionally sit off-screen.
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'absolute') {
        if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return;
        if ((el as HTMLElement).offsetParent === null && cs.position !== 'fixed') return;
      }

      const overshoot = r.right - vw;
      if (!widest || overshoot > widest.w - widest.vw) {
        widest = {
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 120),
          w: Math.round(r.right),
          vw,
          text: (el.textContent || '').trim().slice(0, 40),
        };
      }
    });
    return {
      bodyScroll: body.scrollWidth - body.clientWidth,
      rootScroll: root.scrollWidth - root.clientWidth,
      widest,
    };
  });

  expect.soft(overflow.bodyScroll, `${label}: body horizontal overflow`).toBeLessThanOrEqual(1);
  expect.soft(overflow.rootScroll, `${label}: root horizontal overflow`).toBeLessThanOrEqual(1);
  expect.soft(overflow.widest, `${label}: element wider than viewport: ${JSON.stringify(overflow.widest)}`).toBeNull();
}

test.describe('Responsive smoke', () => {
  test.beforeAll(async () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const bp of BREAKPOINTS) {
    test.describe(`${bp.name} (${bp.width}x${bp.height})`, () => {
      test.use({ viewport: { width: bp.width, height: bp.height } });

      test('login page has no overflow', async ({ page }) => {
        await page.goto('/login');
        await settle(page);
        await assertNoOverflow(page, `${bp.name} /login`);
        await page.screenshot({ path: path.join(OUTPUT_DIR, `${bp.name}-login.png`), fullPage: false });
      });

      test('dashboard has no overflow', async ({ page, request }) => {
        await authenticate(page, request);
        await page.goto('/dashboard');
        await settle(page);
        await ensureAuthenticatedPage(page, '/dashboard');
        await assertNoOverflow(page, `${bp.name} /dashboard`);
        await page.screenshot({ path: path.join(OUTPUT_DIR, `${bp.name}-dashboard.png`), fullPage: false });
      });

      test('project pages have no overflow', async ({ page, request }) => {
        // 7 routes × ~3-4s each + throttle drain = >30s default; raise the budget.
        test.setTimeout(120_000);
        const project = await getProject(request);
        if (!project) test.skip(true, 'no project available');
        await authenticate(page, request);
        const subRoutes = ['board', 'backlog', 'sprints', 'epics', 'stories', 'charts', 'settings'];
        for (const sub of subRoutes) {
          const target = `/projects/${project!.id}/${sub}`;
          await page.goto(target);
          await settle(page);
          await ensureAuthenticatedPage(page, target);
          await assertNoOverflow(page, `${bp.name} ${target}`);
          await page.screenshot({ path: path.join(OUTPUT_DIR, `${bp.name}-${sub}.png`), fullPage: false });
          // Drain the per-IP throttle window between navigations.
          await page.waitForTimeout(1500);
        }
      });
    });
  }
});
