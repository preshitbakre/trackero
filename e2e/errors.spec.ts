import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001/api';
const unique = () => Math.random().toString(36).slice(2, 8);

test.describe('Error Handling E2E', () => {
  let adminToken: string;
  let projectId: number;

  test.beforeAll(async ({ request }) => {
    const loginRes = await request.post(`${API}/auth/login`, {
      data: { email: 'admin@trackero.dev', password: 'admin123456' },
    });
    adminToken = (await loginRes.json()).data.accessToken;

    const prefix = `ERR${unique().slice(0, 4).toUpperCase()}`;
    const projRes = await request.post(`${API}/projects`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'Error Test', prefix },
    });
    projectId = (await projRes.json()).data.item.id;
  });

  test('Cannot complete blocked task -> 409', async ({ request }) => {
    // Create blocker and blocked task
    const t1 = await request.post(`${API}/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { title: 'Blocker' },
    });
    const t2 = await request.post(`${API}/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { title: 'Blocked' },
    });
    const blockerId = (await t1.json()).data.item.id;
    const blockedId = (await t2.json()).data.item.id;

    // Create dependency
    await request.post(`${API}/projects/${projectId}/tasks/${blockedId}/dependencies`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { dependsOnTaskId: blockerId, dependencyType: 'blocks' },
    });

    // Get done status
    const statusRes = await request.get(`${API}/projects/${projectId}/statuses`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const statuses = (await statusRes.json()).data;
    const doneId = statuses.find((s: any) => s.category === 'done').id;

    // Try to move blocked to done
    const moveRes = await request.put(`${API}/projects/${projectId}/board/move`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { taskId: blockedId, statusId: doneId, sortOrder: 'n' },
    });
    expect(moveRes.status()).toBe(409);
    const moveData = await moveRes.json();
    expect(moveData.code).toBe('F-L-0030');
  });

  test('Cannot start sprint with no tasks -> 400', async ({ request }) => {
    const sprintRes = await request.post(`${API}/projects/${projectId}/sprints`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: `Empty Sprint ${unique()}` },
    });
    const sprintId = (await sprintRes.json()).data.item.id;

    const startRes = await request.post(`${API}/projects/${projectId}/sprints/${sprintId}/start`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(startRes.status()).toBe(400);
    expect((await startRes.json()).code).toBe('F-L-0021');
  });

  test('Duplicate project prefix -> 409', async ({ request }) => {
    const prefix = `DUP${unique().slice(0, 3).toUpperCase()}`;

    await request.post(`${API}/projects`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'First', prefix },
    });

    const dupRes = await request.post(`${API}/projects`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'Second', prefix },
    });
    expect(dupRes.status()).toBe(409);
    expect((await dupRes.json()).code).toBe('F-L-0002');
  });

  test('Circular dependency -> 409', async ({ request }) => {
    const t1 = await request.post(`${API}/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { title: 'Circular A' },
    });
    const t2 = await request.post(`${API}/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { title: 'Circular B' },
    });
    const aId = (await t1.json()).data.item.id;
    const bId = (await t2.json()).data.item.id;

    // A blocks B
    await request.post(`${API}/projects/${projectId}/tasks/${bId}/dependencies`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { dependsOnTaskId: aId, dependencyType: 'blocks' },
    });

    // B blocks A -> circular
    const circRes = await request.post(`${API}/projects/${projectId}/tasks/${aId}/dependencies`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { dependsOnTaskId: bId, dependencyType: 'blocks' },
    });
    expect(circRes.status()).toBe(409);
    expect((await circRes.json()).code).toBe('F-L-0031');
  });

  test('One retro per sprint -> 409', async ({ request }) => {
    const sprintRes = await request.post(`${API}/projects/${projectId}/sprints`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: `Retro Sprint ${unique()}` },
    });
    const sprintId = (await sprintRes.json()).data.item.id;

    await request.post(`${API}/projects/${projectId}/sprints/${sprintId}/retro`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const dupRes = await request.post(`${API}/projects/${projectId}/sprints/${sprintId}/retro`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(dupRes.status()).toBe(409);
    expect((await dupRes.json()).code).toBe('F-L-0053');
  });
});
