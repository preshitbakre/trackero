import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';

describe('Task Types (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let memberToken: string;
  let projectId: number;

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

    // Create project (auto-creates 3 built-in types)
    const projRes = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Types Test', prefix: 'TTYP' });
    projectId = projRes.body.data.item.id;

    // Add member to project
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: member.id, role: 'member' });
  });

  test('list task types returns built-in types for project', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/task-types`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.list.length).toBe(3);
    expect(res.body.data.list[0].name).toBe('Task');
    expect(res.body.data.list[0].isBuiltin).toBe(true);
    expect(res.body.data.list[1].name).toBe('Bug');
    expect(res.body.data.list[2].name).toBe('Story');
  });

  test('create custom type → 201', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/task-types`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Chore', color: '#F59E0B', icon: 'wrench' })
      .expect(201);

    expect(res.body.data.item.name).toBe('Chore');
    expect(res.body.data.item.isBuiltin).toBe(false);
    expect(res.body.data.item.color).toBe('#F59E0B');
    expect(res.body.data.item.icon).toBe('wrench');
  });

  test('create duplicate name → 409', async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/task-types`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Task' })
      .expect(409);
  });

  test('delete custom type → 200', async () => {
    // Create custom type
    const createRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/task-types`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Spike' });
    const typeId = createRes.body.data.item.id;

    await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/task-types/${typeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Verify deleted
    const listRes = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/task-types`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.body.data.list.find((t: any) => t.name === 'Spike')).toBeUndefined();
  });

  test('delete built-in type → 400 BUILTIN_TYPE', async () => {
    const listRes = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/task-types`)
      .set('Authorization', `Bearer ${adminToken}`);
    const builtInId = listRes.body.data.list[0].id;

    const res = await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/task-types/${builtInId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    expect(res.body.code).toBe('F-L-0081');
  });

  test('delete type with tasks → 409 TYPE_IN_USE', async () => {
    // Create custom type
    const createRes = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/task-types`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Chore' });
    const typeId = createRes.body.data.item.id;

    // Create task using this type
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'My chore', typeId });

    // Try to delete
    const res = await request(app.getHttpServer())
      .delete(`/api/projects/${projectId}/task-types/${typeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    expect(res.body.code).toBe('F-L-0080');
  });

  test('rename built-in type → 200', async () => {
    const listRes = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}/task-types`)
      .set('Authorization', `Bearer ${adminToken}`);
    const bugType = listRes.body.data.list.find((t: any) => t.name === 'Bug');

    const res = await request(app.getHttpServer())
      .put(`/api/projects/${projectId}/task-types/${bugType.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Defect', color: '#DC2626' })
      .expect(200);

    expect(res.body.data.item.name).toBe('Defect');
    expect(res.body.data.item.color).toBe('#DC2626');
    expect(res.body.data.item.isBuiltin).toBe(true);
  });
});
