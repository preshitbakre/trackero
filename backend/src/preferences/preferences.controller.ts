import { Body, Controller, Get, Put, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AppLogicException } from '../common/exceptions/app-exceptions';

const VALID_CHANNELS = ['in_app', 'email', 'push'] as const;
type Channel = (typeof VALID_CHANNELS)[number];

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PreferencesController {
  constructor(private readonly dataSource: DataSource) {}

  // Phase 8 — notification preferences. Default behaviour when a row is
  // absent: send. So the read endpoint shows every (type, channel) pair
  // the FE wants to render, derived from a hardcoded list of types.
  @Get('me/notification-preferences')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('NOTIFICATION_PREFS_FETCHED')
  async listPrefs(@CurrentUser() user: JwtPayload) {
    const rows = await this.dataSource.query(
      `SELECT notification_type AS type, channel, enabled
       FROM notification_preferences WHERE user_id = $1`,
      [user.userId],
    );
    return { preferences: rows };
  }

  @Put('me/notification-preferences')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('NOTIFICATION_PREFS_UPDATED')
  async upsertPref(
    @CurrentUser() user: JwtPayload,
    @Body() body: { type: string; channel: Channel; enabled: boolean },
  ) {
    const channel = body.channel;
    if (!VALID_CHANNELS.includes(channel)) {
      throw new AppLogicException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST);
    }
    if (typeof body.type !== 'string' || body.type.length === 0 || body.type.length > 40) {
      throw new AppLogicException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST);
    }
    await this.dataSource.query(
      `INSERT INTO notification_preferences (user_id, notification_type, channel, enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, notification_type, channel) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         updated_at = NOW()`,
      [user.userId, body.type, channel, !!body.enabled],
    );
    return { ok: true };
  }

  // Phase 8 — instance settings (admin only). Reads are open to everyone
  // since flags + appName drive client behaviour; writes are admin-locked.
  @Get('instance-settings')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('INSTANCE_SETTINGS_FETCHED')
  async listSettings() {
    const rows = await this.dataSource.query(
      `SELECT key, value FROM instance_settings`,
    );
    const out: Record<string, unknown> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  @Put('instance-settings')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('INSTANCE_SETTINGS_UPDATED')
  async upsertSetting(
    @CurrentUser() user: JwtPayload,
    @Body() body: { key: string; value: unknown },
  ) {
    if (typeof body.key !== 'string' || body.key.length === 0 || body.key.length > 100) {
      throw new AppLogicException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST);
    }
    await this.dataSource.query(
      `INSERT INTO instance_settings (key, value, updated_by)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [body.key, JSON.stringify(body.value), user.userId],
    );
    return { ok: true };
  }
}
