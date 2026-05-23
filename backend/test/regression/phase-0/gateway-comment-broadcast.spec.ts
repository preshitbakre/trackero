/**
 * T0.8 regression — the gateway must broadcast comment:added with the
 * canonical CommentAddedSocketPayload shape (workItemId, projectId,
 * commentId, authorId, mentionedUserIds). The audit caught it
 * broadcasting `{ taskId: undefined, commentId }` because the gateway
 * was reading the wrong payload field.
 *
 * The test invokes the gateway's @OnEvent handler directly with a
 * domain payload, captures the server.emit call via a stub, and
 * asserts the broadcast shape.
 */
import { EventsGateway } from '../../../src/gateway/events.gateway';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';

describe('T0.8 — gateway emits comment:added with canonical payload', () => {
  it('translates the in-process payload to the socket contract shape', () => {
    const emitSpy = vi.fn();
    const toSpy = vi.fn(() => ({ emit: emitSpy }));
    const fakeServer = { to: toSpy } as unknown as ConstructorParameters<typeof Object>[0];

    // EventsGateway pulls JwtService and DataSource only inside the
    // handshake path; neither is touched by onCommentAdded, so undefined
    // stand-ins suffice for this unit test.
    const gateway = new EventsGateway(
      {} as JwtService,
      {} as DataSource,
    );
    (gateway as unknown as { server: typeof fakeServer }).server = fakeServer;

    gateway.onCommentAdded({
      workItemId: 142,
      projectId: 7,
      actorId: 11,
      commentId: 904,
      mentionedUserIds: [22, 33],
    });

    expect(toSpy).toHaveBeenCalledWith('project:7');
    expect(emitSpy).toHaveBeenCalledTimes(1);
    const [eventName, payload] = emitSpy.mock.calls[0];
    expect(eventName).toBe('comment:added');
    expect(payload).toEqual({
      workItemId: 142,
      projectId: 7,
      commentId: 904,
      authorId: 11,
      mentionedUserIds: [22, 33],
    });
    // Belt-and-braces: the legacy field name must NOT appear.
    expect(payload).not.toHaveProperty('taskId');
  });
});
