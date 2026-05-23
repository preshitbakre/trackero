/**
 * T0.11 — Phase 0 regression e2e.
 *
 * T0.9 end-to-end: hitting the real backend, the board endpoint must
 * return prefixed itemKeys for every card.
 *
 * Uses Playwright's request fixture for an HTTP-level test — this is
 * sufficient because itemKey is in the response shape, not a
 * browser-rendered string. The browser-rendering equivalent of this
 * assertion is covered by `responsive.spec.ts` at the board route.
 */
import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001/api';
const unique = () => Math.random().toString(36).slice(2, 8);

test.describe('Phase 0 regression — board itemKey prefix', () => {
  test('board cards include the project prefix in itemKey', async ({ request }) => {
    const stamp = unique();
    const email = `phase0-bd-${stamp}@test.com`;
    const reg = await request.post(`${API}/auth/register`, {
      data: { email, password: 'password123', displayName: 'Phase0 Board' },
    });
    test.skip(reg.status() !== 201, 'DB already has users — skip (re-run cleanly)');
    const adminToken = (await reg.json()).data.accessToken;

    const prefix = `P${stamp.slice(0, 3).toUpperCase()}`;
    const projRes = await request.post(`${API}/projects`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: `Phase0 Board ${stamp}`, prefix },
    });
    expect(projRes.status()).toBe(201);
    const projectId = (await projRes.json()).data.item.id;

    // Seed a few items.
    for (let i = 0; i < 3; i += 1) {
      const create = await request.post(`${API}/projects/${projectId}/items`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { itemType: 'task', title: `Phase0 board card ${i}` },
      });
      expect(create.status()).toBe(201);
    }

    const boardRes = await request.get(`${API}/projects/${projectId}/board`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(boardRes.status()).toBe(200);
    const board = await boardRes.json();
    const cards = board.data.columns.flatMap((c: { tasks: { itemKey: string }[] }) => c.tasks);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.itemKey, `itemKey on every card`).toMatch(/^[A-Z0-9]+-\d+$/);
      expect(card.itemKey.startsWith(`${prefix}-`)).toBe(true);
    }
  });
});
