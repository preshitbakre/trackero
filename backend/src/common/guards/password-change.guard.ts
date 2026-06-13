import { Injectable, CanActivate, ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY } from '../decorators/allow-password-change-pending.decorator';
import { AppLogicException } from '../exceptions/app-exceptions';

/**
 * Global gate enforcing admin-forced password changes. Runs after JwtAuthGuard
 * (so request.user is populated for authenticated routes). When the current
 * user has `mustChangePassword = true`, every authenticated route is blocked
 * with 403 PASSWORD_CHANGE_REQUIRED except:
 *   - @Public() routes (login/register/etc. — no user attached)
 *   - @AllowPasswordChangePending() routes (set-new-password, logout, /auth/me)
 *
 * Enforced server-side so API clients are gated identically to the UI; the
 * frontend additionally redirects to the set-password screen.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE_PENDING_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    // No authenticated user (e.g. a public route the JwtAuthGuard let through
    // without populating user) — nothing to gate here.
    if (!user) return true;

    if (user.mustChangePassword) {
      throw new AppLogicException('PASSWORD_CHANGE_REQUIRED', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
