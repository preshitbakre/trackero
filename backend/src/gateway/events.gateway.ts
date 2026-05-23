import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import {
  COMMENT_ADDED,
  type CommentAddedPayload,
} from '../comments/events/comment-added.event';
import {
  SOCKET_EVENTS,
  type CommentAddedSocketPayload,
} from './events/socket-events';

@WebSocketGateway({
  cors: {
    origin: process.env.APP_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token?.replace('Bearer ', '') || '';
      const payload = this.jwtService.verify(token);

      // Verify user is active and tokenVersion matches
      const [user] = await this.dataSource.query(
        'SELECT is_active, token_version FROM users WHERE id = $1',
        [payload.userId],
      );
      if (!user || !user.is_active || user.token_version !== payload.tokenVersion) {
        client.disconnect();
        return;
      }

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
  async handleJoinProject(client: Socket, payload: { projectId: number }) {
    const userId = client.data.userId;
    if (!userId) return;

    // Verify membership (admin can access all)
    const [user] = await this.dataSource.query(
      'SELECT role FROM users WHERE id = $1', [userId]
    );
    if (user?.role !== 'admin') {
      const [member] = await this.dataSource.query(
        'SELECT id FROM project_members WHERE user_id = $1 AND project_id = $2',
        [userId, payload.projectId]
      );
      if (!member) {
        client.emit('error', { message: 'Not authorized for this project' });
        return;
      }
    }

    client.join(`project:${payload.projectId}`);
  }

  @SubscribeMessage('leave:project')
  handleLeaveProject(client: Socket, payload: { projectId: number }) {
    client.leave(`project:${payload.projectId}`);
  }

  // --- Broadcast events to project rooms ---

  @OnEvent('work_item.created')
  onWorkItemCreated(payload: { item: any; userId: number; projectId: number }) {
    try {
      this.server?.to(`project:${payload.projectId}`).emit('work-item:created', { itemId: payload.item?.id });
    } catch (err) {
      this.logger.error(`onWorkItemCreated failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('work_item.updated')
  onWorkItemUpdated(payload: { item: any; userId: number; projectId: number; changes: any }) {
    try {
      this.server?.to(`project:${payload.projectId}`).emit('work-item:updated', { itemId: payload.item?.id });
    } catch (err) {
      this.logger.error(`onWorkItemUpdated failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('work_item.deleted')
  onWorkItemDeleted(payload: { itemId: number; itemType: string; userId: number; projectId: number }) {
    try {
      this.server?.to(`project:${payload.projectId}`).emit('work-item:deleted', { itemId: payload.itemId });
    } catch (err) {
      this.logger.error(`onWorkItemDeleted failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('board.moved')
  onBoardMoved(payload: { projectId: number; itemId: number; statusId: number; sortOrder: string; completedAt: Date | null; actorId: number }) {
    try {
      this.server?.to(`project:${payload.projectId}`).emit('board:moved', {
        itemId: payload.itemId,
        statusId: payload.statusId,
        sortOrder: payload.sortOrder,
        completedAt: payload.completedAt,
        actorId: payload.actorId,
      });
    } catch (err) {
      this.logger.error(`onBoardMoved failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('sprint.started')
  onSprintStarted(payload: { sprintId: number; projectId: number }) {
    try {
      this.server?.to(`project:${payload.projectId}`).emit('sprint:updated', { sprintId: payload.sprintId, status: 'active' });
    } catch (err) {
      this.logger.error(`onSprintStarted failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('sprint.completed')
  onSprintCompleted(payload: { sprintId: number; projectId: number }) {
    try {
      this.server?.to(`project:${payload.projectId}`).emit('sprint:updated', { sprintId: payload.sprintId, status: 'completed' });
    } catch (err) {
      this.logger.error(`onSprintCompleted failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent(COMMENT_ADDED)
  onCommentAdded(payload: CommentAddedPayload) {
    try {
      const socketPayload: CommentAddedSocketPayload = {
        workItemId: payload.workItemId,
        projectId: payload.projectId,
        commentId: payload.commentId,
        authorId: payload.actorId,
        mentionedUserIds: payload.mentionedUserIds,
      };
      this.server?.to(`project:${payload.projectId}`).emit(SOCKET_EVENTS.COMMENT_ADDED, socketPayload);
    } catch (err) {
      this.logger.error(`onCommentAdded failed: ${err}`, (err as Error)?.stack);
    }
  }

  @OnEvent('notification.created')
  onNotificationCreated(payload: { notification: any }) {
    try {
      this.server?.to(`user:${payload.notification.userId}`).emit('notification:new', payload.notification);
    } catch (err) {
      this.logger.error(`onNotificationCreated failed: ${err}`, (err as Error)?.stack);
    }
  }
}
