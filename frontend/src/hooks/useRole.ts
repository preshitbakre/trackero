import { useAuthStore } from '../store/auth.store';

type Role = 'admin' | 'project_manager' | 'member' | 'viewer';

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 4,
  project_manager: 3,
  member: 2,
  viewer: 1,
};

export function useRole() {
  const user = useAuthStore((s) => s.user);
  const role = (user?.role || 'viewer') as Role;

  return {
    role,
    isAdmin: role === 'admin',
    isPM: role === 'project_manager',
    isMember: role === 'member',
    isViewer: role === 'viewer',

    /** Can manage users, global settings, create projects */
    canAdminister: role === 'admin',

    /** Can manage sprints, project settings, members */
    canManageProject: role === 'admin' || role === 'project_manager',

    /** Can create/edit/delete tasks, move cards, comment */
    canEdit: role !== 'viewer',

    /** Read-only — viewers only */
    isReadOnly: role === 'viewer',

    /** Check if user has at least this role level */
    hasRole: (minRole: Role) => ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole],
  };
}
