import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * Phase 10 — retention sweep.
 *
 * Runs daily; hard-deletes rows that have been soft-deleted past the
 * configured grace window (default 7 days, overridable via
 * instance_settings.retentionDays).
 *
 * Old activity_logs rows (>180d) are pruned EXCEPT status-change rows
 * which the cumulative-flow chart reconstructs sprint history from.
 *
 * RETENTION_DRY_RUN=true logs what would be deleted without writing.
 * Default off in prod; CI / staging can flip it on.
 */
const LOCK_KEY = 991004;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'retention-sweep' })
  async runDaily() {
    const lockRow = await this.dataSource.query(`SELECT pg_try_advisory_lock($1) AS got`, [LOCK_KEY]);
    if (!lockRow?.[0]?.got) return;
    const dryRun = (process.env.RETENTION_DRY_RUN ?? '').toLowerCase() === 'true';

    try {
      // Read configured grace window.
      const [setting] = await this.dataSource.query(
        `SELECT value FROM instance_settings WHERE key = 'retentionDays'`,
      );
      const days = typeof setting?.value === 'number' ? setting.value : 7;

      for (const table of ['work_items', 'comments', 'retro_cards', 'attachments']) {
        const action = dryRun
          ? `SELECT COUNT(*) AS c FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' days')::interval`
          : `DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' days')::interval`;
        const result = await this.dataSource.query(action, [days]);
        if (dryRun) {
          this.logger.log(`[dry-run] ${table}: would delete ${result?.[0]?.c ?? 0} rows past ${days}d grace`);
        } else {
          // result is the row count for DELETE in pg; pino-style log so the
          // operator can grep "retention" in production logs.
          this.logger.log(`retention: ${table} hard-deleted past ${days}d grace`);
        }
      }

      // activity_logs retention — non-status events older than 6 months.
      const olderThan = `NOW() - INTERVAL '180 days'`;
      if (dryRun) {
        const [{ c }] = await this.dataSource.query(
          `SELECT COUNT(*)::int AS c FROM activity_logs
           WHERE created_at < ${olderThan}
             AND (field_changed IS NULL OR field_changed <> 'status')`,
        );
        this.logger.log(`[dry-run] activity_logs: would delete ${c} non-status rows past 180d`);
      } else {
        await this.dataSource.query(
          `DELETE FROM activity_logs
           WHERE created_at < ${olderThan}
             AND (field_changed IS NULL OR field_changed <> 'status')`,
        );
        this.logger.log(`retention: activity_logs non-status rows past 180d pruned`);
      }
    } catch (err) {
      this.logger.error(`Retention sweep failed: ${(err as Error).message}`);
    } finally {
      await this.dataSource.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
    }
  }
}
