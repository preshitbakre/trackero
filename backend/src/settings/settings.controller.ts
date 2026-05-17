import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles('admin')
  @ResponseCode('SETTINGS_FETCHED')
  async getAll() {
    return this.settingsService.getAll();
  }

  @Put()
  @Roles('admin')
  @ResponseCode('SETTINGS_UPDATED')
  async update(@Body() body: Record<string, string>) {
    return this.settingsService.update(body);
  }
}
