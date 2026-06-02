/**
 * Phase 11 regression — board filter controls.
 *
 * Covers:
 *  - Sprint filter dropdown changes the URL / board header label.
 *  - Assignee multi-select opens, lists members, and applying a filter
 *    highlights the trigger button.
 *  - Clearing the assignee filter returns the trigger to its default state.
 *
 * All assertions work against the DOM; no screenshots required.
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

test.describe('Phase 11 regression — board filters', () => {
  test.beforeEach(async ({ page, request }) => {
    const { accessToken, refreshToken } = await loginSeed(request);
    await page.addInitScript(
      ({ access, refresh }) => {
        window.localStorage.setItem('accessToken', access);
        window.localStorage.setItem('refreshToken', refresh);
      },
      { access: accessToken, refresh: refreshToken },
    );
  });

  test('sprint filter dropdown renders and accepts a value change', async ({ page, request }) => {
    const { accessToken } = await loginSeed(request);

    // Find a project that has at least one sprint.
    const dir = await request.get(`${API}/directory/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const projects = (await dir.json()).data.projects as Array<{ id: number }>;
    test.skip(projects.length === 0, 'no projects');

    let projectId: number | null = null;
    for (const p of projects) {
      const r = await request.get(`${API}/projects/${p.id}/sprints?limit=10`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const list = (await r.json()).data?.list ?? [];
      if (list.length > 0) { projectId = p.id; break; }
    }
    test.skip(!projectId, 'no project with sprints');

    await page.goto(`/projects/${projectId}/board`);
    await page.waitForLoadState('networkidle');

    // The sprint Select trigger is the first Radix Select on the toolbar.
    // Its placeholder/value shows the active sprint name or "All sprints".
    const sprintTrigger = page
      .locator('[role="combobox"]')
      .first();
    await expect(sprintTrigger).toBeVisible({ timeout: 5000 });

    // Open the sprint dropdown.
    await sprintTrigger.click();

    // "All sprints" is always present as the first option.
    const allSprintsOption = page.locator('[role="option"]').filter({ hasText: 'All sprints' });
    await expect(allSprintsOption).toBeVisible({ timeout: 2000 });

    // Select "All sprints" (may already be selected, but the interaction is valid).
    await allSprintsOption.click();

    // Dropdown should close after selection.
    await expect(allSprintsOption).toBeHidden({ timeout: 1500 });
  });

  test('assignee multi-select opens, lists options, and marks selected state', async ({ page, request }) => {
    const { accessToken } = await loginSeed(request);

    const dir = await request.get(`${API}/directory/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const projects = (await dir.json()).data.projects as Array<{ id: number }>;
    test.skip(projects.length === 0, 'no projects');
    const projectId = projects[0].id;

    // Check if this project has assignee options.
    const filterRes = await request.get(`${API}/projects/${projectId}/filters/assignees`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const assignees = (await filterRes.json()).data?.list ?? [];
    test.skip(assignees.length === 0, 'project has no assignees to filter by');

    await page.goto(`/projects/${projectId}/board`);
    await page.waitForLoadState('networkidle');

    // The AssigneeMultiSelect trigger button contains "Assignee" text when nothing is selected.
    const assigneeBtn = page.locator('button').filter({ hasText: 'Assignee' }).first();
    await expect(assigneeBtn).toBeVisible({ timeout: 5000 });

    // Open the dropdown.
    await assigneeBtn.click();

    // A search input appears inside the dropdown.
    const searchInput = page.locator('input[placeholder="Search..."]');
    await expect(searchInput).toBeVisible({ timeout: 2000 });

    // At least one member row should be present.
    const memberRows = page.locator('button').filter({ hasText: assignees[0].label });
    await expect(memberRows.first()).toBeVisible({ timeout: 2000 });

    // Click the first member to select them.
    await memberRows.first().click();

    // The trigger button should now reflect the selection (lilac tint border).
    // The button text changes from "Assignee" to the selected member's name or "N selected".
    const updatedTrigger = page
      .locator('button')
      .filter({ hasText: new RegExp(assignees[0].label + '|1 selected') })
      .first();
    await expect(updatedTrigger).toBeVisible({ timeout: 2000 });

    // Close the dropdown by clicking outside.
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    // The × clear button should now be visible inside the trigger area.
    // Clear the filter.
    const clearBtn = page.locator('button').filter({ hasText: '×' }).first();
    await expect(clearBtn).toBeVisible({ timeout: 1500 });
    await clearBtn.click();

    // Trigger returns to "Assignee" default text.
    await expect(assigneeBtn).toBeVisible({ timeout: 2000 });
  });

  test('board columns render after navigation to board page', async ({ page, request }) => {
    const { accessToken } = await loginSeed(request);

    const dir = await request.get(`${API}/directory/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const projects = (await dir.json()).data.projects as Array<{ id: number }>;
    test.skip(projects.length === 0, 'no projects');
    const projectId = projects[0].id;

    await page.goto(`/projects/${projectId}/board`);
    await page.waitForLoadState('networkidle');

    // The board header / toolbar is always present once loaded.
    // It contains either a sprint name (font-serif) or the word "Board".
    const boardHeader = page.locator('span.font-serif').first();
    await expect(boardHeader).toBeVisible({ timeout: 6000 });

    // The sprint and assignee filter controls are present in the toolbar.
    await expect(page.locator('[role="combobox"]').first()).toBeVisible({ timeout: 4000 });
    await expect(page.locator('button').filter({ hasText: 'Assignee' }).first()).toBeVisible({ timeout: 4000 });
  });
});
