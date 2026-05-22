import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as zlib from 'zlib';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';
import { ActivityService } from '../src/activity/activity.service';

// CRC-32 (needed for valid ZIP local/central headers).
function crc32(buf: Buffer): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

// Builds a minimal but structurally valid ZIP archive from name/content pairs.
function buildZip(files: Array<[string, string]>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(content);
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, comp);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const cdStart = offset;
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(cdStart, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

// Builds a minimal OOXML container (docx/xlsx) with the given marker part.
// `file-type@16` detects docx via `word/document.xml` and xlsx via `xl/workbook.xml`.
function buildOoxml(markerPart: string): Buffer {
  return buildZip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships/>'],
    [markerPart, '<?xml version="1.0"?><part/>'],
  ]);
}

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

  describe('Attachment MIME validation (§4.2 — store/serve detected MIME)', () => {
    // A minimal valid PNG (8-byte signature + IHDR header).
    const PNG_BUFFER = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
      'hex',
    );

    it('stores the DETECTED mime type for a real PNG, not the client claim', async () => {
      // Upload a genuine PNG buffer but lie in the Content-Type header.
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', PNG_BUFFER, { filename: 'pic.png', contentType: 'image/png' })
        .expect(201);

      expect(res.body.data.item.mimeType).toBe('image/png');
    });

    it('a PNG sent with a lying text/plain Content-Type is still stored as image/png', async () => {
      // Attacker claims text/plain but the bytes are a PNG. The stored mime
      // must reflect the magic-byte-detected type, not the spoofed header.
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', PNG_BUFFER, { filename: 'evil.txt', contentType: 'text/plain' })
        .expect(201);

      // Detected type wins — never the client lie.
      expect(res.body.data.item.mimeType).toBe('image/png');
    });

    it('a text buffer falsely claimed as image/png is rejected (undetectable non-text)', async () => {
      // Plain text has no magic-byte signature -> file-type returns undefined.
      // The client claims image/png, which is NOT text/plain or text/csv,
      // so the upload must be rejected as spoofed/corrupt.
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('this is not really a png'), {
          filename: 'fake.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0062');
    });

    it('garbage bytes claimed as application/pdf are rejected', async () => {
      const garbage = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', garbage, { filename: 'fake.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('F-L-0062');
    });

    it('a genuine plain .txt upload still works (text/plain has no magic bytes)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('legitimate text content'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(201);

      expect(res.body.data.item.mimeType).toBe('text/plain');
    });

    it('a real .docx upload still works and stores the OOXML mime', async () => {
      const docx = buildOoxml('word/document.xml');
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', docx, {
          filename: 'doc.docx',
          contentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
        .expect(201);

      expect(res.body.data.item.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    });

    it('a real .xlsx upload still works and stores the OOXML mime', async () => {
      const xlsx = buildOoxml('xl/workbook.xml');
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', xlsx, {
          filename: 'sheet.xlsx',
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        .expect(201);

      expect(res.body.data.item.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });
  });

  describe('SVG rejection & download disposition (§4.3 — SVG stored-XSS)', () => {
    it('rejects an SVG upload with FILE_TYPE_NOT_ALLOWED', async () => {
      // An SVG can embed <script> — served inline it is stored XSS.
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', svg, { filename: 'evil.svg', contentType: 'image/svg+xml' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('F-L-0062');
    });

    it('getPresignedUrl forces attachment disposition for a non-image type', async () => {
      // Test mode: this.s3 is null so a full S3 round-trip cannot be asserted.
      // We assert at the service level that a non-image MIME triggers the
      // attachment-disposition code path. We spy on the GetObjectCommand input
      // by exercising the service with a non-image and an image type.
      const { FileStorageService } = await import(
        '../src/file-storage/file-storage.service'
      );
      const svc = app.get(FileStorageService) as InstanceType<
        typeof FileStorageService
      >;

      // The disposition decision is internal; expose it via a helper used by
      // getPresignedUrl. For a PDF (non-image) it must request attachment.
      const pdfDisposition = (svc as any).resolveDisposition(
        'application/pdf',
      );
      expect(pdfDisposition.contentDisposition).toBe('attachment');
      expect(pdfDisposition.contentType).toBe('application/octet-stream');

      // For a genuine image, inline display is acceptable.
      const imgDisposition = (svc as any).resolveDisposition('image/png');
      expect(imgDisposition.contentDisposition).toBeUndefined();
    });

    it('getPresignedUrl still returns a URL in test mode for a non-image type', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/items/${taskId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('a document'), {
          filename: 'doc.txt',
          contentType: 'text/plain',
        });
      const attachmentId = uploadRes.body.data.item.id;

      const res = await request(app.getHttpServer())
        .get(
          `/api/projects/${projectId}/items/${taskId}/attachments/${attachmentId}/url`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.url).toBeDefined();
      expect(res.body.data.expiresIn).toBe(3600);
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
