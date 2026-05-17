import { Injectable, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppLogicException } from '../common/exceptions/app-exceptions';

@Injectable()
export class FiltersService {
  constructor(private readonly dataSource: DataSource) {}

  async getFilterOptions(projectId: number, type: string) {
    switch (type) {
      case 'assignees':
        return this.getAssignees(projectId);
      default:
        throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
  }

  private async getAssignees(projectId: number) {
    const rows = await this.dataSource.query(`
      SELECT u.id AS value, u.display_name AS label
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = $1 AND u.is_active = true
      ORDER BY u.display_name ASC
    `, [projectId]);

    // Also include instance admins who aren't explicit members
    const adminRows = await this.dataSource.query(`
      SELECT u.id AS value, u.display_name AS label
      FROM users u
      WHERE u.role = 'admin' AND u.is_active = true
        AND u.id NOT IN (SELECT user_id FROM project_members WHERE project_id = $1)
      ORDER BY u.display_name ASC
    `, [projectId]);

    return { list: [...rows, ...adminRows] };
  }
}
