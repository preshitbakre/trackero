import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Public } from '../common/decorators/public.decorator';

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
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      database,
    };
  }
}
