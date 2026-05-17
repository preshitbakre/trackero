import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SettingsService {
  constructor(private readonly dataSource: DataSource) {}

  async getAll() {
    const rows = await this.dataSource.query('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  async update(updates: Record<string, string>) {
    for (const [key, value] of Object.entries(updates)) {
      await this.dataSource.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
        [key, value],
      );
    }
    return this.getAll();
  }
}
