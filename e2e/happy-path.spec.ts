import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001/api';
const unique = () => Math.random().toString(36).slice(2, 8);

test.describe('Happy Path E2E', () => {
  let adminToken: string;
  let projectId: number;
  let projectPrefix: string;

  test.beforeAll(async ({ request }) => {
    // Register a fresh user and make them admin via API
    const email = `e2e-admin-${unique()}@test.com`;
    const regRes = await request.post(`${API}/auth/register`, {
      data: { email, password: 'password123', displayName: 'E2E Admin' },
    });
    const regData = await regRes.json();
    adminToken = regData.data.accessToken;

    // The first user may already be admin from seed. Use the token directly.
    // If not admin, we'll use seed admin credentials
    const meRes = await request.get(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const me = await meRes.json();
    if (me.data.role !== 'admin') {
      // Login as seed admin
      const loginRes = await request.post(`${API}/auth/login`, {
        data: { email: 'admin@trackero.dev', password: 'admin123456' },
      });
      const loginData = await loginRes.json();
      adminToken = loginData.data.accessToken;
    }
  });

  test('Register → Project → Epic → Sprint → Tasks → Board → Complete → Burndown', async ({ request }) => {
    const prefix = `E2E${unique().slice(0, 4).toUpperCase()}`;
    projectPrefix = prefix;

    // 1. Create project
    const projRes = await request.post(`${API}/projects`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: `E2E Project ${prefix}`, prefix },
    });
    expect(projRes.status()).toBe(201);
    const projData = await projRes.json();
    projectId = projData.data.item.id;

    // 2. Create epic
    const epicRes = await request.post(`${API}/projects/${projectId}/epics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { title: 'Authentication Epic', priority: 'high' },
    });
    expect(epicRes.status()).toBe(201);
    const epicId = (await epicRes.json()).data.item.id;

    // 3. Create sprint
    const sprintRes = await request.post(`${API}/projects/${projectId}/sprints`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'Sprint 1', goal: 'Complete auth' },
    });
    expect(sprintRes.status()).toBe(201);
    const sprintId = (await sprintRes.json()).data.item.id;

    // 4. Create tasks in sprint
    const task1Res = await request.post(`${API}/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { title: 'Login page', storyPoints: 3, sprintId, epicId },
    });
    expect(task1Res.status()).toBe(201);
    const task1Id = (await task1Res.json()).data.item.id;

    const task2Res = await request.post(`${API}/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { title: 'Register page', storyPoints: 5, sprintId, epicId },
    });
    expect(task2Res.status()).toBe(201);

    // 5. Start sprint
    const startRes = await request.post(`${API}/projects/${projectId}/sprints/${sprintId}/start`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(startRes.status()).toBe(200);

    // 6. View board
    const boardRes = await request.get(`${API}/projects/${projectId}/board?sprintId=${sprintId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(boardRes.status()).toBe(200);
    const boardData = await boardRes.json();
    expect(boardData.data.columns.length).toBe(6);

    // 7. Move task to done via board
    const doneStatus = boardData.data.columns.find((c: any) => c.status.category === 'done');
    const moveRes = await request.put(`${API}/projects/${projectId}/board/move`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { taskId: task1Id, statusId: doneStatus.status.id, sortOrder: 'n' },
    });
    expect(moveRes.status()).toBe(200);
    const moveData = await moveRes.json();
    expect(moveData.data.completedAt).not.toBeNull();

    // 8. Complete sprint
    const completeRes = await request.post(`${API}/projects/${projectId}/sprints/${sprintId}/complete`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(completeRes.status()).toBe(200);
    const completeData = await completeRes.json();
    expect(completeData.data.movedTasks).toBe(1); // task2 incomplete

    // 9. View burndown
    const burndownRes = await request.get(`${API}/projects/${projectId}/sprints/${sprintId}/burndown`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(burndownRes.status()).toBe(200);
    const burndownData = await burndownRes.json();
    expect(burndownData.data.totalPoints).toBe(8);

    // 10. Create retrospective
    const retroRes = await request.post(`${API}/projects/${projectId}/sprints/${sprintId}/retro`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(retroRes.status()).toBe(201);
    const retroId = (await retroRes.json()).data.id;

    // Add retro card
    const cardRes = await request.post(`${API}/projects/${projectId}/retro/${retroId}/cards`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { column: 'went_well', content: 'Great teamwork' },
    });
    expect(cardRes.status()).toBe(201);
  });
});
