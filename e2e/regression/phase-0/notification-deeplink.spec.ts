/**
 * T0.11 — Phase 0 regression e2e.
 *
 * T0.7 + T0.10 end-to-end: a comment notification's payload must carry
 * the work item id (T0.7) AND the reporter's avatarUrl must be
 * populated on the work item detail (T0.10), so that the notification
 * bell deep-link to `/projects/:id/tasks/:itemId` actually loads the
 * right item with all the metadata the panel needs.
 *
 * This test is intentionally HTTP-level. The browser-level "click the
 * bell, watch the drawer open" assertion is Phase 7's responsibility
 * once the new notification UI ships; until then, the HTTP contract
 * the bell consumes is what's worth locking down.
 */
import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001/api';
const unique = () => Math.random().toString(36).slice(2, 8);

test.describe('Phase 0 regression — notification deeplink shape', () => {
  test('comment notification points at the right work item; reporter has avatarUrl', async ({ request }) => {
    const stamp = unique();
    const adminEmail = `phase0-nd-admin-${stamp}@test.com`;
    const memberEmail = `phase0-nd-mem-${stamp}@test.com`;

    const reg = await request.post(`${API}/auth/register`, {
      data: { email: adminEmail, password: 'password123', displayName: 'ND Admin' },
    });
    test.skip(reg.status() !== 201, 'DB already has users — skip (re-run cleanly)');
    const adminToken = (await reg.json()).data.accessToken;

    const invite = await request.post(`${API}/users/invite`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: memberEmail, role: 'member' },
    });
    const inviteToken = (await invite.json()).data.item.token;
    const memberReg = await request.post(`${API}/auth/register`, {
      data: {
        email: memberEmail,
        password: 'password123',
        displayName: 'ND Member',
        inviteToken,
      },
    });
    const memberBody = await memberReg.json();
    const memberToken = memberBody.data.accessToken;
    const memberId = memberBody.data.user.id;

    const projRes = await request.post(`${API}/projects`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: `ND ${stamp}`, prefix: `N${stamp.slice(0, 3).toUpperCase()}` },
    });
    const projectId = (await projRes.json()).data.item.id;

    await request.post(`${API}/projects/${projectId}/members`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { userId: memberId, role: 'member' },
    });

    const itemRes = await request.post(`${API}/projects/${projectId}/items`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { itemType: 'task', title: 'ND regression', assigneeId: memberId },
    });
    const workItemId = (await itemRes.json()).data.item.id;

    await request.post(`${API}/projects/${projectId}/items/${workItemId}/comments`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { body: 'Heads up' },
    });

    // Poll briefly for the listener-side insert.
    let deeplinkId: number | undefined;
    const start = Date.now();
    while (Date.now() - start < 2000 && deeplinkId === undefined) {
      const notifRes = await request.get(`${API}/notifications`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      const notifs = (await notifRes.json()).data.list as Array<{
        type: string;
        reference_id?: number;
        referenceId?: number;
      }>;
      const notif = notifs.find((n) => n.type === 'comment_added');
      deeplinkId = notif?.referenceId ?? notif?.reference_id;
      if (deeplinkId === undefined) await new Promise((r) => setTimeout(r, 50));
    }

    expect(deeplinkId, 'notification carries the deeplink target').toBe(workItemId);

    // Loading the deeplink target returns the reporter with avatarUrl.
    const detail = await request.get(`${API}/projects/${projectId}/items/${workItemId}`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(detail.status()).toBe(200);
    const item = (await detail.json()).data;
    expect(item.reporter).toBeTruthy();
    expect(item.reporter).toHaveProperty('avatarUrl');
  });
});
