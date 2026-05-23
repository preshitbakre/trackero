/**
 * T0.7 + T0.10 regression — the work-item endpoint that the
 * notification bell deep-links to must carry the canonical contract:
 * `reporter.avatarUrl` (string|null) symmetric with assignee, and
 * `itemKey` shaped as ${prefix}-${itemNumber}. Backend integration
 * specs cover the unit-level shape; this e2e variant proves the live
 * HTTP server, response envelope, and middleware chain preserve the
 * contract end to end.
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

test.describe('Phase 0 regression — work-item detail contract', () => {
  test('GET /items/:id returns reporter.avatarUrl + prefixed itemKey', async ({ request }) => {
    const { accessToken: token } = await loginSeed(request);

    const projectsRes = await request.get(`${API}/projects?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const projects = (await projectsRes.json()).data.list as Array<{
      id: number;
      prefix: string;
    }>;
    test.skip(projects.length === 0, 'no projects in DB');

    // Walk projects to find one with at least one item.
    let chosen: { project: { id: number; prefix: string }; itemId: number } | null = null;
    for (const project of projects) {
      const itemsRes = await request.get(
        `${API}/projects/${project.id}/items?limit=5`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!itemsRes.ok()) continue;
      const items = (await itemsRes.json()).data.list as Array<{ id: number }>;
      if (items.length > 0) {
        chosen = { project, itemId: items[0].id };
        break;
      }
    }
    test.skip(!chosen, 'no project has work items');

    const detail = await request.get(
      `${API}/projects/${chosen!.project.id}/items/${chosen!.itemId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(detail.status()).toBe(200);
    const item = (await detail.json()).data;

    // T0.9 — itemKey shape.
    expect(item.itemKey, `itemKey shape ${chosen!.project.prefix}-\\d+`).toMatch(
      new RegExp(`^${chosen!.project.prefix}-\\d+$`),
    );

    // T0.10 — reporter projection includes avatarUrl alongside displayName.
    expect(item.reporter, 'every item has a reporter (NOT NULL FK)').toBeTruthy();
    expect(item.reporter).toHaveProperty('id');
    expect(item.reporter).toHaveProperty('displayName');
    expect(item.reporter).toHaveProperty('avatarUrl');
    // avatarUrl is string | null; assert the property exists with either.
    expect(['string', 'object']).toContain(typeof item.reporter.avatarUrl);
  });
});
