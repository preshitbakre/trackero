import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { randomBytes, createHmac } from 'crypto';
import { AppLogicException } from '../common/exceptions/app-exceptions';

/**
 * Phase 9 — outbound integrations.
 *
 * `dispatch` enqueues a delivery row for each enabled integration on the
 * given project. The cron picks pending rows, POSTs them with an
 * `X-Trackero-Signature` HMAC-SHA256 header, and applies exponential
 * backoff on failure (1m / 5m / 15m / 1h / 6h, capped at 5 attempts).
 *
 * Common engine events are wired via @OnEvent listeners so adding a new
 * subscribed event is a one-line change.
 */
const BACKOFF_MINUTES = [1, 5, 15, 60, 360]; // 5 retries, last after 6h
const MAX_ATTEMPTS = BACKOFF_MINUTES.length;
const LOCK_KEY = 991005;

const SUPPORTED_TYPES = new Set(['webhook', 'slack', 'github']);

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(private readonly dataSource: DataSource) {}

  /* ── CRUD ─────────────────────────────────────────────────────────── */

  async list(projectId: number) {
    return this.dataSource.query(
      `SELECT id, project_id AS "projectId", type, config, enabled,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM project_integrations
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId],
    );
  }

  async create(projectId: number, dto: { type: string; config: any; enabled?: boolean }, userId: number) {
    if (!SUPPORTED_TYPES.has(dto.type)) {
      throw new AppLogicException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST);
    }
    const secret = randomBytes(32).toString('hex');
    const enabled = dto.enabled !== false;
    const rows = await this.dataSource.query(
      `INSERT INTO project_integrations (project_id, type, config, secret, enabled, created_by)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       RETURNING id, type, config, enabled`,
      [projectId, dto.type, JSON.stringify(dto.config ?? {}), secret, enabled, userId],
    );
    // Return the secret once so the operator can paste it into the
    // receiver; subsequent reads don't include it.
    return { ...rows[0], secret };
  }

  async update(projectId: number, id: number, dto: { config?: any; enabled?: boolean }) {
    await this.requireOwned(projectId, id);
    if (dto.config !== undefined) {
      await this.dataSource.query(
        `UPDATE project_integrations SET config = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(dto.config), id],
      );
    }
    if (dto.enabled !== undefined) {
      await this.dataSource.query(
        `UPDATE project_integrations SET enabled = $1, updated_at = NOW() WHERE id = $2`,
        [!!dto.enabled, id],
      );
    }
    const [row] = await this.dataSource.query(
      `SELECT id, type, config, enabled FROM project_integrations WHERE id = $1`,
      [id],
    );
    return row;
  }

  async remove(projectId: number, id: number) {
    await this.requireOwned(projectId, id);
    await this.dataSource.query(`DELETE FROM project_integrations WHERE id = $1`, [id]);
  }

  async deliveries(projectId: number, id: number, limit = 20) {
    await this.requireOwned(projectId, id);
    return this.dataSource.query(
      `SELECT id, event_type AS "eventType", status, http_status AS "httpStatus",
              attempts, next_attempt_at AS "nextAttemptAt", delivered_at AS "deliveredAt",
              last_error AS "lastError", created_at AS "createdAt"
       FROM integration_deliveries
       WHERE integration_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, Math.min(100, Math.max(1, limit))],
    );
  }

  async retry(projectId: number, id: number, deliveryId: number) {
    await this.requireOwned(projectId, id);
    await this.dataSource.query(
      `UPDATE integration_deliveries
       SET status = 'pending', next_attempt_at = NOW()
       WHERE id = $1 AND integration_id = $2`,
      [deliveryId, id],
    );
  }

  private async requireOwned(projectId: number, id: number) {
    const [row] = await this.dataSource.query(
      `SELECT 1 FROM project_integrations WHERE id = $1 AND project_id = $2`,
      [id, projectId],
    );
    if (!row) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
  }

  /* ── Dispatch + listeners ─────────────────────────────────────────── */

  /**
   * Enqueue a delivery for every enabled integration on the project.
   * Caller's responsibility to pass a JSON-serialisable payload.
   */
  async dispatch(event: string, projectId: number, payload: Record<string, any>) {
    const rows = await this.dataSource.query(
      `SELECT id FROM project_integrations WHERE project_id = $1 AND enabled = TRUE`,
      [projectId],
    );
    if (rows.length === 0) return;
    for (const r of rows) {
      await this.dataSource.query(
        `INSERT INTO integration_deliveries (integration_id, event_type, payload)
         VALUES ($1, $2, $3::jsonb)`,
        [r.id, event, JSON.stringify({ event, projectId, payload, at: new Date().toISOString() })],
      );
    }
  }

  @OnEvent('work_item.created')
  async onWorkItemCreated(p: { item: any; projectId: number }) {
    if (!p?.projectId) return;
    await this.dispatch('work_item.created', p.projectId, { item: p.item });
  }
  @OnEvent('work_item.updated')
  async onWorkItemUpdated(p: { item: any; projectId: number; changes: any }) {
    if (!p?.projectId) return;
    await this.dispatch('work_item.updated', p.projectId, { item: p.item, changes: p.changes });
  }
  @OnEvent('comment.added')
  async onCommentAdded(p: { workItemId: number; projectId: number; commentId: number }) {
    if (!p?.projectId) return;
    await this.dispatch('comment.added', p.projectId, { workItemId: p.workItemId, commentId: p.commentId });
  }
  @OnEvent('sprint.started')
  async onSprintStarted(p: { sprintId: number; projectId: number }) {
    if (!p?.projectId) return;
    await this.dispatch('sprint.started', p.projectId, { sprintId: p.sprintId });
  }
  @OnEvent('sprint.completed')
  async onSprintCompleted(p: { sprintId: number; projectId: number }) {
    if (!p?.projectId) return;
    await this.dispatch('sprint.completed', p.projectId, { sprintId: p.sprintId });
  }

  /* ── Cron: pick up pending, POST with HMAC, retry/backoff ─────────── */

  @Cron('*/1 * * * *', { name: 'integration-deliveries' })
  async runDeliveries() {
    const lockRow = await this.dataSource.query(
      `SELECT pg_try_advisory_lock($1) AS got`,
      [LOCK_KEY],
    );
    if (!lockRow?.[0]?.got) return;
    try {
      const pending = await this.dataSource.query(
        `SELECT d.id, d.integration_id AS "integrationId", d.event_type AS "eventType",
                d.payload, d.attempts, i.config, i.secret, i.type, i.enabled
         FROM integration_deliveries d
         JOIN project_integrations i ON i.id = d.integration_id
         WHERE d.status = 'pending' AND d.next_attempt_at <= NOW()
         ORDER BY d.next_attempt_at ASC
         LIMIT 20`,
      );

      for (const delivery of pending) {
        if (!delivery.enabled) {
          // Integration disabled mid-flight — mark the delivery as failed
          // rather than spinning forever waiting for a turned-off receiver.
          await this.markFailed(delivery.id, 'integration-disabled', null);
          continue;
        }
        const url = (delivery.config as any)?.url as string | undefined;
        if (!url) {
          await this.markFailed(delivery.id, 'no-url-configured', null);
          continue;
        }
        const body = JSON.stringify(delivery.payload);
        const signature = createHmac('sha256', delivery.secret).update(body).digest('hex');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Trackero-Event': delivery.eventType,
          'X-Trackero-Signature': signature,
        };
        const bearer = (delivery.config as any)?.bearerToken;
        if (typeof bearer === 'string' && bearer.length > 0) {
          headers['Authorization'] = `Bearer ${bearer}`;
        }

        try {
          const res = await fetch(url, { method: 'POST', headers, body });
          if (res.ok) {
            await this.dataSource.query(
              `UPDATE integration_deliveries
               SET status = 'delivered',
                   http_status = $2,
                   delivered_at = NOW(),
                   attempts = attempts + 1
               WHERE id = $1`,
              [delivery.id, res.status],
            );
          } else {
            await this.bumpRetry(delivery.id, delivery.attempts, res.status, `HTTP ${res.status}`);
          }
        } catch (err: any) {
          await this.bumpRetry(delivery.id, delivery.attempts, null, (err?.message ?? 'fetch error').slice(0, 300));
        }
      }
    } catch (err) {
      this.logger.error(`Integration cron failed: ${(err as Error).message}`);
    } finally {
      await this.dataSource.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
    }
  }

  private async bumpRetry(deliveryId: number, attempts: number, httpStatus: number | null, errorMsg: string) {
    const nextAttempt = attempts + 1;
    if (nextAttempt >= MAX_ATTEMPTS) {
      await this.markFailed(deliveryId, errorMsg, httpStatus);
      return;
    }
    const backoffMin = BACKOFF_MINUTES[nextAttempt] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1];
    await this.dataSource.query(
      `UPDATE integration_deliveries
       SET attempts = attempts + 1,
           http_status = $2,
           last_error = $3,
           next_attempt_at = NOW() + ($4 || ' minutes')::interval
       WHERE id = $1`,
      [deliveryId, httpStatus, errorMsg, backoffMin],
    );
  }

  private async markFailed(deliveryId: number, errorMsg: string, httpStatus: number | null) {
    await this.dataSource.query(
      `UPDATE integration_deliveries
       SET status = 'failed',
           attempts = attempts + 1,
           http_status = $2,
           last_error = $3
       WHERE id = $1`,
      [deliveryId, httpStatus, errorMsg],
    );
  }
}
