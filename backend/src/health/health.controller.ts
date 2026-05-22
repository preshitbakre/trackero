import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @Public()
  @ResponseCode('HEALTH_OK')
  async check() {
    let database = 'disconnected';
    try {
      await this.dataSource.query('SELECT 1');
      database = 'connected';
    } catch {
      database = 'disconnected';
    }

    return {
      status: database === 'connected' ? 'healthy' : 'unhealthy',
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      database,
    };
  }
}
