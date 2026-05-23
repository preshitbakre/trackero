/**
 * T0.7 regression — the comment.added listener must read `workItemId`
 * from the payload (not the legacy `taskId`). The bug was silent: the
 * `createNotification` helper received `undefined` as `referenceId`
 * and threw inside the listener's try/catch, so no notification row
 * was ever created.
 *
 * Test plan:
 *   - Admin posts a work item with a non-admin reporter and assignee.
 *   - Admin posts a comment on that item.
 *   - Within a short wait, the assignee has a comment_added
 *     notification whose referenceType is 'work_item' and whose
 *     referenceId equals the work item id.
 *
 * Before T0.7's fix, the wait would expire with no notification row.
 */
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerAdmin, registerInvitedUser, clearDatabase } from '../../setup';

async function waitForNotification(
  ds: DataSource,
  userId: number,
  type: string,
  timeoutMs = 1500,
): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await ds.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND type = $2',
      [userId, type],
    );
    if (rows.length > 0) return rows[0];
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

describe('T0.7 — comment.added listener uses workItemId', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let memberToken: string;
  let memberId: number;
  let projectId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);
    const admin = await registerAdmin(app);
    adminToken = admin.token;
    const member = await registerInvitedUser(app, adminToken, 'member@t.local', 'member');
    memberToken = member.token;
    memberId = member.id;

    const proj = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Phase0', prefix: 'P0' });
    projectId = proj.body.data.item.id;

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });
  });

  it('creates a comment_added notification on the work_item', async () => {
    // Admin creates a work item assigned to the member.
    const itemRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemType: 'task',
        title: 'Listener bug regression',
        assigneeId: memberId,
      });
    expect(itemRes.status).toBe(201);
    const workItemId: number = itemRes.body.data.item.id;

    // Admin posts a comment.
    const commentRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items/${workItemId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'Heads up — this is a regression check.' });
    expect(commentRes.status).toBe(201);

    // The member (assignee) should receive a comment_added notification
    // whose referenceId is the work item id. Without T0.7 the listener
    // would have crashed silently and the row would never appear.
    const notif = await waitForNotification(ds, memberId, 'comment_added');
    expect(notif).not.toBeNull();
    expect(notif.reference_type).toBe('work_item');
    expect(notif.reference_id).toBe(workItemId);
    expect(notif.project_id).toBe(projectId);
  });
});
