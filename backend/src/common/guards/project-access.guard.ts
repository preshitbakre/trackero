import { Injectable, CanActivate, ExecutionContext, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppLogicException } from '../exceptions/app-exceptions';

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const projectIdParam = request.params.projectId;

    // Route doesn't have :projectId param — not a project-scoped route
    if (projectIdParam === undefined) return true;

    // Strict numeric validation — `parseInt` is too lax ('5abc' -> 5).
    if (typeof projectIdParam !== 'string' || !/^\d+$/.test(projectIdParam)) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.BAD_REQUEST);
    }
    const projectId = parseInt(projectIdParam, 10);

    // Fail closed: the project must exist. Loaded once here for ALL methods
    // and reused for the archived-status check below.
    const [project] = await this.dataSource.query(
      'SELECT status FROM projects WHERE id = $1',
      [projectId],
    );
    if (!project) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Check membership (admin bypasses)
    if (user.role !== 'admin') {
      const member = await this.dataSource.query(
        'SELECT role FROM project_members WHERE user_id = $1 AND project_id = $2',
        [user.userId, projectId],
      );

      if (!member || member.length === 0) {
        throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
      }

      request.projectRole = member[0].role;
    }

    // Block mutations on archived projects (POST, PUT, DELETE — not GET)
    const method = request.method;
    if (method !== 'GET') {
      if (project.status === 'archived') {
        // Allow archive/unarchive endpoints through. Match the route PATHNAME
        // (query string stripped) and require it to END WITH the action — a
        // raw-url substring check is bypassable via a crafted query string
        // (e.g. POST .../labels?x=/archive).
        const rawUrl = request.url || '';
        const pathname = rawUrl.split('?')[0];
        const isArchiveAction =
          pathname.endsWith('/archive') || pathname.endsWith('/unarchive');
        // Hard-deleting the project itself (DELETE /projects/:projectId) must be
        // allowed ONLY on archived projects — archiving is the required safety
        // gate before the irreversible delete. The pathname for that route ends
        // with `/projects/{id}` (no further sub-segments).
        const isProjectHardDelete =
          method === 'DELETE' && pathname.endsWith(`/projects/${projectId}`);
        if (!isArchiveAction && !isProjectHardDelete) {
          throw new AppLogicException('PROJECT_ARCHIVED_ERROR', HttpStatus.FORBIDDEN);
        }
      }
    }

    return true;
  }
}
