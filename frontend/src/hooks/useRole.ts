import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { apiClient } from '../api/client';

type Role = 'admin' | 'project_manager' | 'member' | 'viewer';

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 4,
  project_manager: 3,
  member: 2,
  viewer: 1,
};

/**
 * Extract the current project ID from the URL, if any. Matches the same
 * pattern AppShell uses to detect project context.
 */
function useCurrentProjectId(): number | null {
  const location = useLocation();
  const match = location.pathname.match(/\/projects\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Fetch the current user's membership role in the given project. Returns
 * `null` while loading or if the user is not a member. Cached by react-query
 * keyed on (projectId, userId) so multiple components on the same project
 * share a single fetch.
 */
function useProjectMembershipRole(projectId: number | null, userId: number | null): Role | null {
  const { data } = useQuery({
    queryKey: ['project-membership', projectId, userId],
    queryFn: async () => {
      if (!projectId || !userId) return null;
      const { data } = await apiClient.get(`/projects/${projectId}/members`);
      const members = data.data.list || [];
      const me = members.find((m: any) => m.userId === userId);
      return (me?.role as Role) || null;
    },
    enabled: projectId != null && userId != null,
    staleTime: 60_000,
  });
  return data ?? null;
}

/**
 * Role-aware permission hook.
 *
 * - `canAdminister` is ALWAYS based on the global (instance) role — it gates
 *   instance-level operations like managing users and creating projects.
 * - All other flags (`canEdit`, `canManageProject`, `isReadOnly`,
 *   `isMember`, etc.) reflect the user's PROJECT-MEMBERSHIP role when the
 *   current route is project-scoped (e.g. `/projects/:id/...`). Outside a
 *   project context they fall back to the global role.
 * - Global admins are always treated as having full project access regardless
 *   of an explicit project membership (matching the backend RolesGuard).
 * - While the project membership is loading the hook returns the global role
 *   as a safe fallback — pages render the same as they did before this hook
 *   became project-aware, and tighten on the second pass once membership
 *   resolves.
 */
export function useRole() {
  const user = useAuthStore((s) => s.user);
  const globalRole = (user?.role || 'viewer') as Role;

  const projectId = useCurrentProjectId();
  const projectMembershipRole = useProjectMembershipRole(projectId, user?.id ?? null);

  // Effective role for project-scoped capability checks. Outside a project
  // context, this is just the global role. Global admins always get 'admin'
  // (they have full access to every project per backend RolesGuard). When the
  // membership query has not resolved yet we fall back to globalRole — this
  // keeps initial render behavior identical to the pre-refactor hook.
  let effectiveRole: Role;
  if (!projectId) {
    effectiveRole = globalRole;
  } else if (globalRole === 'admin') {
    effectiveRole = 'admin';
  } else if (projectMembershipRole) {
    effectiveRole = projectMembershipRole;
  } else {
    effectiveRole = globalRole;
  }

  return {
    /** Project-scoped role when in a project context; global role otherwise. */
    role: effectiveRole,
    /** Global instance role — does NOT change with project context. */
    globalRole,
    isAdmin: effectiveRole === 'admin',
    isPM: effectiveRole === 'project_manager',
    isMember: effectiveRole === 'member',
    isViewer: effectiveRole === 'viewer',

    /**
     * Can manage users, global settings, create projects.
     * Tied to GLOBAL role — instance admin only.
     */
    canAdminister: globalRole === 'admin',

    /** Can manage sprints, project settings, members. Project-scoped. */
    canManageProject: effectiveRole === 'admin' || effectiveRole === 'project_manager',

    /** Can create/edit/delete tasks, move cards, comment. Project-scoped. */
    canEdit: effectiveRole !== 'viewer',

    /** Read-only — viewers only. Project-scoped. */
    isReadOnly: effectiveRole === 'viewer',

    /** Check if user has at least this role level (project-scoped). */
    hasRole: (minRole: Role) => ROLE_HIERARCHY[effectiveRole] >= ROLE_HIERARCHY[minRole],
  };
}
