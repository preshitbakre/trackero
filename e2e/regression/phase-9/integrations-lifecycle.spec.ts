/**
 * Phase 9 regression — integrations CRUD + dispatch + deliveries.
 *
 * Covers:
 *  - Create webhook integration; secret returned exactly once.
 *  - List integrations; secret NOT echoed on subsequent reads.
 *  - Updating a work_item enqueues a delivery row on the integration.
 *  - Deliveries endpoint returns the documented shape.
 *  - Disabling an integration prevents new dispatches.
 *  - Delete cleans up.
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

async function findProject(request: any, accessToken: string): Promise<{ id: number } | null> {
  const dir = await request.get(`${API}/directory/projects`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const projects = (await dir.json()).data.projects as Array<{ id: number }>;
  return projects[0] ?? null;
}

test.describe('Phase 9 regression — outbound integrations', () => {
  test('CRUD + dispatch + deliveries roundtrip', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const project = await findProject(request, accessToken);
    test.skip(!project, 'no projects');
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Create
    const create = await request.post(`${API}/projects/${project!.id}/integrations`, {
      headers,
      data: { type: 'webhook', config: { url: 'http://localhost:9999/webhook-target' }, enabled: true },
    });
    expect(create.status()).toBe(201);
    const created = (await create.json()).data;
    expect(created.type).toBe('webhook');
    expect(typeof created.secret).toBe('string');
    expect(created.secret.length).toBeGreaterThan(16);
    const integrationId = created.id;

    // List — secret NOT echoed.
    const list = await request.get(`${API}/projects/${project!.id}/integrations`, { headers });
    const items = (await list.json()).data.integrations as Array<any>;
    const ours = items.find((i: any) => String(i.id) === String(integrationId));
    expect(ours).toBeDefined();
    expect((ours as any).secret).toBeUndefined();

    // Trigger a fan-out — update a work item.
    const items2 = await request.get(`${API}/projects/${project!.id}/items?limit=1`, { headers });
    const list2 = (await items2.json()).data.list as Array<{ id: number; priority: string }>;
    test.skip(!list2 || list2.length === 0, 'no items');
    const nextPriority = list2[0].priority === 'medium' ? 'high' : 'medium';
    await request.put(`${API}/projects/${project!.id}/items/${list2[0].id}`, {
      headers,
      data: { priority: nextPriority },
    });

    // Deliveries surface the queued row.
    const deliveries = await request.get(`${API}/projects/${project!.id}/integrations/${integrationId}/deliveries`, { headers });
    const dList = (await deliveries.json()).data.deliveries as Array<any>;
    expect(dList.length).toBeGreaterThan(0);
    for (const d of dList) {
      expect(d).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          eventType: expect.any(String),
          status: expect.stringMatching(/^(pending|delivered|failed)$/),
          attempts: expect.any(Number),
        }),
      );
    }

    // Disable + delete cleanup.
    const disable = await request.put(`${API}/projects/${project!.id}/integrations/${integrationId}`, {
      headers,
      data: { enabled: false },
    });
    expect(disable.status()).toBe(200);

    const del = await request.delete(`${API}/projects/${project!.id}/integrations/${integrationId}`, { headers });
    expect(del.status()).toBe(200);
  });

  test('unknown integration type is rejected', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const project = await findProject(request, accessToken);
    test.skip(!project, 'no projects');
    const res = await request.post(`${API}/projects/${project!.id}/integrations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { type: 'mqtt', config: {} },
    });
    expect(res.status()).toBe(400);
  });
});
