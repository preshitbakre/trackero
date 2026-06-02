/**
 * Phase 11 regression — keyboard shortcuts.
 *
 * Covers (per lib/keymap.ts + hooks/useKeyboardShortcuts.ts):
 *  - 'C' opens the create-item dialog.
 *  - 'B' navigates to the board page for the current project.
 *  - 'L' navigates to the backlog page for the current project.
 *  - Shortcuts are suppressed when an <input> has focus.
 *  - '?' opens the shortcuts help modal (from the existing Phase 1 surface).
 *
 * The hook attaches to `window` on every project sub-route; tests start
 * on the board page which always has a project context (useParams :id).
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

test.describe('Phase 11 regression — keyboard shortcuts', () => {
  let projectId: number;

  test.beforeEach(async ({ page, request }) => {
    const { accessToken, refreshToken } = await loginSeed(request);

    await page.addInitScript(
      ({ access, refresh }) => {
        window.localStorage.setItem('accessToken', access);
        window.localStorage.setItem('refreshToken', refresh);
      },
      { access: accessToken, refresh: refreshToken },
    );

    // Resolve a project once per test (re-using token from loginSeed).
    const dir = await request.get(`${API}/directory/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const projects = (await dir.json()).data.projects as Array<{ id: number }>;
    if (projects.length === 0) test.skip(true, 'no projects');
    projectId = projects[0].id;
  });

  test("pressing 'C' on the board opens the create-item dialog", async ({ page }) => {
    await page.goto(`/projects/${projectId}/board`);
    await page.waitForLoadState('networkidle');

    // Click somewhere neutral so focus is not inside an input.
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    // 'C' should fire the shortcut-create-item event which opens CreateItemDialog.
    await page.keyboard.press('c');

    // The dialog contains a title field with a "Title" placeholder.
    const titleInput = page.locator('input[placeholder*="Title"], input[name="title"]').first();
    await expect(titleInput).toBeVisible({ timeout: 3000 });

    // Close the dialog with Escape.
    await page.keyboard.press('Escape');
    await expect(titleInput).toBeHidden({ timeout: 2000 });
  });

  test("pressing 'B' navigates to the board page", async ({ page }) => {
    // Start on the backlog so we can confirm navigation to board.
    await page.goto(`/projects/${projectId}/backlog`);
    await page.waitForLoadState('networkidle');

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('b');

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/board`), { timeout: 3000 });
  });

  test("pressing 'L' navigates to the backlog page", async ({ page }) => {
    // Start on the board so we can confirm navigation to backlog.
    await page.goto(`/projects/${projectId}/board`);
    await page.waitForLoadState('networkidle');

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('l');

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/backlog`), { timeout: 3000 });
  });

  test('shortcuts are suppressed when an input element has focus', async ({ page }) => {
    await page.goto(`/projects/${projectId}/board`);
    await page.waitForLoadState('networkidle');

    // Open the assignee multi-select to get a focused <input>.
    const assigneeBtn = page.locator('button').filter({ hasText: 'Assignee' }).first();
    await expect(assigneeBtn).toBeVisible({ timeout: 5000 });
    await assigneeBtn.click();

    const searchInput = page.locator('input[placeholder="Search..."]');
    await expect(searchInput).toBeVisible({ timeout: 2000 });

    // 'B' while inside the search input must NOT navigate away.
    await searchInput.press('b');
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/board`));

    // 'L' while inside the search input must NOT navigate away.
    await searchInput.press('l');
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/board`));

    // Close the dropdown.
    await page.keyboard.press('Escape');
  });

  test("pressing '?' opens the shortcuts help modal", async ({ page }) => {
    await page.goto(`/projects/${projectId}/board`);
    await page.waitForLoadState('networkidle');

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Shift+?');

    const modalTitle = page.locator('text=Keyboard shortcuts.');
    await expect(modalTitle).toBeVisible({ timeout: 2000 });

    // Keymap-driven entries visible in the modal.
    await expect(page.locator('text=Create item (in current project)')).toBeVisible();
    await expect(page.locator('text=Go to Board (in current project)')).toBeVisible();
    await expect(page.locator('text=Go to Backlog (in current project)')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modalTitle).toBeHidden({ timeout: 1500 });
  });
});
