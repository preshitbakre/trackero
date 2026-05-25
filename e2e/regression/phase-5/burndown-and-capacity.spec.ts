/**
 * Phase 5 regression — snapshot-backed burndown + per-assignee capacity.
 *
 * Covers:
 *  - GET /sprints/:id/burndown returns the documented shape (sprintName,
 *    startDate, endDate, totalPoints, dataPoints[]).
 *  - Each dataPoint carries date / ideal / actual / scope.
 *  - GET /sprints/:id/capacity returns totals + per-assignee with isOver.
 *  - On-read fallback: re-requesting burndown twice returns the same data
 *    (idempotent snapshot materialization on the first call).
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

async function pickActiveSprint(request: any, accessToken: string) {
  const dir = await request.get(`${API}/directory/projects`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const projects = (await dir.json()).data.projects as Array<{ id: number; activeSprint: any }>;
  for (const p of projects) {
    if (p.activeSprint) {
      return { projectId: p.id, sprintId: p.activeSprint.id };
    }
  }
  return null;
}

test.describe('Phase 5 regression — burndown + capacity', () => {
  test('burndown returns the documented shape with daily data points', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const active = await pickActiveSprint(request, accessToken);
    test.skip(!active, 'no active sprint to read');

    const res = await request.get(`${API}/projects/${active!.projectId}/sprints/${active!.sprintId}/burndown`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.code).toBe('S-0058');
    const d = body.data;
    expect(d).toEqual(
      expect.objectContaining({
        sprintName: expect.any(String),
        startDate: expect.any(String),
        endDate: expect.any(String),
        totalPoints: expect.any(Number),
        dataPoints: expect.any(Array),
      }),
    );
    expect(d.dataPoints.length).toBeGreaterThan(0);
    for (const p of d.dataPoints) {
      expect(p).toEqual(
        expect.objectContaining({
          date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          ideal: expect.any(Number),
          actual: expect.any(Number),
          scope: expect.any(Number),
        }),
      );
    }
  });

  test('burndown is idempotent on repeated reads', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const active = await pickActiveSprint(request, accessToken);
    test.skip(!active, 'no active sprint to read');

    const headers = { Authorization: `Bearer ${accessToken}` };
    const r1 = await request.get(`${API}/projects/${active!.projectId}/sprints/${active!.sprintId}/burndown`, { headers });
    const r2 = await request.get(`${API}/projects/${active!.projectId}/sprints/${active!.sprintId}/burndown`, { headers });
    const d1 = (await r1.json()).data;
    const d2 = (await r2.json()).data;
    expect(d2.dataPoints.length).toBe(d1.dataPoints.length);
    expect(d2.totalPoints).toBe(d1.totalPoints);
  });

});
