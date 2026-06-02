import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the socket module before importing the store
vi.mock('../lib/socket', () => ({ disconnectSocket: vi.fn() }));

import { useAuthStore } from './auth.store';
import { disconnectSocket } from '../lib/socket';

describe('auth.store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      authStatus: 'anon',
      isAuthenticated: false,
    });
    vi.clearAllMocks();
  });

  const mockUser = {
    id: 1,
    email: 'test@test.com',
    displayName: 'Test User',
    role: 'member' as const,
    avatarUrl: null,
  };

  it('initial state: no token → anon', () => {
    const state = useAuthStore.getState();
    expect(state.authStatus).toBe('anon');
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it('setUser(user) → authed', () => {
    useAuthStore.getState().setUser(mockUser);
    const state = useAuthStore.getState();
    expect(state.authStatus).toBe('authed');
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe('test@test.com');
  });

  it('setUser(null) → anon', () => {
    useAuthStore.getState().setUser(mockUser);
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().authStatus).toBe('anon');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('login() stores tokens and sets user', () => {
    useAuthStore.getState().login(mockUser, 'access-tok', 'refresh-tok');
    expect(localStorage.getItem('accessToken')).toBe('access-tok');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-tok');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('logout() clears localStorage and resets state', () => {
    useAuthStore.getState().login(mockUser, 'a', 'r');
    useAuthStore.getState().logout();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(useAuthStore.getState().authStatus).toBe('anon');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('logout() calls disconnectSocket', () => {
    useAuthStore.getState().login(mockUser, 'a', 'r');
    useAuthStore.getState().logout();
    expect(disconnectSocket).toHaveBeenCalledOnce();
  });

  it('setAuthStatus(authed) → isAuthenticated=true', () => {
    useAuthStore.getState().setAuthStatus('authed');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('setAuthStatus(anon) → isAuthenticated=false', () => {
    useAuthStore.getState().setAuthStatus('authed');
    useAuthStore.getState().setAuthStatus('anon');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('setAuthStatus(loading) → isAuthenticated=false', () => {
    useAuthStore.getState().setAuthStatus('loading');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().authStatus).toBe('loading');
  });
});
