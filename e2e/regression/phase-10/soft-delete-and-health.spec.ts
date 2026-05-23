/**
 * Phase 10 regression — soft delete + restore + expanded health.
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

test.describe('Phase 10 regression — hardening', () => {
  test('/api/health returns the expanded shape with all three signals', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const d = (await res.json()).data;
    expect(d).toEqual(
      expect.objectContaining({
        status: expect.stringMatching(/^(healthy|unhealthy)$/),
        database: expect.any(String),
        minio: expect.any(String),
        smtp: expect.any(String),
      }),
    );
  });

  test('soft-delete filters item from list; restore brings it back', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const dir = await request.get(`${API}/directory/projects`, { headers });
    const projects = (await dir.json()).data.projects as Array<{ id: number }>;
    test.skip(projects.length === 0, 'no projects');
    const pid = projects[0].id;

    const create = await request.post(`${API}/projects/${pid}/items`, {
      headers,
      data: { itemType: 'task', title: `phase10 probe ${Date.now()}` },
    });
    expect(create.status()).toBe(201);
    const itemId = (await create.json()).data.item.id;

    // Soft-delete
    const del = await request.delete(`${API}/projects/${pid}/items/${itemId}`, { headers });
    expect(del.status()).toBe(200);

    // List should NOT include the item.
    const list = await request.get(`${API}/projects/${pid}/items?limit=500`, { headers });
    const items = (await list.json()).data.list as Array<{ id: number }>;
    expect(items.find((i) => i.id === itemId)).toBeUndefined();

    // findOne should 404 now.
    const get = await request.get(`${API}/projects/${pid}/items/${itemId}`, { headers });
    expect(get.status()).toBe(404);

    // Restore
    const restore = await request.post(`${API}/projects/${pid}/items/${itemId}/restore`, { headers });
    expect(restore.status()).toBe(200);
    expect((await restore.json()).code).toBe('S-0114');

    // List should include it again.
    const list2 = await request.get(`${API}/projects/${pid}/items?limit=500`, { headers });
    const items2 = (await list2.json()).data.list as Array<{ id: number }>;
    expect(items2.find((i) => i.id === itemId)).toBeDefined();

    // Cleanup — admin hard delete.
    await request.delete(`${API}/projects/${pid}/items/${itemId}?hard=true`, { headers });
  });
});
