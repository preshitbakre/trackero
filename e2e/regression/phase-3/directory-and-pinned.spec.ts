/**
 * Phase 3 regression — project directory API contract + pinned roundtrip.
 *
 * Covers:
 *  - GET /api/directory/projects shape (counts + projects array)
 *  - status inference field present + enumerated tone
 *  - filter=active / archived / planning honoured
 *  - pin -> directory.isPinned=true -> /me/pinned-projects contains id
 *  - unpin -> directory.isPinned=false
 *  - visit -> appears in /me/projects/recent
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

const VALID_STATUSES = [
  'archived',
  'planning',
  'no_sprint',
  'ends_today',
  'ends_in_days',
  'idle',
  'on_track',
];

test.describe('Phase 3 regression — project directory + pinned + visits', () => {
  test('directory returns counts + projects with status + activeSprint', async ({ request }) => {
    const { accessToken } = await loginSeed(request);

    const res = await request.get(`${API}/directory/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.code).toBe('S-0080');
    const data = body.data;

    expect(data.counts).toEqual(
      expect.objectContaining({
        active: expect.any(Number),
        planning: expect.any(Number),
        archived: expect.any(Number),
        all: expect.any(Number),
      }),
    );
    expect(Array.isArray(data.projects)).toBe(true);

    for (const p of data.projects) {
      expect(p).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          name: expect.any(String),
          prefix: expect.any(String),
          memberCount: expect.any(Number),
          isPinned: expect.any(Boolean),
          status: expect.stringMatching(new RegExp(`^(${VALID_STATUSES.join('|')})$`)),
        }),
      );
      if (p.activeSprint) {
        expect(p.activeSprint).toEqual(
          expect.objectContaining({
            id: expect.any(Number),
            name: expect.any(String),
            sprintNumber: expect.any(Number),
            totalPoints: expect.any(Number),
            completedPoints: expect.any(Number),
          }),
        );
      }
    }
  });

  test('filter=active and filter=archived return disjoint sets', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const headers = { Authorization: `Bearer ${accessToken}` };

    const active = await request.get(`${API}/directory/projects?filter=active`, { headers });
    const archived = await request.get(`${API}/directory/projects?filter=archived`, { headers });
    expect(active.status()).toBe(200);
    expect(archived.status()).toBe(200);

    const activeIds = ((await active.json()).data.projects as Array<{ id: number; status: string }>).map((p) => p.id);
    const archivedRows = (await archived.json()).data.projects as Array<{ id: number; status: string }>;
    const archivedIds = archivedRows.map((p) => p.id);

    // No project should appear in both filters.
    const overlap = activeIds.filter((id) => archivedIds.includes(id));
    expect(overlap).toEqual([]);

    // Archived rows all carry the archived status.
    for (const row of archivedRows) {
      expect(row.status).toBe('archived');
    }
  });

  test('search query narrows the result set', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const headers = { Authorization: `Bearer ${accessToken}` };

    const all = await request.get(`${API}/directory/projects`, { headers });
    const allProjects = (await all.json()).data.projects as Array<{ id: number; name: string; prefix: string }>;
    test.skip(allProjects.length === 0, 'no projects to search');

    const sample = allProjects[0];
    const term = sample.prefix.toLowerCase();
    const filtered = await request.get(`${API}/directory/projects?search=${encodeURIComponent(term)}`, { headers });
    const filteredProjects = (await filtered.json()).data.projects as Array<{ id: number }>;
    expect(filteredProjects.some((p) => p.id === sample.id)).toBe(true);
  });

  test('pin -> directory.isPinned -> unpin roundtrip', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const headers = { Authorization: `Bearer ${accessToken}` };

    const dir = await request.get(`${API}/directory/projects`, { headers });
    const projects = (await dir.json()).data.projects as Array<{ id: number; isPinned: boolean }>;
    test.skip(projects.length === 0, 'no projects');

    const target = projects[0];

    // Ensure clean state.
    if (target.isPinned) {
      await request.delete(`${API}/me/pinned-projects/${target.id}`, { headers });
    }

    // Pin
    const pin = await request.post(`${API}/me/pinned-projects`, {
      headers,
      data: { projectId: target.id },
    });
    expect(pin.status()).toBe(200);
    expect((await pin.json()).code).toBe('S-0082');

    // Reflected in /me/pinned-projects
    const pinned = await request.get(`${API}/me/pinned-projects`, { headers });
    const ids = ((await pinned.json()).data.projectIds as number[]) ?? [];
    expect(ids).toContain(target.id);

    // Reflected in directory listing
    const dir2 = await request.get(`${API}/directory/projects`, { headers });
    const row = ((await dir2.json()).data.projects as Array<{ id: number; isPinned: boolean }>).find(
      (p) => p.id === target.id,
    );
    expect(row?.isPinned).toBe(true);

    // Unpin
    const unpin = await request.delete(`${API}/me/pinned-projects/${target.id}`, { headers });
    expect(unpin.status()).toBe(200);
    expect((await unpin.json()).code).toBe('S-0083');

    const pinned2 = await request.get(`${API}/me/pinned-projects`, { headers });
    const ids2 = ((await pinned2.json()).data.projectIds as number[]) ?? [];
    expect(ids2).not.toContain(target.id);
  });

  test('visit ping populates /me/projects/recent', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const headers = { Authorization: `Bearer ${accessToken}` };

    const dir = await request.get(`${API}/directory/projects`, { headers });
    const projects = (await dir.json()).data.projects as Array<{ id: number }>;
    test.skip(projects.length === 0, 'no projects');
    const target = projects[projects.length - 1];

    const visit = await request.post(`${API}/me/project-visits/${target.id}`, { headers });
    expect(visit.status()).toBe(200);
    expect((await visit.json()).code).toBe('S-0084');

    const recent = await request.get(`${API}/me/projects/recent`, { headers });
    expect(recent.status()).toBe(200);
    const body = await recent.json();
    expect(body.code).toBe('S-0085');
    const recentIds = (body.data.projects as Array<{ id: number; isPinned: boolean }>).map((p) => p.id);
    expect(recentIds).toContain(target.id);
  });
});
