import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token?.replace('Bearer ', '') || '';
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.userId;
      // Auto-join user room
      client.join(`user:${payload.userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {
    // Cleanup handled by Socket.IO
  }

  @SubscribeMessage('join:project')
  handleJoinProject(client: Socket, payload: { projectId: number }) {
    client.join(`project:${payload.projectId}`);
  }

  @SubscribeMessage('leave:project')
  handleLeaveProject(client: Socket, payload: { projectId: number }) {
    client.leave(`project:${payload.projectId}`);
  }

  // --- Broadcast events to project rooms ---

  @OnEvent('task.created')
  onTaskCreated(payload: { taskId: number; projectId: number }) {
    this.server?.to(`project:${payload.projectId}`).emit('task:created', { taskId: payload.taskId });
  }

  @OnEvent('task.updated')
  onTaskUpdated(payload: { taskId: number; projectId: number }) {
    this.server?.to(`project:${payload.projectId}`).emit('task:updated', { taskId: payload.taskId });
  }

  @OnEvent('task.deleted')
  onTaskDeleted(payload: { taskId: number; projectId: number }) {
    this.server?.to(`project:${payload.projectId}`).emit('task:deleted', { taskId: payload.taskId });
  }

  @OnEvent('task.status_changed')
  onBoardMoved(payload: { taskId: number; projectId: number; newStatusId: number }) {
    this.server?.to(`project:${payload.projectId}`).emit('board:moved', {
      taskId: payload.taskId,
      statusId: payload.newStatusId,
    });
  }

  @OnEvent('sprint.started')
  onSprintStarted(payload: { sprintId: number; projectId: number }) {
    this.server?.to(`project:${payload.projectId}`).emit('sprint:updated', { sprintId: payload.sprintId, status: 'active' });
  }

  @OnEvent('sprint.completed')
  onSprintCompleted(payload: { sprintId: number; projectId: number }) {
    this.server?.to(`project:${payload.projectId}`).emit('sprint:updated', { sprintId: payload.sprintId, status: 'completed' });
  }

  @OnEvent('comment.added')
  onCommentAdded(payload: { taskId: number; projectId: number; commentId: number }) {
    this.server?.to(`project:${payload.projectId}`).emit('comment:added', { taskId: payload.taskId, commentId: payload.commentId });
  }

  @OnEvent('notification.created')
  onNotificationCreated(payload: { notification: any }) {
    this.server?.to(`user:${payload.notification.userId}`).emit('notification:new', payload.notification);
  }
}
