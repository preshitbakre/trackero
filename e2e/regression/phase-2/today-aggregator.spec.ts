/**
 * Phase 2 regression — GET /api/today returns the locked-shape payload
 * with the documented sections present. Snapshot covers the contract
 * the TodayPage consumes (greeting, summary, triage, reviewing,
 * dueSoon, currentSprint, presence, activity).
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

test.describe('Phase 2 regression — /api/today shape', () => {
  test('returns the full TodayPayload with every documented section', async ({ request }) => {
    const { accessToken } = await loginSeed(request);

    const res = await request.get(`${API}/today?timezone=UTC`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.code).toBe('S-0070');
    const data = body.data;

    // Greeting block
    expect(data.greeting).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        partOfDay: expect.stringMatching(/^(morning|afternoon|evening)$/),
        localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        localTime: expect.stringMatching(/^\d{2}:\d{2}$/),
      }),
    );

    // Summary block
    expect(data.summary).toEqual(
      expect.objectContaining({
        reviewCardCount: expect.any(Number),
        blockingBugCount: expect.any(Number),
      }),
    );

    // Arrays
    expect(Array.isArray(data.triage)).toBe(true);
    expect(Array.isArray(data.reviewing)).toBe(true);
    expect(Array.isArray(data.dueSoon)).toBe(true);
    expect(typeof data.dueSoonTotalAssigned).toBe('number');
    expect(Array.isArray(data.activity)).toBe(true);

    // Triage rows obey priorityTier + itemKey shape when present.
    for (const row of data.triage) {
      expect(row).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          itemKey: expect.stringMatching(/^[A-Z0-9]+-\d+$/),
          itemType: expect.any(String),
          priorityTier: expect.stringMatching(/^p[0-3]$/),
          reasonChips: expect.any(Array),
        }),
      );
    }

    // Activity sentences are pre-rendered server-side; UI just paints them.
    for (const a of data.activity) {
      expect(a).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          ts: expect.any(String),
          actor: expect.objectContaining({ displayName: expect.any(String) }),
          sentence: expect.any(String),
        }),
      );
    }

    // Presence block (shape only — values depend on live sockets).
    expect(data.presence).toEqual(
      expect.objectContaining({
        count: expect.any(Number),
        users: expect.any(Array),
      }),
    );
  });

  test('scoped to a project, currentSprint is non-null when the project has an active sprint', async ({ request }) => {
    const { accessToken } = await loginSeed(request);

    const projects = await request.get(`${API}/projects?limit=20`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const list = (await projects.json()).data.list as Array<{ id: number }>;
    test.skip(list.length === 0, 'no projects');

    // Walk until we find a project with an active sprint.
    let activeProjectId: number | null = null;
    for (const p of list) {
      const r = await request.get(`${API}/projects/${p.id}/sprints/active`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok() && (await r.json()).data) {
        activeProjectId = p.id;
        break;
      }
    }
    test.skip(!activeProjectId, 'no project has an active sprint');

    const res = await request.get(`${API}/today?projectId=${activeProjectId}&timezone=UTC`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    expect(data.currentSprint).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        projectId: activeProjectId,
        name: expect.any(String),
        dayOf: expect.any(Number),
        length: expect.any(Number),
        pointsTotal: expect.any(Number),
        pointsDone: expect.any(Number),
        burndown: expect.any(Array),
      }),
    );
  });
});
