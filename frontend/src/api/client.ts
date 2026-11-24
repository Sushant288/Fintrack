import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { env } from '@/config/env';
import { TIMING } from '@/config/timing';
import { tokenStore } from './tokenStore';
import { normalizeError } from './errors';
import { ERROR_CODES } from './errorCodes';
import { withRefreshLock } from './sessionSync';
import { SessionData, Envelope } from '@/types';

// Custom session expired event
export const SESSION_EXPIRED_EVENT = 'fintrack:session-expired';

export function emitSessionExpired(): void {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

// 1. Bare client (NO interceptors, used for login, register, refresh, logout to prevent recursion)
export const bare = axios.create({
  baseURL: env.VITE_API_URL,
  withCredentials: true,
  timeout: TIMING.REQUEST_TIMEOUT_MS
});

// 2. Intercepted client
export const api = axios.create({
  baseURL: env.VITE_API_URL,
  withCredentials: true,
  timeout: TIMING.REQUEST_TIMEOUT_MS
});

// Request interceptor: attach Authorization header
api.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * SINGLE-FLIGHT module-level refresh promise.
 *
 * WHY single-flight and cross-tab locking matter:
 * The server rotates refresh tokens upon each refresh and treats any reused
 * token as theft, revoking ALL sessions for that user. Two concurrent refreshes
 * with the same cookie would trigger theft detection and mass logout.
 * Shared promise in-tab and Web Locks across tabs guarantee exactly ONE refresh.
 */
let inFlightRefresh: Promise<SessionData> | null = null;

export async function refreshSession(): Promise<SessionData> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  const initialVersion = tokenStore.get().version;

  inFlightRefresh = (async () => {
    return withRefreshLock(async () => {
      // Re-check version: another tab might have refreshed while we waited for the lock
      const current = tokenStore.get();
      if (current.version > initialVersion && current.accessToken) {
        return {
          user: {} as SessionData['user'], // placeholder, caller has user from state
          accessToken: current.accessToken,
          expiresIn: Math.max(0, Math.floor((current.expiresAtMs - Date.now()) / 1000))
        };
      }

      try {
        const res = await bare.post<Envelope<SessionData>>('/auth/refresh');
        const session = res.data.data;
        if (!session || !session.accessToken) {
          throw new Error('Invalid refresh response payload');
        }
        tokenStore.set(session.accessToken, session.expiresIn);
        return session;
      } catch (err) {
        const normalized = normalizeError(err);

        // Permanent refresh rejection codes -> clear token store and emit session expired
        if (
          normalized.code === ERROR_CODES.REFRESH_TOKEN_MISSING ||
          normalized.code === ERROR_CODES.INVALID_REFRESH_TOKEN ||
          normalized.code === ERROR_CODES.REFRESH_TOKEN_REUSED ||
          normalized.code === ERROR_CODES.UNAUTHORIZED
        ) {
          tokenStore.clear();
          emitSessionExpired();
        }

        // Network or 5xx failures reject WITHOUT clearing the session or emitting logout
        throw normalized;
      }
    });
  })();

  try {
    return await inFlightRefresh;
  } finally {
    inFlightRefresh = null;
  }
}

interface CustomRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Response interceptor: 401 recovery
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as CustomRequestConfig | undefined;
    if (!originalRequest) {
      return Promise.reject(normalizeError(error));
    }

    const status = error.response?.status;
    const data = error.response?.data as Envelope | undefined;
    const code = data?.error?.code;

    const isAuthEndpoint =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/register') ||
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest.url?.includes('/auth/logout');

    // Only retry on 401 with TOKEN_EXPIRED or UNAUTHORIZED on non-auth endpoints
    if (
      status === 401 &&
      (code === ERROR_CODES.TOKEN_EXPIRED || code === ERROR_CODES.UNAUTHORIZED) &&
      !isAuthEndpoint &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      try {
        const newSession = await refreshSession();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newSession.accessToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(normalizeError(error));
  }
);
