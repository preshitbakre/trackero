/**
 * T0.11 — Phase 0 regression e2e.
 *
 * T0.7 + T0.8 end-to-end: a posted comment must fire two cross-service
 * side effects.
 *
 *   1. The recipient (assignee) gets a notification (T0.7).
 *   2. Every socket client subscribed to the project room receives a
 *      `comment:added` event whose payload uses workItemId (T0.8).
 *
 * Browser-based UI assertions live in the responsive suite and will
 * grow in Phase 7 (notification bell rebuild). For now the test
 * verifies the contract via the HTTP API + a direct socket
 * subscription using the bundled `socket.io-client` (already a
 * dependency of the frontend).
 */
import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

const API = 'http://localhost:3001/api';
const WS = 'http://localhost:3001';
const unique = () => Math.random().toString(36).slice(2, 8);

test.describe('Phase 0 regression — comment realtime', () => {
  test('comment:added arrives with workItemId and the assignee gets a notification', async ({ request }) => {
    const stamp = unique();
    const adminEmail = `phase0-rt-admin-${stamp}@test.com`;
    const memberEmail = `phase0-rt-mem-${stamp}@test.com`;

    const reg = await request.post(`${API}/auth/register`, {
      data: { email: adminEmail, password: 'password123', displayName: 'RT Admin' },
    });
    test.skip(reg.status() !== 201, 'DB already has users — skip (re-run cleanly)');
    const adminToken = (await reg.json()).data.accessToken;

    const invite = await request.post(`${API}/users/invite`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: memberEmail, role: 'member' },
    });
    expect(invite.status()).toBe(201);
    const inviteToken = (await invite.json()).data.item.token;

    const memberReg = await request.post(`${API}/auth/register`, {
      data: {
        email: memberEmail,
        password: 'password123',
        displayName: 'RT Member',
        inviteToken,
      },
    });
    expect(memberReg.status()).toBe(201);
    const memberBody = await memberReg.json();
    const memberToken = memberBody.data.accessToken;
    const memberId = memberBody.data.user.id;

    const projRes = await request.post(`${API}/projects`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: `RT ${stamp}`, prefix: `R${stamp.slice(0, 3).toUpperCase()}` },
    });
    expect(projRes.status()).toBe(201);
    const projectId = (await projRes.json()).data.item.id;

    await request.post(`${API}/projects/${projectId}/members`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { userId: memberId, role: 'member' },
    });

    const itemRes = await request.post(`${API}/projects/${projectId}/items`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { itemType: 'task', title: 'RT regression', assigneeId: memberId },
    });
    expect(itemRes.status()).toBe(201);
    const workItemId = (await itemRes.json()).data.item.id;

    // Member opens a socket and joins the project room.
    const memberSocket: Socket = io(WS, {
      transports: ['websocket'],
      auth: { token: `Bearer ${memberToken}` },
    });
    let socketPayload: Record<string, unknown> | null = null;
    memberSocket.on('comment:added', (p) => {
      socketPayload = p as Record<string, unknown>;
    });

    await new Promise<void>((resolve) => memberSocket.once('connect', () => resolve()));
    await new Promise<void>((resolve) => {
      memberSocket.emit('join:project', { projectId }, () => resolve());
    });

    // Admin posts the comment.
    const commentRes = await request.post(
      `${API}/projects/${projectId}/items/${workItemId}/comments`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { body: 'Comment for realtime regression' },
      },
    );
    expect(commentRes.status()).toBe(201);

    // Wait briefly for both the socket emit and the notification insert.
    const start = Date.now();
    while (Date.now() - start < 2000 && !socketPayload) {
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(socketPayload, 'socket comment:added arrived').not.toBeNull();
    expect(socketPayload!.workItemId).toBe(workItemId);
    expect(socketPayload!.projectId).toBe(projectId);
    expect(socketPayload).not.toHaveProperty('taskId');

    const notifRes = await request.get(`${API}/notifications`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(notifRes.status()).toBe(200);
    const notifs = (await notifRes.json()).data.list as Array<{
      type: string;
      reference_id?: number;
      referenceId?: number;
    }>;
    const commentNotif = notifs.find((n) => n.type === 'comment_added');
    expect(commentNotif, 'member received comment_added notification').toBeTruthy();
    const ref = commentNotif?.referenceId ?? commentNotif?.reference_id;
    expect(ref).toBe(workItemId);

    memberSocket.disconnect();
  });
});
