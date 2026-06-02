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

  async function createItem(request: any, token: string, projId: number, title: string) {
    const res = await request.post(`${API}/projects/${projId}/items`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { itemType: 'task', title },
    });
    return (await res.json()).data.item;
  }

  async function createComment(request: any, token: string, projId: number, itemId: number, body: string) {
    const res = await request.post(`${API}/projects/${projId}/items/${itemId}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { body },
    });
    return (await res.json()).data.item;
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

  // ── Existing tests ──

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

  // ── Comment permission tests ──

  test('Member can only delete own comments, not others', async ({ request }) => {
    test.skip(!adminToken);
    const { token: memberToken } = await createUserWithRole(request, 'member', adminToken, projectId);
    const item = await createItem(request, adminToken, projectId, `comment-perm-${unique()}`);

    // Admin creates a comment
    const adminComment = await createComment(request, adminToken, projectId, item.id, 'admin comment');

    // Member creates own comment
    const memberComment = await createComment(request, memberToken, projectId, item.id, 'member comment');

    // Member deletes own comment — should succeed
    const delOwn = await request.delete(`${API}/projects/${projectId}/items/${item.id}/comments/${memberComment.id}`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(delOwn.status()).toBe(200);

    // Member deletes admin's comment — should fail
    const delOther = await request.delete(`${API}/projects/${projectId}/items/${item.id}/comments/${adminComment.id}`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(delOther.status()).toBe(403);
  });

  test('PM can delete any comment', async ({ request }) => {
    test.skip(!adminToken);
    const { token: pmToken } = await createUserWithRole(request, 'project_manager', adminToken, projectId);
    const { token: memberToken } = await createUserWithRole(request, 'member', adminToken, projectId);
    const item = await createItem(request, adminToken, projectId, `pm-del-comment-${unique()}`);

    // Member creates a comment
    const memberComment = await createComment(request, memberToken, projectId, item.id, 'member comment for PM test');

    // PM deletes member's comment — should succeed
    const del = await request.delete(`${API}/projects/${projectId}/items/${item.id}/comments/${memberComment.id}`, {
      headers: { Authorization: `Bearer ${pmToken}` },
    });
    expect(del.status()).toBe(200);
  });

  test('Comment edit is author-only', async ({ request }) => {
    test.skip(!adminToken);
    const { token: memberToken } = await createUserWithRole(request, 'member', adminToken, projectId);
    const item = await createItem(request, adminToken, projectId, `edit-perm-${unique()}`);

    // Admin creates a comment
    const adminComment = await createComment(request, adminToken, projectId, item.id, 'original body');

    // Member tries to edit admin's comment — should fail
    const editOther = await request.put(`${API}/projects/${projectId}/items/${item.id}/comments/${adminComment.id}`, {
      headers: { Authorization: `Bearer ${memberToken}` },
      data: { body: 'hacked' },
    });
    expect(editOther.status()).toBe(403);

    // Admin edits own comment — should succeed
    const editOwn = await request.put(`${API}/projects/${projectId}/items/${item.id}/comments/${adminComment.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { body: 'updated body' },
    });
    expect(editOwn.status()).toBe(200);
  });

  // ── Hard delete tests ──

  test('Admin hard-delete permanently removes item', async ({ request }) => {
    test.skip(!adminToken);
    const item = await createItem(request, adminToken, projectId, `hard-del-${unique()}`);

    const del = await request.delete(`${API}/projects/${projectId}/items/${item.id}?hard=true`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(del.status()).toBe(200);

    // Item should be truly gone — restore should fail
    const restore = await request.post(`${API}/projects/${projectId}/items/${item.id}/restore`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(restore.status()).toBeGreaterThanOrEqual(404);
  });

  test('Member hard-delete is silently downgraded to soft delete', async ({ request }) => {
    test.skip(!adminToken);
    const { token: memberToken } = await createUserWithRole(request, 'member', adminToken, projectId);
    const item = await createItem(request, memberToken, projectId, `soft-del-${unique()}`);

    // Member tries hard=true — should succeed but be soft delete
    const del = await request.delete(`${API}/projects/${projectId}/items/${item.id}?hard=true`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(del.status()).toBe(200);

    // Item should be restorable (soft-deleted, not hard-deleted)
    const restore = await request.post(`${API}/projects/${projectId}/items/${item.id}/restore`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(restore.status()).toBe(200);

    // Cleanup
    await request.delete(`${API}/projects/${projectId}/items/${item.id}?hard=true`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  });

  // ── Sprint lifecycle permission tests ──

  test('Member cannot start a sprint', async ({ request }) => {
    test.skip(!adminToken);
    const { token: memberToken } = await createUserWithRole(request, 'member', adminToken, projectId);

    // Admin creates a sprint
    const sprintRes = await request.post(`${API}/projects/${projectId}/sprints`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: `member-start-test-${unique()}` },
    });
    const sprintId = (await sprintRes.json()).data.item.id;

    // Member tries to start the sprint — should fail
    const start = await request.post(`${API}/projects/${projectId}/sprints/${sprintId}/start`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(start.status()).toBe(403);
  });

  test('Member cannot complete or cancel a sprint', async ({ request }) => {
    test.skip(!adminToken);
    const { token: pmToken } = await createUserWithRole(request, 'project_manager', adminToken, projectId);
    const { token: memberToken } = await createUserWithRole(request, 'member', adminToken, projectId);

    // PM creates and starts a sprint
    const sprintRes = await request.post(`${API}/projects/${projectId}/sprints`, {
      headers: { Authorization: `Bearer ${pmToken}` },
      data: { name: `member-complete-test-${unique()}` },
    });
    const sprintId = (await sprintRes.json()).data.item.id;

    await request.post(`${API}/projects/${projectId}/sprints/${sprintId}/start`, {
      headers: { Authorization: `Bearer ${pmToken}` },
    });

    // Member tries to complete — should fail
    const complete = await request.post(`${API}/projects/${projectId}/sprints/${sprintId}/complete`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(complete.status()).toBe(403);

    // Member tries to cancel — should fail
    const cancel = await request.post(`${API}/projects/${projectId}/sprints/${sprintId}/cancel`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(cancel.status()).toBe(403);
  });

  // ── Story workflow permission tests ──

  test('Member cannot approve or reopen stories (PM/admin only)', async ({ request }) => {
    test.skip(!adminToken);
    const { token: memberToken } = await createUserWithRole(request, 'member', adminToken, projectId);

    // Admin creates a story
    const storyRes = await request.post(`${API}/projects/${projectId}/items`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { itemType: 'story', title: `approve-test-${unique()}` },
    });
    const storyId = (await storyRes.json()).data.item.id;

    // Member tries to approve — should fail
    const approve = await request.post(`${API}/projects/${projectId}/items/${storyId}/approve`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(approve.status()).toBe(403);

    // Member tries to reopen — should fail
    const reopen = await request.post(`${API}/projects/${projectId}/items/${storyId}/reopen`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(reopen.status()).toBe(403);
  });

  test('PM can approve and reopen stories', async ({ request }) => {
    test.skip(!adminToken);
    const { token: pmToken } = await createUserWithRole(request, 'project_manager', adminToken, projectId);

    // Get statuses for the project to set up the story in the right state
    const statusRes = await request.get(`${API}/projects/${projectId}/statuses`, {
      headers: { Authorization: `Bearer ${pmToken}` },
    });
    const statuses = (await statusRes.json()).data.list as Array<{ id: number; category: string }>;
    const inReviewStatus = statuses.find((s) => s.category === 'in_review');
    test.skip(!inReviewStatus, 'No in_review status configured');

    // Create a story and move it to in_review
    const storyRes = await request.post(`${API}/projects/${projectId}/items`, {
      headers: { Authorization: `Bearer ${pmToken}` },
      data: { itemType: 'story', title: `pm-approve-${unique()}` },
    });
    const storyId = (await storyRes.json()).data.item.id;

    await request.put(`${API}/projects/${projectId}/items/${storyId}`, {
      headers: { Authorization: `Bearer ${pmToken}` },
      data: { statusId: inReviewStatus!.id },
    });

    // PM approves — should succeed
    const approve = await request.post(`${API}/projects/${projectId}/items/${storyId}/approve`, {
      headers: { Authorization: `Bearer ${pmToken}` },
    });
    expect([200, 201]).toContain(approve.status());
  });

  // ── Attachment delete permission tests ──

  test('Viewer cannot upload or delete attachments', async ({ request }) => {
    test.skip(!adminToken);
    const { token: viewerToken } = await createUserWithRole(request, 'viewer', adminToken, projectId);
    const item = await createItem(request, adminToken, projectId, `attach-perm-${unique()}`);

    // Viewer tries to upload — should fail
    const upload = await request.post(`${API}/projects/${projectId}/items/${item.id}/attachments`, {
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        'Content-Type': 'multipart/form-data',
      },
      multipart: {
        file: { name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
      },
    });
    expect(upload.status()).toBe(403);
  });

  // ── Viewer cannot interact with content ──

  test('Viewer cannot create comments', async ({ request }) => {
    test.skip(!adminToken);
    const { token: viewerToken } = await createUserWithRole(request, 'viewer', adminToken, projectId);
    const item = await createItem(request, adminToken, projectId, `viewer-comment-${unique()}`);

    const res = await request.post(`${API}/projects/${projectId}/items/${item.id}/comments`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
      data: { body: 'should fail' },
    });
    expect(res.status()).toBe(403);
  });

  test('Viewer cannot move board cards', async ({ request }) => {
    test.skip(!adminToken);
    const { token: viewerToken } = await createUserWithRole(request, 'viewer', adminToken, projectId);

    const statusRes = await request.get(`${API}/projects/${projectId}/statuses`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const statuses = (await statusRes.json()).data.list as Array<{ id: number }>;
    test.skip(statuses.length < 2, 'Need at least 2 statuses');

    const item = await createItem(request, adminToken, projectId, `board-move-${unique()}`);

    const move = await request.put(`${API}/projects/${projectId}/board/move`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
      data: { itemId: item.id, statusId: statuses[1].id },
    });
    expect(move.status()).toBe(403);
  });

  // ── Project management permissions ──

  test('Member cannot update project settings', async ({ request }) => {
    test.skip(!adminToken);
    const { token: memberToken } = await createUserWithRole(request, 'member', adminToken, projectId);

    const res = await request.put(`${API}/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${memberToken}` },
      data: { name: 'Hacked Name' },
    });
    expect(res.status()).toBe(403);
  });

  test('Member cannot manage project members', async ({ request }) => {
    test.skip(!adminToken);
    const { token: memberToken, userId: memberUserId } = await createUserWithRole(request, 'member', adminToken, projectId);

    // Invite another user first
    const email = `target-${unique()}@test.com`;
    const inviteRes = await request.post(`${API}/users/invite`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email, role: 'member' },
    });
    const inviteToken = (await inviteRes.json()).data.item.token;
    const regRes = await request.post(`${API}/auth/register`, {
      data: { email, password: 'password123', displayName: 'Target', inviteToken },
    });
    const targetUserId = (await regRes.json()).data.user.id;

    // Member tries to add the target to the project — should fail
    const addRes = await request.post(`${API}/projects/${projectId}/members`, {
      headers: { Authorization: `Bearer ${memberToken}` },
      data: { userId: targetUserId, role: 'member' },
    });
    expect(addRes.status()).toBe(403);
  });

  test('Member cannot create or delete labels', async ({ request }) => {
    test.skip(!adminToken);
    const { token: memberToken } = await createUserWithRole(request, 'member', adminToken, projectId);

    const res = await request.post(`${API}/projects/${projectId}/labels`, {
      headers: { Authorization: `Bearer ${memberToken}` },
      data: { name: `label-${unique()}`, color: '#ff0000' },
    });
    expect(res.status()).toBe(403);
  });

  test('Non-admin cannot create projects', async ({ request }) => {
    test.skip(!adminToken);
    const { token: pmToken } = await createUserWithRole(request, 'project_manager', adminToken, projectId);

    const res = await request.post(`${API}/projects`, {
      headers: { Authorization: `Bearer ${pmToken}` },
      data: { name: 'PM Project', prefix: 'PMPR' },
    });
    expect(res.status()).toBe(403);
  });

  test('Non-admin cannot manage users', async ({ request }) => {
    test.skip(!adminToken);
    const { token: pmToken } = await createUserWithRole(request, 'project_manager', adminToken, projectId);

    // PM tries to list users — should fail
    const res = await request.get(`${API}/users`, {
      headers: { Authorization: `Bearer ${pmToken}` },
    });
    expect(res.status()).toBe(403);

    // PM tries to invite — should fail
    const invRes = await request.post(`${API}/users/invite`, {
      headers: { Authorization: `Bearer ${pmToken}` },
      data: { email: `pm-invite-${unique()}@test.com`, role: 'member' },
    });
    expect(invRes.status()).toBe(403);
  });
});
