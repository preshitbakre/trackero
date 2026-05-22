import { Injectable, CanActivate, ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AppLogicException } from '../exceptions/app-exceptions';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const { user } = request;
    if (!user) {
      throw new AppLogicException('UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    }

    // Admin always passes
    if (user.role === 'admin') return true;

    // Determine whether this is a project-scoped route (has a :projectId param).
    const isProjectRoute = request.params?.projectId !== undefined;

    let effectiveRole: string;
    if (isProjectRoute) {
      // On a project route the effective role MUST be the project-level role
      // populated by ProjectAccessGuard. NEVER fall back to the global
      // `user.role` — that would be fail-open: a missing or mis-ordered
      // ProjectAccessGuard would otherwise authorize by the (possibly higher)
      // global role. If `projectRole` is unset here the caller is not an admin
      // (admins returned early), so fail closed.
      if (!request.projectRole) {
        throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
      }
      effectiveRole = request.projectRole;
    } else {
      // Non-project route — authorize by the global role.
      effectiveRole = user.role;
    }

    if (!requiredRoles.includes(effectiveRole)) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
