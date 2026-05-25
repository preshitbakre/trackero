import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstanceSetting } from './entities/instance-setting.entity';

@Injectable()
export class InstanceSettingsService {
  constructor(
    @InjectRepository(InstanceSetting)
    private readonly repo: Repository<InstanceSetting>,
  ) {}

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row ? row.value : null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.repo.upsert({ key, value }, ['key']);
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.repo.find();
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }
}
