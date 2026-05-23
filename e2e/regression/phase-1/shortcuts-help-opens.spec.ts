/**
 * T1.3 regression — `?` opens the shortcuts help modal, content is
 * driven by lib/keymap.ts, and Esc closes it. Input-typing contexts
 * suppress the shortcut (verified separately by the unit-level guard
 * in `useKeyboardShortcuts`).
 */
import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001/api';
const unique = () => Math.random().toString(36).slice(2, 8);

test.describe('Phase 1 regression — ? shortcuts help', () => {
  test('pressing ? shows the help modal and Esc closes it', async ({ page, request }) => {
    const stamp = unique();
    const email = `phase1-help-${stamp}@test.com`;
    const password = 'password123';

    const reg = await request.post(`${API}/auth/register`, {
      data: { email, password, displayName: 'Help' },
    });
    test.skip(reg.status() !== 201, 'DB already has users — skip (re-run cleanly)');
    const { data } = await reg.json();

    await page.addInitScript(
      ({ access, refresh }) => {
        window.localStorage.setItem('accessToken', access);
        window.localStorage.setItem('refreshToken', refresh);
      },
      { access: data.accessToken, refresh: data.refreshToken },
    );

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Pressing the literal '?' character. The hook listens for e.key === '?'.
    await page.keyboard.press('Shift+/');
    const modalTitle = page.locator('text=Keyboard shortcuts.');
    await expect(modalTitle).toBeVisible({ timeout: 2000 });

    // Sample of keymap-driven entries.
    await expect(page.locator('text=Open command palette')).toBeVisible();
    await expect(page.locator('text=Create item (in current project)')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modalTitle).toBeHidden({ timeout: 1500 });
  });
});
