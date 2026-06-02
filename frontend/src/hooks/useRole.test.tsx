import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';

vi.mock('../store/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../api/client', () => ({
  apiClient: { get: vi.fn() },
}));

import { useAuthStore } from '../store/auth.store';
import { useRole } from './useRole';

const mockUser = (role: string) => ({
  id: 1, email: 'test@test.com', displayName: 'Test', role, avatarUrl: null,
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function wrapperWithRoute(path: string) {
  return ({ children }: { children: ReactNode }) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('useRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no user → defaults to viewer', () => {
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: any) => any) => selector({ user: null }),
    );
    const { result } = renderHook(() => useRole(), { wrapper });
    expect(result.current.role).toBe('viewer');
    expect(result.current.isReadOnly).toBe(true);
    expect(result.current.canEdit).toBe(false);
  });

  it('global admin outside project → full access', () => {
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: any) => any) => selector({ user: mockUser('admin') }),
    );
    const { result } = renderHook(() => useRole(), {
      wrapper: wrapperWithRoute('/dashboard'),
    });
    expect(result.current.canAdminister).toBe(true);
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canManageProject).toBe(true);
    expect(result.current.isAdmin).toBe(true);
  });

  it('global admin inside project → always admin', () => {
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: any) => any) => selector({ user: mockUser('admin') }),
    );
    const { result } = renderHook(() => useRole(), {
      wrapper: wrapperWithRoute('/projects/1/board'),
    });
    expect(result.current.role).toBe('admin');
    expect(result.current.canAdminister).toBe(true);
  });

  it('viewer → isReadOnly=true, canEdit=false', () => {
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: any) => any) => selector({ user: mockUser('viewer') }),
    );
    const { result } = renderHook(() => useRole(), { wrapper });
    expect(result.current.isReadOnly).toBe(true);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.canManageProject).toBe(false);
  });

  it('hasRole(member) returns true for PM', () => {
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: any) => any) => selector({ user: mockUser('project_manager') }),
    );
    const { result } = renderHook(() => useRole(), { wrapper });
    expect(result.current.hasRole('member')).toBe(true);
  });

  it('hasRole(admin) returns false for PM', () => {
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: any) => any) => selector({ user: mockUser('project_manager') }),
    );
    const { result } = renderHook(() => useRole(), { wrapper });
    expect(result.current.hasRole('admin')).toBe(false);
  });

  it('member outside project context → globalRole used', () => {
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: any) => any) => selector({ user: mockUser('member') }),
    );
    const { result } = renderHook(() => useRole(), {
      wrapper: wrapperWithRoute('/settings'),
    });
    expect(result.current.role).toBe('member');
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canAdminister).toBe(false);
  });
});
