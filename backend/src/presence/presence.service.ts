import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

/**
 * What a peer is currently doing in a project room. Drives the Today
 * page's "Live · N here now" rail and the board's per-card editing
 * overlay (consumed in Phase 7).
 */
export interface PresenceContext {
  route?: string;
  workItemId?: number | null;
  action?: 'viewing' | 'editing' | 'commenting' | 'idle';
}

export interface PresenceEntry {
  userId: number;
  socketIds: Set<string>;
  joinedAt: string;
  lastSeenAt: string;
  context: PresenceContext | null;
}

export interface PresencePayload {
  userId: number;
  joinedAt: string;
  lastSeenAt: string;
  context: PresenceContext | null;
}

/**
 * In-memory presence registry. The Phase 2 backend spec (§2.5) keeps
 * presence ephemeral — no DB table, no Redis. The reaper cron sweeps
 * stale entries every 30s; multi-tab users hold their entry via
 * additive socketIds.
 *
 * Broadcast happens through the existing `EventsGateway`; this service
 * exposes the data model + lifecycle. The gateway side wires socket
 * events to the service methods and re-broadcasts state changes.
 */
@Injectable()
export class PresenceService {
  /** projectId → userId → entry */
  private readonly registry = new Map<number, Map<number, PresenceEntry>>();

  /**
   * Returns true when the registry was empty for this user/project
   * before the call — the caller broadcasts `presence:joined` only on
   * a true result so multi-tab joins stay quiet.
   */
  recordJoin(
    userId: number,
    projectId: number,
    socketId: string,
    context: PresenceContext | null = null,
  ): boolean {
    let projectMap = this.registry.get(projectId);
    if (!projectMap) {
      projectMap = new Map();
      this.registry.set(projectId, projectMap);
    }
    const existing = projectMap.get(userId);
    const now = new Date().toISOString();
    if (existing) {
      existing.socketIds.add(socketId);
      existing.lastSeenAt = now;
      if (context) existing.context = context;
      return false;
    }
    projectMap.set(userId, {
      userId,
      socketIds: new Set([socketId]),
      joinedAt: now,
      lastSeenAt: now,
      context,
    });
    return true;
  }

  /**
   * Returns true when the user's last socket was removed — caller
   * broadcasts `presence:left`. Other open tabs keep the entry alive.
   */
  recordLeave(userId: number, projectId: number, socketId: string): boolean {
    const projectMap = this.registry.get(projectId);
    if (!projectMap) return false;
    const entry = projectMap.get(userId);
    if (!entry) return false;
    entry.socketIds.delete(socketId);
    entry.lastSeenAt = new Date().toISOString();
    if (entry.socketIds.size === 0) {
      projectMap.delete(userId);
      if (projectMap.size === 0) this.registry.delete(projectId);
      return true;
    }
    return false;
  }

  /** Update the focus context (route or work item). Bumps lastSeenAt. */
  updateContext(
    userId: number,
    projectId: number,
    context: PresenceContext,
  ): void {
    const entry = this.registry.get(projectId)?.get(userId);
    if (!entry) return;
    entry.context = context;
    entry.lastSeenAt = new Date().toISOString();
  }

  /** Plain heartbeat — bumps lastSeenAt; reaper relies on this. */
  recordHeartbeat(userId: number, projectId: number): void {
    const entry = this.registry.get(projectId)?.get(userId);
    if (!entry) return;
    entry.lastSeenAt = new Date().toISOString();
  }

  /** Sorted-recency snapshot of one project's presence (most-recent first). */
  getProjectPresence(projectId: number): PresencePayload[] {
    const projectMap = this.registry.get(projectId);
    if (!projectMap) return [];
    return [...projectMap.values()]
      .map(({ socketIds: _socketIds, ...rest }) => rest)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  /**
   * Returns the full set of (projectId, userId, socketId) tuples
   * matched by socket disconnect — gateway uses this to clean up the
   * entries belonging to the disconnecting socket without keeping
   * a separate socket→rooms map.
   */
  findRoomsForSocket(socketId: string): Array<{ projectId: number; userId: number }> {
    const matches: Array<{ projectId: number; userId: number }> = [];
    for (const [projectId, projectMap] of this.registry.entries()) {
      for (const [userId, entry] of projectMap.entries()) {
        if (entry.socketIds.has(socketId)) {
          matches.push({ projectId, userId });
        }
      }
    }
    return matches;
  }

  /**
   * @Cron — every 30s, reap entries that haven't sent a heartbeat in
   * over 60s. Defends against silent socket drops. Returns the
   * (projectId, userId) pairs that were swept so the caller can
   * broadcast `presence:left`.
   */
  @Cron('*/30 * * * * *')
  reap(): Array<{ projectId: number; userId: number }> {
    const cutoff = Date.now() - 60_000;
    const swept: Array<{ projectId: number; userId: number }> = [];
    for (const [projectId, projectMap] of this.registry.entries()) {
      for (const [userId, entry] of projectMap.entries()) {
        if (Date.parse(entry.lastSeenAt) < cutoff) {
          projectMap.delete(userId);
          swept.push({ projectId, userId });
        }
      }
      if (projectMap.size === 0) this.registry.delete(projectId);
    }
    return swept;
  }
}
