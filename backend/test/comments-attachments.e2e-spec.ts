import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';
import { ActivityService } from '../src/activity/activity.service';

describe('Comments & Attachments (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let memberToken: string;
  let viewerToken: string;
  let projectId: number;
  let taskId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);

    const admin = await registerAdmin(app);
    adminToken = admin.token;

    const member = await registerInvitedUser(app, adminToken, 'member@test.com', 'member');
    memberToken = member.token;
    const memberId = member.id;

    const viewer = await registerInvitedUser(app, adminToken, 'viewer@test.com', 'viewer');
    viewerToken = viewer.token;
    const viewerId = viewer.id;

    // Project
    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test', prefix: 'TST' });
    projectId = projRes.body.data.item.id;

    // Add member + viewer
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: viewerId, role: 'viewer' });

    // Task
    const taskRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemType: 'task', title: 'Test task' });
    taskId = taskRes.body.data.item.id;
  });

  describe('Comments', () => {
    it('creates comment -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'Great work!' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0141');
      expect(res.body.data.item.body).toBe('Great work!');
      expect(res.body.data.item.editedAt).toBeNull();
    });

    it('viewer cannot comment -> 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/comments`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ body: 'Should fail' })
        .expect(403);
    });

    it('lists comments -> 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'Comment 1' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/items/${taskId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0140');
      expect(res.body.data.list.length).toBe(1);
    });

    it('edits comment sets editedAt -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'Original' });
      const commentId = createRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/items/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'Edited' })
        .expect(200);

      expect(res.body.code).toBe('S-0142');
      expect(res.body.data.body).toBe('Edited');
      expect(res.body.data.editedAt).not.toBeNull();
    });

    it('deletes comment -> 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'To delete' });
      const commentId = createRes.body.data.item.id;

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/items/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Comment deletion authorization (§4.5)', () => {
    // Helper: a project member posts a comment, returns its id.
    async function postComment(token: string, body = 'A comment') {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body });
      return res.body.data.item.id;
    }

    it('global-PM but project-member cannot delete another user comment -> 403', async () => {
      // User X has GLOBAL role project_manager...
      const globalPm = await registerInvitedUser(
        app, adminToken, 'globalpm@test.com', 'project_manager',
      );
      // ...but is added to THIS project only as a `member`.
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: globalPm.id, role: 'member' });

      // Another project member (Y) posts a comment.
      const commentId = await postComment(memberToken, 'Y comment');

      // X attempts to delete Y's comment -> must be FORBIDDEN.
      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/items/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${globalPm.token}`)
        .expect(403);
    });

    it('project project_manager can delete another user comment -> 200', async () => {
      const pm = await registerInvitedUser(app, adminToken, 'projpm@test.com', 'member');
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: pm.id, role: 'project_manager' });

      const commentId = await postComment(memberToken, 'Member comment');

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/items/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${pm.token}`)
        .expect(200);
    });

    it('project member can delete their OWN comment -> 200', async () => {
      const commentId = await postComment(memberToken, 'My own comment');

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/items/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);
    });

    it('project member cannot delete another user comment -> 403', async () => {
      const commentId = await postComment(adminToken, 'Admin comment');

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/items/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('global admin can delete any user comment -> 200', async () => {
      const commentId = await postComment(memberToken, 'Member comment');

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/items/${taskId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Attachments', () => {
    it('uploads file -> 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('test content'), 'test.txt')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe('S-0151');
      expect(res.body.data.item.originalFilename).toBe('test.txt');
      expect(res.body.data.item.sizeBytes).toBeGreaterThan(0);
    });

    it('rejects file > max size with a clean FILE_TOO_LARGE envelope (not a 500)', async () => {
      // Create a buffer > 10MB (the test env MAX_UPLOAD_SIZE_MB is 10)
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'x');

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', largeBuffer, 'large.bin');

      // The oversized stream must be rejected at the Multer layer with a
      // clean 4xx (400 or 413) — never a raw 500 from an unfiltered MulterError.
      expect(res.status).not.toBe(500);
      expect([400, 413]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0061');
      expect(res.body.message).toBe('File exceeds maximum allowed size');
      expect(res.body.errors).toEqual([
        { code: 'F-L-0061', message: 'File exceeds maximum allowed size' },
      ]);
    });

    it('gets presigned download URL -> 200', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('download me'), 'file.txt');
      const attachmentId = uploadRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/items/${taskId}/attachments/${attachmentId}/url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0152');
      expect(res.body.data.url).toBeDefined();
      expect(res.body.data.expiresIn).toBe(3600);
    });

    it('deletes attachment -> 200', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('delete me'), 'del.txt');
      const attachmentId = uploadRes.body.data.item.id;

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/items/${taskId}/attachments/${attachmentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Event-listener failure isolation (Task 3.8)', () => {
    it('comment creation still returns 201 when the activity @OnEvent handler throws', async () => {
      // Inject a failure into the ActivityService.onCommentAdded @OnEvent
      // handler: replace its body with one that always throws. Because the
      // handler is wrapped in try/catch + Logger, the throw is swallowed and
      // never becomes an unhandled rejection — the originating request, which
      // fires `comment.added` AFTER its own work, must still succeed.
      const activityService = app.get(ActivityService);
      const original = activityService.onCommentAdded.bind(activityService);
      (activityService as any).onCommentAdded = async () => {
        throw new Error('injected activity-handler failure');
      };

      try {
        const res = await request(app.getHttpServer())
          .post(`/api/projects/${projectId}/items/${taskId}/comments`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ body: 'Comment that triggers a failing listener' })
          .expect(201);

        expect(res.body.success).toBe(true);
        expect(res.body.data.item.body).toBe('Comment that triggers a failing listener');

        // Give the async listener a tick to run (and swallow) its failure.
        await new Promise((r) => setTimeout(r, 60));

        // The app must remain fully responsive after a handler failure —
        // proves the process did not crash / destabilize.
        const ping = await request(app.getHttpServer())
          .get(`/api/projects/${projectId}/items/${taskId}/comments`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        expect(ping.body.code).toBe('S-0140');
      } finally {
        (activityService as any).onCommentAdded = original;
      }
    });
  });

  describe('Activity Log', () => {
    it('records activity on task creation', async () => {
      // Create another task (the one in beforeEach already created one)
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ itemType: 'task', title: 'Activity test task' });

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/activity`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.code).toBe('S-0160');
      expect(res.body.data.list.length).toBeGreaterThan(0);
      const createdLog = res.body.data.list.find((l: any) => l.action === 'created');
      expect(createdLog).toBeDefined();
    });
  });
});
