/**
 * Phase 7 regression — task-detail full feature parity surfaces.
 *
 * Covers:
 *  - Watchers: pin/unpin self; list returns watcherCount + byMe.
 *  - Reactions: toggle adds + same emoji again removes; UQ prevents
 *    double-react.
 *  - Reviewer: PUT /items/:id { reviewerId } persists and is read back.
 *  - Comment enrichment: list response carries reactions + mentions
 *    on each comment.
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

async function pickAnyItem(request: any, accessToken: string) {
  const dir = await request.get(`${API}/directory/projects`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const projects = (await dir.json()).data.projects as Array<{ id: number }>;
  for (const p of projects) {
    const items = await request.get(`${API}/projects/${p.id}/items?limit=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const list = (await items.json()).data.list as Array<{ id: number; itemType: string }>;
    if (list && list.length > 0) return { projectId: p.id, itemId: list[0].id };
  }
  return null;
}

test.describe('Phase 7 regression — task detail parity', () => {
  test('watch / unwatch / list watchers', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const ctx = await pickAnyItem(request, accessToken);
    test.skip(!ctx, 'no work items');
    const headers = { Authorization: `Bearer ${accessToken}` };

    const watch = await request.post(`${API}/projects/${ctx!.projectId}/items/${ctx!.itemId}/watchers/me`, { headers });
    expect(watch.status()).toBe(200);
    const wBody = await watch.json();
    expect(wBody.data.watching).toBe(true);

    const list = await request.get(`${API}/projects/${ctx!.projectId}/items/${ctx!.itemId}/watchers`, { headers });
    const lBody = await list.json();
    expect(lBody.data.byMe).toBe(true);
    expect(lBody.data.watcherCount).toBeGreaterThan(0);

    const unwatch = await request.delete(`${API}/projects/${ctx!.projectId}/items/${ctx!.itemId}/watchers/me`, { headers });
    expect(unwatch.status()).toBe(200);
    const uBody = await unwatch.json();
    expect(uBody.data.watching).toBe(false);
  });

  test('reviewer updates persist and read back', async ({ request }) => {
    const { accessToken, user } = await loginSeed(request);
    const ctx = await pickAnyItem(request, accessToken);
    test.skip(!ctx, 'no work items');
    const headers = { Authorization: `Bearer ${accessToken}` };

    const update = await request.put(`${API}/projects/${ctx!.projectId}/items/${ctx!.itemId}`, {
      headers,
      data: { reviewerId: user.id },
    });
    expect(update.status()).toBe(200);

    const read = await request.get(`${API}/projects/${ctx!.projectId}/items/${ctx!.itemId}`, { headers });
    const item = (await read.json()).data;
    expect(item.reviewerId).toBe(user.id);
  });

  test('comment list carries reactions + mentions arrays per item', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const ctx = await pickAnyItem(request, accessToken);
    test.skip(!ctx, 'no work items');
    const headers = { Authorization: `Bearer ${accessToken}` };

    const post = await request.post(`${API}/projects/${ctx!.projectId}/items/${ctx!.itemId}/comments`, {
      headers,
      data: { body: `phase7 probe ${Date.now()}` },
    });
    expect(post.status()).toBe(201);
    const cid = (await post.json()).data.item.id;

    const react = await request.post(`${API}/projects/${ctx!.projectId}/items/${ctx!.itemId}/comments/${cid}/reactions`, {
      headers,
      data: { emoji: '👍' },
    });
    expect(react.status()).toBe(200);
    const rBody = await react.json();
    expect(Array.isArray(rBody.data)).toBe(true);
    expect(rBody.data[0].emoji).toBe('👍');
    expect(rBody.data[0].byMe).toBe(true);

    const list = await request.get(`${API}/projects/${ctx!.projectId}/items/${ctx!.itemId}/comments`, { headers });
    const comments = (await list.json()).data.list as Array<any>;
    const ours = comments.find((c: any) => c.id === cid);
    expect(ours).toBeDefined();
    expect(Array.isArray(ours.reactions)).toBe(true);
    expect(Array.isArray(ours.mentions)).toBe(true);
    expect(ours.reactions.find((r: any) => r.emoji === '👍')).toBeDefined();

    // Toggle the same emoji off again.
    const off = await request.post(`${API}/projects/${ctx!.projectId}/items/${ctx!.itemId}/comments/${cid}/reactions`, {
      headers,
      data: { emoji: '👍' },
    });
    const offBody = await off.json();
    expect(offBody.data.find((r: any) => r.emoji === '👍')).toBeUndefined();
  });
});
