/**
 * T0.9 regression — board cards must return itemKey shaped as
 * `${projectPrefix}-${itemNumber}` to match every other surface
 * (work-item detail, search, comments, notifications).
 *
 * Logs in as the seed visualtest user via the shared helper, then
 * picks the first project with items on its board.
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

test.describe('Phase 0 regression — board itemKey prefix', () => {
  test('board cards include the project prefix in itemKey', async ({ request }) => {
    const { accessToken: token } = await loginSeed(request);

    const projectsRes = await request.get(`${API}/projects?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(projectsRes.status()).toBe(200);
    const projects = (await projectsRes.json()).data.list as Array<{
      id: number;
      prefix: string;
    }>;
    test.skip(projects.length === 0, 'no projects in DB');

    // Walk projects in order; the first one with cards is the target.
    let chosen: { project: { id: number; prefix: string }; cards: { itemKey: string }[] } | null = null;
    for (const project of projects) {
      const boardRes = await request.get(`${API}/projects/${project.id}/board`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!boardRes.ok()) continue;
      const board = await boardRes.json();
      const cards = board.data.columns.flatMap((c: { tasks: { itemKey: string }[] }) => c.tasks);
      if (cards.length > 0) {
        chosen = { project, cards };
        break;
      }
    }
    test.skip(!chosen, 'no project has board cards');

    const prefixRe = new RegExp(`^${chosen!.project.prefix}-\\d+$`);
    for (const card of chosen!.cards) {
      expect(card.itemKey, `itemKey matches ${prefixRe}`).toMatch(prefixRe);
    }
  });
});
