/**
 * T1.2 regression — ⌘K opens the command palette from any authenticated
 * page; Escape closes it; the empty-state copy uses the editorial voice.
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

test.describe('Phase 1 regression — ⌘K command palette', () => {
  test('Meta+K opens the palette; Escape closes it', async ({ page, request }) => {
    const { accessToken, refreshToken } = await loginSeed(request);

    await page.addInitScript(
      ({ access, refresh }) => {
        window.localStorage.setItem('accessToken', access);
        window.localStorage.setItem('refreshToken', refresh);
      },
      { access: accessToken, refresh: refreshToken },
    );

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // The palette's search input is the first thing rendered when mounted.
    const before = await page.locator('input[placeholder*="Search"]').count();
    expect(before, 'palette not mounted yet').toBe(0);

    await page.keyboard.press('Meta+k');
    const input = page.locator('input[placeholder*="Search"]');
    await expect(input).toBeVisible({ timeout: 2000 });

    // Phase 4: the empty-state copy now invites the user to type a key
    // like PROJ-12 or a command. Validates that the rebuilt palette
    // owns its own input and renders the new shell.
    await expect(page.locator('text=Type at least 2 characters')).toBeVisible({ timeout: 1500 });

    await page.keyboard.press('Escape');
    await expect(input).toBeHidden({ timeout: 1500 });
  });
});
