import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001/api';
const unique = () => Math.random().toString(36).slice(2, 8);

test.describe('RBAC E2E', () => {
  let adminToken: string;
  let projectId: number;

  async function getAdminToken(request: any): Promise<string> {
    // Register first user as admin (if DB is clean) or use existing
    const email = `rbac-admin-${unique()}@test.com`;
    const regRes = await request.post(`${API}/auth/register`, {
      data: { email, password: 'password123', displayName: 'RBAC Admin' },
    });
    if (regRes.status() === 201) {
      return (await regRes.json()).data.accessToken;
    }
    // If registration failed (needs invite), there's already an admin — skip
    return '';
  }

  async function createUserWithRole(request: any, role: string, adminTok: string, projId: number) {
    // Admin invites user
    const email = `${role}-${unique()}@test.com`;
    const inviteRes = await request.post(`${API}/users/invite`, {
      headers: { Authorization: `Bearer ${adminTok}` },
      data: { email, role: role === 'project_manager' ? 'project_manager' : role },
    });
    const inviteData = await inviteRes.json();
    const inviteToken = inviteData.data.item.token;

    // User registers with invite
    const regRes = await request.post(`${API}/auth/register`, {
      data: { email, password: 'password123', displayName: `${role} user`, inviteToken },
    });
    const regData = await regRes.json();
    const userId = regData.data.user.id;
    const token = regData.data.accessToken;

    // Add to project with role
    await request.post(`${API}/projects/${projId}/members`, {
      headers: { Authorization: `Bearer ${adminTok}` },
      data: { userId, role },
    });

    return { token, userId };
  }

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
    test.skip(!adminToken, 'Could not create admin — DB not clean');

    const prefix = `RBAC${unique().slice(0, 3).toUpperCase()}`;
    const projRes = await request.post(`${API}/projects`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'RBAC Test', prefix },
    });
    projectId = (await projRes.json()).data.item.id;
  });

  test('Viewer cannot create tasks', async ({ request }) => {
    test.skip(!adminToken);
    const { token } = await createUserWithRole(request, 'viewer', adminToken, projectId);

    const res = await request.post(`${API}/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: 'Should fail' },
    });
    expect(res.status()).toBe(403);
  });

  test('Member can create tasks', async ({ request }) => {
    test.skip(!adminToken);
    const { token } = await createUserWithRole(request, 'member', adminToken, projectId);

    const res = await request.post(`${API}/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: 'Member task' },
    });
    expect(res.status()).toBe(201);
  });

  test('Member cannot delete other users tasks', async ({ request }) => {
    test.skip(!adminToken);
    const taskRes = await request.post(`${API}/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { title: 'Admin task for delete test' },
    });
    const taskId = (await taskRes.json()).data.item.id;

    const { token } = await createUserWithRole(request, 'member', adminToken, projectId);
    const delRes = await request.delete(`${API}/projects/${projectId}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.status()).toBe(403);
  });

  test('PM can manage sprints', async ({ request }) => {
    test.skip(!adminToken);
    const { token } = await createUserWithRole(request, 'project_manager', adminToken, projectId);

    const res = await request.post(`${API}/projects/${projectId}/sprints`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `PM Sprint ${unique()}` },
    });
    expect(res.status()).toBe(201);
  });

  test('Registration without invite token is rejected', async ({ request }) => {
    const res = await request.post(`${API}/auth/register`, {
      data: { email: `noinvite-${unique()}@test.com`, password: 'password123', displayName: 'No Invite' },
    });
    expect(res.status()).toBe(403);
  });
});
