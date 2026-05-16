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

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new AppLogicException('UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    }

    if (user.role === 'admin') return true;

    if (!requiredRoles.includes(user.role)) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
