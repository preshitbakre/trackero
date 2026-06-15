import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type QueryDeepPartialEntity } from 'typeorm';
import { InstanceSetting } from './entities/instance-setting.entity';

@Injectable()
export class InstanceSettingsService {
  constructor(
    @InjectRepository(InstanceSetting)
    private readonly repo: Repository<InstanceSetting>,
  ) {}

  async get(key: string): Promise<unknown> {
    const row = await this.repo.findOne({ where: { key } });
    return row ? row.value : null;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.repo.upsert(
      { key, value } as QueryDeepPartialEntity<InstanceSetting>,
      ['key'],
    );
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.repo.find();
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }
}
