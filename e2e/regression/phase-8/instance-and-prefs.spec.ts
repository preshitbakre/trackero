/**
 * Phase 8 regression — instance settings + notification prefs + bulk invites.
 */
import { test, expect } from '@playwright/test';
import { loginSeed } from '../../utils/auth';

const API = 'http://localhost:3001/api';

test.describe('Phase 8 regression — instance settings + prefs + bulk invites', () => {
  test('instance-settings returns the seeded keys', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const res = await request.get(`${API}/instance-settings`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status()).toBe(200);
    const d = (await res.json()).data;
    expect(d.appName).toBeDefined();
    expect(d.defaultRole).toBeDefined();
    expect(d.feature_flags).toBeDefined();
  });

  test('notification preferences upsert + read roundtrip', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const headers = { Authorization: `Bearer ${accessToken}` };

    const put = await request.put(`${API}/me/notification-preferences`, {
      headers,
      data: { type: 'mentioned', channel: 'email', enabled: false },
    });
    expect(put.status()).toBe(200);

    const get = await request.get(`${API}/me/notification-preferences`, { headers });
    const prefs = (await get.json()).data.preferences as Array<{ type: string; channel: string; enabled: boolean }>;
    const row = prefs.find((p) => p.type === 'mentioned' && p.channel === 'email');
    expect(row?.enabled).toBe(false);

    // Re-enable so other tests don't run with a stale pref.
    await request.put(`${API}/me/notification-preferences`, {
      headers,
      data: { type: 'mentioned', channel: 'email', enabled: true },
    });
  });

  test('bulk invites accepts newline list + caps at 50', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const headers = { Authorization: `Bearer ${accessToken}` };

    const ts = Date.now();
    const body = {
      emails: `bulk-a-${ts}@trackero.test\nbulk-b-${ts}@trackero.test`,
      role: 'member',
    };
    const res = await request.post(`${API}/users/invite/bulk`, { headers, data: body });
    expect(res.status()).toBe(200);
    const d = (await res.json()).data;
    expect(d.invited.length).toBeGreaterThan(0);

    // Cap test — 51 fake emails should land entirely in failed[batch-cap-exceeded].
    const tooMany = Array.from({ length: 51 }, (_, i) => `over-${ts}-${i}@trackero.test`).join('\n');
    const over = await request.post(`${API}/users/invite/bulk`, {
      headers,
      data: { emails: tooMany, role: 'member' },
    });
    const overD = (await over.json()).data;
    expect(overD.invited).toEqual([]);
    expect(overD.failed.length).toBe(51);
    expect(overD.failed[0].reason).toBe('batch-cap-exceeded');
  });

  test('reject invalid notification preference channel', async ({ request }) => {
    const { accessToken } = await loginSeed(request);
    const res = await request.put(`${API}/me/notification-preferences`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { type: 'mentioned', channel: 'sms', enabled: true },
    });
    expect(res.status()).toBe(400);
  });
});
