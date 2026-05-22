import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AppLogicException } from '../exceptions/app-exceptions';

/**
 * Builds a mock ExecutionContext whose HTTP request carries the given fields.
 */
function mockContext(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

/**
 * Builds a Reflector that always returns the given required roles.
 */
function mockReflector(requiredRoles: string[] | undefined): Reflector {
  return {
    getAllAndOverride: () => requiredRoles,
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('passes when no roles are required', () => {
    const guard = new RolesGuard(mockReflector(undefined));
    expect(guard.canActivate(mockContext({ user: { role: 'viewer' } }))).toBe(true);
  });

  it('throws UNAUTHORIZED when there is no user', () => {
    const guard = new RolesGuard(mockReflector(['member']));
    expect(() => guard.canActivate(mockContext({ params: {} }))).toThrow(AppLogicException);
  });

  it('admin always passes, even on a project route with no projectRole', () => {
    const guard = new RolesGuard(mockReflector(['member']));
    const ctx = mockContext({
      user: { role: 'admin' },
      params: { projectId: '7' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  // --- FAIL-CLOSED: the core of Task 2.3 ---
  it('FAILS CLOSED on a project route when projectRole is unset (no fallback to global role)', () => {
    const guard = new RolesGuard(mockReflector(['member']));
    // Project-scoped route (params.projectId set), caller is a global `member`,
    // but projectRole was never populated (e.g. missing/misordered ProjectAccessGuard).
    const ctx = mockContext({
      user: { role: 'member' },
      params: { projectId: '7' },
      // projectRole intentionally UNSET
    });
    // Buggy code: effectiveRole = projectRole || user.role => 'member' => returns true.
    // Fixed code: must throw FORBIDDEN.
    expect(() => guard.canActivate(ctx)).toThrow(AppLogicException);
  });

  it('authorizes a project route by projectRole when it IS set', () => {
    const guard = new RolesGuard(mockReflector(['member', 'project_manager']));
    // Global role is high, but project role is `member` => allowed.
    const ctxAllowed = mockContext({
      user: { role: 'project_manager' },
      params: { projectId: '7' },
      projectRole: 'member',
    });
    expect(guard.canActivate(ctxAllowed)).toBe(true);

    // Project role is `viewer` (lower than global `member`) => must be denied
    // even though the global role would have passed.
    const guard2 = new RolesGuard(mockReflector(['member']));
    const ctxDenied = mockContext({
      user: { role: 'member' },
      params: { projectId: '7' },
      projectRole: 'viewer',
    });
    expect(() => guard2.canActivate(ctxDenied)).toThrow(AppLogicException);
  });

  it('non-project route authorizes by the global user.role', () => {
    const guard = new RolesGuard(mockReflector(['member']));
    // No projectId param => not a project route => use user.role.
    const ctxAllowed = mockContext({
      user: { role: 'member' },
      params: {},
    });
    expect(guard.canActivate(ctxAllowed)).toBe(true);

    const guard2 = new RolesGuard(mockReflector(['admin']));
    const ctxDenied = mockContext({
      user: { role: 'member' },
      params: {},
    });
    expect(() => guard2.canActivate(ctxDenied)).toThrow(AppLogicException);
  });
});
