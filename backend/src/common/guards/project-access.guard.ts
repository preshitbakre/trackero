import { Injectable, CanActivate, ExecutionContext, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppLogicException } from '../exceptions/app-exceptions';

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const projectId = parseInt(request.params.projectId, 10);

    if (!projectId || isNaN(projectId)) return true;
    if (user.role === 'admin') return true;

    const member = await this.dataSource.query(
      'SELECT role FROM project_members WHERE user_id = $1 AND project_id = $2',
      [user.userId, projectId],
    );

    if (!member || member.length === 0) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    request.projectRole = member[0].role;
    return true;
  }
}
