import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/render';

vi.mock('../../hooks/useRole', () => ({
  useRole: vi.fn(),
}));

import { useRole } from '../../hooks/useRole';
import { RoleGate } from './RoleGate';

const mockUseRole = useRole as ReturnType<typeof vi.fn>;

describe('RoleGate', () => {
  it('renders children when user has sufficient role (minRole)', () => {
    mockUseRole.mockReturnValue({
      role: 'member',
      hasRole: () => true,
      isAdmin: false,
      isPM: false,
      isMember: true,
      isViewer: false,
      canAdminister: false,
      canManageProject: false,
      canEdit: true,
      isReadOnly: false,
    });
    render(<RoleGate minRole="member"><span>Secret</span></RoleGate>);
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });

  it('hides children when role is insufficient (minRole)', () => {
    mockUseRole.mockReturnValue({
      role: 'viewer',
      hasRole: () => false,
      isAdmin: false,
      isPM: false,
      isMember: false,
      isViewer: true,
      canAdminister: false,
      canManageProject: false,
      canEdit: false,
      isReadOnly: true,
    });
    render(<RoleGate minRole="admin"><span>Secret</span></RoleGate>);
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('renders fallback when role is insufficient and fallback is provided', () => {
    mockUseRole.mockReturnValue({
      role: 'viewer',
      hasRole: () => false,
      isAdmin: false,
      isPM: false,
      isMember: false,
      isViewer: true,
      canAdminister: false,
      canManageProject: false,
      canEdit: false,
      isReadOnly: true,
    });
    render(
      <RoleGate minRole="admin" fallback={<span>No Access</span>}>
        <span>Secret</span>
      </RoleGate>,
    );
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
    expect(screen.getByText('No Access')).toBeInTheDocument();
  });

  it('renders children when role matches allowed roles list', () => {
    mockUseRole.mockReturnValue({
      role: 'admin',
      hasRole: () => true,
      isAdmin: true,
      isPM: false,
      isMember: false,
      isViewer: false,
      canAdminister: true,
      canManageProject: true,
      canEdit: true,
      isReadOnly: false,
    });
    render(<RoleGate roles={['admin']}><span>Admin Only</span></RoleGate>);
    expect(screen.getByText('Admin Only')).toBeInTheDocument();
  });

  it('hides children when role is not in allowed roles list', () => {
    mockUseRole.mockReturnValue({
      role: 'member',
      hasRole: () => true,
      isAdmin: false,
      isPM: false,
      isMember: true,
      isViewer: false,
      canAdminister: false,
      canManageProject: false,
      canEdit: true,
      isReadOnly: false,
    });
    render(<RoleGate roles={['admin']}><span>Admin Only</span></RoleGate>);
    expect(screen.queryByText('Admin Only')).not.toBeInTheDocument();
  });
});
