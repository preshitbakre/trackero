import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Resolves the caller's PROJECT-level role for the current request.
 *
 * `ProjectAccessGuard` populates `request.projectRole` with the caller's
 * `project_members` role for non-admin callers. For global admins it is left
 * unset (admins bypass the membership lookup). Authorization on project-scoped
 * routes must use this, NOT the global `user.role`.
 */
export const ProjectRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.projectRole;
  },
);
