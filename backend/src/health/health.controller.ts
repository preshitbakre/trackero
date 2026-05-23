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
    // Probe the database. If it is unreachable we MUST signal that to load
    // balancers / k8s liveness+readiness probes by returning a 5xx — a probe
    // that always returns 200 defeats the purpose of having one.
    let database = 'disconnected';
    try {
      await this.dataSource.query('SELECT 1');
      database = 'connected';
    } catch {
      database = 'disconnected';
    }

    const healthy = database === 'connected';
    // 503 Service Unavailable on degraded health so orchestrators take the
    // instance out of rotation. Body is still the standard response envelope
    // so existing clients continue to parse it.
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: healthy ? 'healthy' : 'unhealthy',
      version: '1.1.0',
      uptime: Math.floor(process.uptime()),
      database,
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
