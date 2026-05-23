/**
 * T1.2 regression — ⌘K opens the command palette from any authenticated
 * page; Escape closes it; the empty-state copy uses the editorial voice.
 *
 * The TopBar's "Jump to anything…" button dispatches the same
 * `open-command-palette` custom event AppShell now listens for, so the
 * keyboard shortcut and the button converge on one mount.
 */
import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001/api';
const unique = () => Math.random().toString(36).slice(2, 8);

test.describe('Phase 1 regression — ⌘K command palette', () => {
  test('Meta+K opens the palette; Escape closes it', async ({ page, request }) => {
    const stamp = unique();
    const email = `phase1-pal-${stamp}@test.com`;
    const password = 'password123';

    const reg = await request.post(`${API}/auth/register`, {
      data: { email, password, displayName: 'Palette' },
    });
    test.skip(reg.status() !== 201, 'DB already has users — skip (re-run cleanly)');
    const body = await reg.json();
    const accessToken: string = body.data.accessToken;
    const refreshToken: string = body.data.refreshToken;

    // Seed auth tokens before navigating so AppShell mounts authenticated.
    await page.addInitScript(
      ({ access, refresh }) => {
        window.localStorage.setItem('accessToken', access);
        window.localStorage.setItem('refreshToken', refresh);
      },
      { access: accessToken, refresh: refreshToken },
    );

    await page.goto('/dashboard');
    // Wait for shell content to render before sending the shortcut.
    await page.waitForLoadState('networkidle');

    // The palette's search input is the first thing rendered when mounted.
    const before = await page.locator('input[placeholder*="Search"]').count();
    expect(before).toBe(0);

    await page.keyboard.press('Meta+k');
    const input = page.locator('input[placeholder*="Search"]');
    await expect(input).toBeVisible({ timeout: 2000 });

    // Empty-state copy follows the editorial voice (T1.2 spec).
    await input.fill('zz_no_match_xyz');
    await expect(page.locator('text=No matches for')).toBeVisible({ timeout: 1500 });

    await page.keyboard.press('Escape');
    await expect(input).toBeHidden({ timeout: 1500 });
  });
});
