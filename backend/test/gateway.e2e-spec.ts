import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp, clearDatabase, registerAdmin, registerInvitedUser } from './setup';
import { io, Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';

function connectSocket(port: number, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) { settled = true; fn(); }
    };

    const socket = io(`http://localhost:${port}`, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket'],
      forceNew: true,
    });

    socket.on('connect', () => {
      // The server may disconnect us right away if auth fails at the
      // handleConnection level (it calls client.disconnect() rather than
      // throwing a handshake error). Wait a short tick to detect that.
      setTimeout(() => {
        if (socket.connected) {
          settle(() => resolve(socket));
        } else {
          settle(() => reject(new Error('Socket disconnected immediately after connect (auth rejected)')));
        }
      }, 300);
    });

    socket.on('connect_error', (err) => settle(() => reject(err)));

    socket.on('disconnect', (reason) => {
      // Server-initiated disconnect before we've settled = auth rejection
      settle(() => reject(new Error(`Socket disconnected by server: ${reason}`)));
    });

    setTimeout(() => settle(() => reject(new Error('Socket connect timeout'))), 5000);
  });
}

function waitForEvent<T = unknown>(socket: ClientSocket, event: string, timeout = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (data: T) => { clearTimeout(timer); resolve(data); });
  });
}

describe('WebSocket Gateway (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let port: number;
  let adminToken: string;
  let adminId: number;
  let memberToken: string;
  let memberId: number;
  let projectId: number;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    // The app needs to actually listen on a port for WebSocket connections
    await app.listen(0);
    port = app.getHttpServer().address().port;
  });
  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    for (const s of sockets) s.disconnect();
    sockets.length = 0;

    await clearDatabase(app);
    const admin = await registerAdmin(app);
    adminToken = admin.token; adminId = admin.id;
    const member = await registerInvitedUser(app, adminToken, 'ws-member@test.com', 'member');
    memberToken = member.token; memberId = member.id;

    const projRes = await request(app.getHttpServer())
      .post('/api/projects').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'WSTest', prefix: 'WST' });
    projectId = projRes.body.data.item.id;

    // Add member to the project so they can join the room
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'member' });
  });

  async function connect(token: string): Promise<ClientSocket> {
    const socket = await connectSocket(port, token);
    sockets.push(socket);
    return socket;
  }

  it('connects with valid JWT', async () => {
    const socket = await connect(adminToken);
    expect(socket.connected).toBe(true);
  });

  it('rejects connection with invalid JWT', async () => {
    await expect(connectSocket(port, 'garbage-token')).rejects.toThrow();
  });

  it('rejects connection for deactivated user', async () => {
    await ds.query(`UPDATE users SET is_active = false WHERE id = $1`, [memberId]);
    await expect(connectSocket(port, memberToken)).rejects.toThrow();
  });

  it('join:project returns presence:state', async () => {
    const socket = await connect(adminToken);
    const statePromise = waitForEvent(socket, 'presence:state');
    socket.emit('join:project', { projectId });
    const state: any = await statePromise;
    expect(state.projectId).toBe(projectId);
    expect(state.users).toBeInstanceOf(Array);
  });

  it('non-member cannot join project room', async () => {
    const proj2 = await request(app.getHttpServer())
      .post('/api/projects').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Private', prefix: 'PVT' });
    const proj2Id = proj2.body.data.item.id;

    const socket = await connect(memberToken);
    const errorPromise = waitForEvent(socket, 'error');
    socket.emit('join:project', { projectId: proj2Id });
    const err: any = await errorPromise;
    expect(err.message).toContain('Not authorized');
  });

  it('admin can join any project', async () => {
    const socket = await connect(adminToken);
    const statePromise = waitForEvent(socket, 'presence:state');
    socket.emit('join:project', { projectId });
    const state: any = await statePromise;
    expect(state.projectId).toBe(projectId);
  });

  it('second user joining triggers presence:joined for first', async () => {
    const socket1 = await connect(adminToken);
    const stateP = waitForEvent(socket1, 'presence:state');
    socket1.emit('join:project', { projectId });
    await stateP;

    const joinedPromise = waitForEvent(socket1, 'presence:joined');

    const socket2 = await connect(memberToken);
    const stateP2 = waitForEvent(socket2, 'presence:state');
    socket2.emit('join:project', { projectId });
    await stateP2;

    const joined: any = await joinedPromise;
    expect(joined.userId).toBe(memberId);
    expect(joined.projectId).toBe(projectId);
  });

  it('leave:project broadcasts presence:left', async () => {
    const socket1 = await connect(adminToken);
    socket1.emit('join:project', { projectId });
    await waitForEvent(socket1, 'presence:state');

    const socket2 = await connect(memberToken);
    socket2.emit('join:project', { projectId });
    await waitForEvent(socket2, 'presence:state');

    const leftPromise = waitForEvent(socket1, 'presence:left');
    socket2.emit('leave:project', { projectId });
    const left: any = await leftPromise;
    expect(left.userId).toBe(memberId);
  });

  it('disconnect cleans up presence', async () => {
    const socket1 = await connect(adminToken);
    socket1.emit('join:project', { projectId });
    await waitForEvent(socket1, 'presence:state');

    const socket2 = await connect(memberToken);
    socket2.emit('join:project', { projectId });
    await waitForEvent(socket2, 'presence:state');

    const leftPromise = waitForEvent(socket1, 'presence:left');
    socket2.disconnect();
    const left: any = await leftPromise;
    expect(left.userId).toBe(memberId);
  });

  it('multi-tab: second join does not re-broadcast presence:joined', async () => {
    const socket1 = await connect(adminToken);
    socket1.emit('join:project', { projectId });
    await waitForEvent(socket1, 'presence:state');

    const observer = await connect(memberToken);
    observer.emit('join:project', { projectId });
    await waitForEvent(observer, 'presence:state');

    const socket2 = await connect(adminToken);

    let joinedFired = false;
    observer.on('presence:joined', (data: any) => {
      if (data.userId === adminId) joinedFired = true;
    });

    socket2.emit('join:project', { projectId });
    await waitForEvent(socket2, 'presence:state');

    await new Promise((r) => setTimeout(r, 500));
    expect(joinedFired).toBe(false);
  });
});
