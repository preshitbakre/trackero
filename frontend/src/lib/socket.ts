import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('accessToken');
    socket = io('/', {
      auth: { token: `Bearer ${token}` },
      autoConnect: false,
      transports: ['websocket'],
    });
    // Register once per socket instance: log auth/transport failures so the
    // UI has a signal when the server rejects us (expired token, deactivated
    // account, etc.). Refresh flow is handled by the apiClient — don't try
    // to recover from here.
    socket.on('connect_error', (err) => {
      console.error('[socket] connect_error', err.message);
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  const token = localStorage.getItem('accessToken');
  if (token && !s.connected) {
    s.auth = { token: `Bearer ${token}` };
    s.connect();
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Sync the socket's auth token with the current value in localStorage.
 * Called by the apiClient after a successful token refresh so the live
 * socket doesn't keep using a stale token. If the socket is currently
 * connected, force a reconnect so the server re-validates with the new
 * token. No-op if no socket has been created yet.
 */
export function updateSocketAuth(): void {
  if (!socket) return;
  const token = localStorage.getItem('accessToken');
  socket.auth = { token: `Bearer ${token}` };
  if (socket.connected) {
    socket.disconnect();
    socket.connect();
  }
}

export function joinProject(projectId: number) {
  getSocket().emit('join:project', { projectId });
}

export function leaveProject(projectId: number) {
  getSocket().emit('leave:project', { projectId });
}
