import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_PENDING_KEY = 'allowPasswordChangePending';

/**
 * Marks a route as reachable while the authenticated user still has
 * `mustChangePassword = true`. Used for the endpoints required to escape the
 * forced-change gate (set-new-password, logout) and to bootstrap the client
 * (/auth/me). Everything else is blocked by PasswordChangeGuard.
 */
export const AllowPasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true);
