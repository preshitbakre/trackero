import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { EXPECTED_MIGRATION_NAMES } from '../database/migrations-registry';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @Public()
  @ResponseCode('HEALTH_OK')
  async check(@Res({ passthrough: true }) res: Response) {
    // Phase 10 — expanded health probe: database + minio + smtp. Each
    // signal is independently degraded; the overall status is the worst.
    // 503 if any signal fails so orchestrators take the instance out of
    // rotation. SMTP is treated as "configured / not-configured" (a dev
    // box without SMTP isn't unhealthy; a prod box with broken SMTP is).
    let database = 'disconnected';
    try {
      await this.dataSource.query('SELECT 1');
      database = 'connected';
    } catch {
      database = 'disconnected';
    }

    let minio = 'not-configured';
    const minioEndpoint = process.env.MINIO_ENDPOINT;
    if (minioEndpoint) {
      try {
        const ssl = (process.env.MINIO_USE_SSL ?? '').toLowerCase() === 'true';
        const port = process.env.MINIO_PORT ?? (ssl ? '443' : '9000');
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const url = `${ssl ? 'https' : 'http'}://${minioEndpoint}:${port}/minio/health/live`;
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        minio = res.ok ? 'connected' : 'disconnected';
      } catch {
        minio = 'disconnected';
      }
    }

    let smtp = 'not-configured';
    if (process.env.SMTP_HOST) {
      // Stop short of opening a TCP connection per request — connection
      // pools and probe storms don't mix. Treat a configured host as
      // "configured"; deeper checks belong to a separate observability job.
      smtp = 'configured';
    }

    // Database is the only load-bearing dependency for "healthy". MinIO
    // being unreachable is a degraded state but the app still serves
    // every read path that doesn't need file storage; flipping the whole
    // probe to 503 would take working API servers out of rotation. SMTP
    // is even softer — it never affects request handling synchronously.
    const healthy = database === 'connected';
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: healthy ? 'healthy' : 'unhealthy',
      version: '1.10.0',
      uptime: Math.floor(process.uptime()),
      database,
      minio,
      smtp,
    };
  }

  /**
   * T0.12 — admin-only migration health probe. Returns the applied
   * migration names (from the `migrations` bookkeeping table) and the
   * names every shipped migration class expects, computing the diff in
   * both directions so an operator can see drift at a glance.
   *
   * The endpoint always returns 200 even when drift is present; the
   * caller decides whether to alert. The probe itself is the
   * verification step in the deployment runbook.
   */
  @Get('migrations')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ResponseCode('MIGRATIONS_FETCHED')
  async migrations() {
    type AppliedRow = { id: number; timestamp: string; name: string };
    // The migrations bookkeeping table is created on first migration
    // run; in environments that build the schema via synchronize (test)
    // it never exists. Treat its absence as "nothing applied" rather
    // than a 500 — the diff then surfaces every migration as missing,
    // which is the truthful state for that DB.
    const tableExists: Array<{ exists: boolean }> = await this.dataSource.query(
      `SELECT EXISTS (
         SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'migrations'
       ) AS exists`,
    );
    const applied: AppliedRow[] = tableExists[0]?.exists
      ? await this.dataSource.query(
          'SELECT id, "timestamp"::text, name FROM migrations ORDER BY id',
        )
      : [];
    const appliedSet = new Set(applied.map((r) => r.name));
    const expectedSet = new Set(EXPECTED_MIGRATION_NAMES);

    const missing = EXPECTED_MIGRATION_NAMES.filter((n) => !appliedSet.has(n));
    const unexpected = applied
      .map((r) => r.name)
      .filter((n) => !expectedSet.has(n));

    return {
      applied: applied.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        name: r.name,
      })),
      expected: [...EXPECTED_MIGRATION_NAMES],
      drift: missing,
      diff: { missing, unexpected },
      consistent: missing.length === 0 && unexpected.length === 0,
    };
  }
}
