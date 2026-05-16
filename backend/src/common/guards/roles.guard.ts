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

    // Use project-level role if available (set by ProjectAccessGuard)
    const effectiveRole = request.projectRole || user.role;

    if (!requiredRoles.includes(effectiveRole)) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
