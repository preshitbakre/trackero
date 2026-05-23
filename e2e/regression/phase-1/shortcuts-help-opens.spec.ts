/**
 * T1.3 regression — `?` opens the shortcuts help modal, content is
 * driven by lib/keymap.ts, and Esc closes it.
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

test.describe('Phase 1 regression — ? shortcuts help', () => {
  test('pressing ? shows the help modal and Esc closes it', async ({ page, request }) => {
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

    // Click body away from any auto-focused input so '?' goes to window.
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    await page.keyboard.press('Shift+?');
    const modalTitle = page.locator('text=Keyboard shortcuts.');
    await expect(modalTitle).toBeVisible({ timeout: 2000 });

    // Sample of keymap-driven entries.
    await expect(page.locator('text=Open command palette')).toBeVisible();
    await expect(page.locator('text=Create item (in current project)')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modalTitle).toBeHidden({ timeout: 1500 });
  });
});
