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

export function joinProject(projectId: number) {
  getSocket().emit('join:project', { projectId });
}

export function leaveProject(projectId: number) {
  getSocket().emit('leave:project', { projectId });
}
