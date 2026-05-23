import { create } from 'zustand';

interface User {
  id: number;
  email: string;
  displayName: string;
  role: 'admin' | 'project_manager' | 'member' | 'viewer';
  avatarUrl: string | null;
}

export type AuthStatus = 'loading' | 'authed' | 'anon';

interface AuthState {
  user: User | null;
  /**
   * Verified auth status. 'loading' means we have a token in localStorage but
   * have not yet verified it with /auth/me. Routes must NOT redirect on
   * 'loading' — AppShell needs to mount to resolve the status.
   */
  authStatus: AuthStatus;
  /** Kept for compatibility — equivalent to authStatus === 'authed'. */
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setAuthStatus: (status: AuthStatus) => void;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

function computeInitialAuthStatus(): AuthStatus {
  return localStorage.getItem('accessToken') ? 'loading' : 'anon';
}

const initialAuthStatus = computeInitialAuthStatus();

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  authStatus: initialAuthStatus,
  // Always false initially: 'loading' means unverified, 'anon' means no token.
  // Becomes true only after setUser/login sets authStatus to 'authed'.
  isAuthenticated: false,

  setUser: (user) =>
    set({
      user,
      authStatus: user ? 'authed' : 'anon',
      isAuthenticated: !!user,
    }),

  setAuthStatus: (status) =>
    set({ authStatus: status, isAuthenticated: status === 'authed' }),

  login: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, authStatus: 'authed', isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, authStatus: 'anon', isAuthenticated: false });
  },
}));
