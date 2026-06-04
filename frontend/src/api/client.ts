import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/auth.store';
import { updateSocketAuth } from '../lib/socket';

/**
 * Error type thrown by doRefresh() so the interceptor can distinguish a
 * genuine auth failure (refresh token rejected → must log out) from a
 * transient failure (network drop, 5xx, malformed response → keep session,
 * let the original request reject so the UI can surface a retry/error).
 */
interface RefreshError extends Error {
  authInvalid?: boolean;
}

function makeRefreshError(message: string, authInvalid: boolean): RefreshError {
  const err = new Error(message) as RefreshError;
  err.authInvalid = authInvalid;
  return err;
}

const apiClient = axios.create({
  baseURL: '/api',
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;
let isRedirecting = false;

function clearAuthAndRedirect() {
  if (isRedirecting) return;
  isRedirecting = true;
  // Update reactive store so ProtectedRoute redirects immediately
  useAuthStore.getState().logout();
  // Reset flag after redirect completes (full page reload resets module state anyway)
  setTimeout(() => { isRedirecting = false; }, 1000);
}

async function doRefresh(): Promise<string> {
  const refreshToken = localStorage.getItem('refreshToken');
  // No refresh token at all → nothing to recover, treat as auth-invalid.
  if (!refreshToken) throw makeRefreshError('No refresh token', true);

  let data: { data?: { accessToken?: string; refreshToken?: string } };
  try {
    const response = await axios.post('/api/auth/refresh', { refreshToken });
    data = response.data;
  } catch (err) {
    // Classify axios failures: 401/403 from /auth/refresh means the refresh
    // token itself is rejected (logout). Everything else — no response
    // (network error), 5xx, timeouts — is transient and must NOT log the
    // user out.
    const axiosErr = err as AxiosError;
    const status = axiosErr.response?.status;
    if (status === 401 || status === 403) {
      throw makeRefreshError('Refresh rejected', true);
    }
    throw makeRefreshError('Refresh transient failure', false);
  }

  const newAccessToken = data?.data?.accessToken;
  const newRefreshToken = data?.data?.refreshToken;

  // Malformed response body: server might be misconfigured or behind a
  // broken proxy. Prefer NOT to nuke the session — surface as transient so
  // the user can retry.
  if (!newAccessToken || !newRefreshToken) {
    throw makeRefreshError('Invalid refresh response', false);
  }

  localStorage.setItem('accessToken', newAccessToken);
  localStorage.setItem('refreshToken', newRefreshToken);
  // Keep the live socket in sync with the freshly rotated token so any
  // reconnect re-authenticates correctly. Transient/auth-invalid throws
  // skip this — logout path handles socket teardown.
  updateSocketAuth();
  return newAccessToken;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // The retried request came back with another 401 — the brand-new access
    // token is already being rejected (server-side tokenVersion bump,
    // account deactivated, etc.). User is genuinely unauthenticated.
    if (
      error.response?.status === 401 &&
      originalRequest?._retry === true &&
      !isRedirecting
    ) {
      clearAuthAndRedirect();
      return Promise.reject(error);
    }

    // Only attempt refresh on 401, and only once per request
    if (error.response?.status === 401 && !originalRequest._retry && !isRedirecting) {
      originalRequest._retry = true;

      try {
        // Deduplicate concurrent refresh attempts
        if (!refreshPromise) {
          refreshPromise = doRefresh().finally(() => {
            refreshPromise = null;
          });
        }
        const newAccessToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        // Only log out on a genuine auth failure. Transient failures
        // (network, 5xx, malformed body) leave the session intact so the
        // user can retry once the server is healthy again.
        if ((refreshErr as RefreshError).authInvalid) {
          clearAuthAndRedirect();
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export { apiClient };
