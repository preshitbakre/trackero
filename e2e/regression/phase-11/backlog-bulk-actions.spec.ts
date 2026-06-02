/**
 * Phase 11 regression — backlog bulk actions.
 *
 * Covers (per BacklogPage.tsx):
 *  - Checkbox on each row selects it; bulk action bar appears.
 *  - Bar shows "N selected · N pts" summary.
 *  - "Delete" button opens a ConfirmDialog with the right copy.
 *  - Cancelling the confirm dialog dismisses it without deleting.
 *  - "Clear" button deselects all items and hides the bar.
 *
 * Tests create a throwaway task, interact with it, and clean up via
 * hard-delete so seed data is not polluted.
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

test.describe('Phase 11 regression — backlog bulk actions', () => {
  let accessToken: string;
  let projectId: number;

  test.beforeEach(async ({ page, request }) => {
    const tokens = await loginSeed(request);
    accessToken = tokens.accessToken;
    const { refreshToken } = tokens;

    await page.addInitScript(
      ({ access, refresh }) => {
        window.localStorage.setItem('accessToken', access);
        window.localStorage.setItem('refreshToken', refresh);
      },
      { access: accessToken, refresh: refreshToken },
    );

    // Find a project.
    const dir = await request.get(`${API}/directory/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const projects = (await dir.json()).data.projects as Array<{ id: number }>;
    test.skip(projects.length === 0, 'no projects');
    projectId = projects[0].id;
  });

  test('selecting a backlog item shows the bulk action bar', async ({ page, request }) => {
    // Create a throwaway task in the backlog (no sprint).
    const created = await request.post(`${API}/projects/${projectId}/items`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { itemType: 'task', title: `phase11 bulk probe ${Date.now()}` },
    });
    expect(created.status()).toBe(201);
    const itemId = (await created.json()).data.item.id;

    try {
      await page.goto(`/projects/${projectId}/backlog`);
      await page.waitForLoadState('networkidle');

      // Wait for at least one row to appear.
      const firstCheckbox = page
        .locator('input[type="checkbox"]')
        .first();
      await expect(firstCheckbox).toBeVisible({ timeout: 6000 });

      // Select the first visible item.
      await firstCheckbox.check();

      // Bulk action bar must appear.
      // The bar lives in a div[aria-live="polite"] and contains "selected".
      const bulkBar = page.locator('[aria-live="polite"]');
      await expect(bulkBar).toBeVisible({ timeout: 2000 });
      await expect(bulkBar).toContainText('selected');

      // Delete and Clear buttons are present.
      await expect(page.locator('button').filter({ hasText: 'Delete' })).toBeVisible();
      await expect(page.locator('button').filter({ hasText: 'Clear' })).toBeVisible();
    } finally {
      // Hard-delete the probe item regardless of test outcome.
      await request.delete(`${API}/projects/${projectId}/items/${itemId}?hard=true`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  });

  test('"Delete" bulk action opens a confirmation dialog; cancel dismisses it', async ({ page, request }) => {
    const created = await request.post(`${API}/projects/${projectId}/items`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { itemType: 'task', title: `phase11 bulk delete probe ${Date.now()}` },
    });
    expect(created.status()).toBe(201);
    const itemId = (await created.json()).data.item.id;

    try {
      await page.goto(`/projects/${projectId}/backlog`);
      await page.waitForLoadState('networkidle');

      const firstCheckbox = page.locator('input[type="checkbox"]').first();
      await expect(firstCheckbox).toBeVisible({ timeout: 6000 });
      await firstCheckbox.check();

      // Click the Delete button in the bulk bar.
      const deleteBtn = page
        .locator('[aria-live="polite"] button')
        .filter({ hasText: 'Delete' });
      await expect(deleteBtn).toBeVisible({ timeout: 2000 });
      await deleteBtn.click();

      // ConfirmDialog should appear with "Delete items" title.
      const dialogTitle = page.locator('text=Delete items');
      await expect(dialogTitle).toBeVisible({ timeout: 2000 });

      // The message mentions the item count.
      await expect(page.locator('text=/delete \\d+ item/')).toBeVisible({ timeout: 1500 });

      // Cancel — the dialog should close and items remain selected.
      await page.locator('button').filter({ hasText: 'Cancel' }).click();
      await expect(dialogTitle).toBeHidden({ timeout: 1500 });

      // The bulk bar is still shown (item still selected).
      await expect(page.locator('[aria-live="polite"]')).toBeVisible();
    } finally {
      await request.delete(`${API}/projects/${projectId}/items/${itemId}?hard=true`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  });

  test('"Clear" button deselects all and hides the bulk action bar', async ({ page, request }) => {
    const created = await request.post(`${API}/projects/${projectId}/items`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { itemType: 'task', title: `phase11 bulk clear probe ${Date.now()}` },
    });
    expect(created.status()).toBe(201);
    const itemId = (await created.json()).data.item.id;

    try {
      await page.goto(`/projects/${projectId}/backlog`);
      await page.waitForLoadState('networkidle');

      const firstCheckbox = page.locator('input[type="checkbox"]').first();
      await expect(firstCheckbox).toBeVisible({ timeout: 6000 });
      await firstCheckbox.check();

      // Bulk bar visible.
      const bulkBar = page.locator('[aria-live="polite"]');
      await expect(bulkBar).toBeVisible({ timeout: 2000 });

      // Click Clear.
      await page.locator('[aria-live="polite"] button').filter({ hasText: 'Clear' }).click();

      // Bar must disappear.
      await expect(bulkBar).toBeHidden({ timeout: 2000 });

      // Checkbox is unchecked.
      await expect(firstCheckbox).not.toBeChecked();
    } finally {
      await request.delete(`${API}/projects/${projectId}/items/${itemId}?hard=true`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  });

  test('selecting multiple items shows correct count in bulk bar', async ({ page, request }) => {
    // Create two probe tasks.
    const t1 = await request.post(`${API}/projects/${projectId}/items`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { itemType: 'task', title: `phase11 multi-select probe-1 ${Date.now()}` },
    });
    const t2 = await request.post(`${API}/projects/${projectId}/items`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { itemType: 'task', title: `phase11 multi-select probe-2 ${Date.now()}` },
    });
    expect(t1.status()).toBe(201);
    expect(t2.status()).toBe(201);
    const id1 = (await t1.json()).data.item.id;
    const id2 = (await t2.json()).data.item.id;

    try {
      await page.goto(`/projects/${projectId}/backlog`);
      await page.waitForLoadState('networkidle');

      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();
      test.skip(count < 2, 'fewer than 2 selectable rows visible');

      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();

      const bulkBar = page.locator('[aria-live="polite"]');
      await expect(bulkBar).toBeVisible({ timeout: 2000 });
      await expect(bulkBar).toContainText('2 selected');
    } finally {
      await request.delete(`${API}/projects/${projectId}/items/${id1}?hard=true`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await request.delete(`${API}/projects/${projectId}/items/${id2}?hard=true`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  });
});
