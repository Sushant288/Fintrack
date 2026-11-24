import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { SafeUser, SessionData } from '@/types';
import { authApi } from '@/api/auth.api';
import { usersApi } from '@/api/users.api';
import { tokenStore } from '@/api/tokenStore';
import {
  broadcastSession,
  broadcastLogout,
  setupMultiTabSync,
  scheduleProactiveRefresh,
  clearProactiveRefresh
} from '@/api/sessionSync';
import { SESSION_EXPIRED_EVENT } from '@/api/client';
import { ERROR_CODES } from '@/api/errorCodes';
import { ApiClientError } from '@/api/errors';
import { ROUTES } from '@/config/routes';
import { safeRedirect } from '@/utils/safeRedirect';
import { LoginInput, RegisterInput } from '@/utils/validators';
import { TIMING } from '@/config/timing';
import { useToast } from './ToastContext';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: SafeUser | null;
  bannerError: string | null;
  login: (credentials: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  applySession: (session: SessionData) => void;
  updateUser: (user: SafeUser) => void;
  retryBootstrap: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');
  const [user, setUser] = useState<SafeUser | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      clearProactiveRefresh();
    };
  }, []);

  const handleApplySession = useCallback(
    (session: SessionData, broadcast = true) => {
      tokenStore.set(session.accessToken, session.expiresIn);
      setUser(session.user);
      setStatus('authenticated');
      setBannerError(null);

      if (broadcast) {
        broadcastSession(session.user, session.accessToken, session.expiresIn);
      }

      // Schedule proactive refresh before token expires
      scheduleProactiveRefresh(session.expiresIn, async () => {
        try {
          const fresh = await authApi.refresh();
          if (isMounted.current) {
            handleApplySession(fresh, true);
          }
        } catch {
          /* ignore proactive refresh error */
        }
      });
    },
    []
  );

  const handleClearSession = useCallback(
    (broadcast = true) => {
      clearProactiveRefresh();
      tokenStore.clear();
      queryClient.clear();
      setUser(null);
      setStatus('unauthenticated');

      if (broadcast) {
        broadcastLogout();
      }
    },
    [queryClient]
  );

  // Bootstrap check on mount
  const bootstrap = useCallback(async () => {
    setStatus('bootstrapping');
    setBannerError(null);
    try {
      const session = await authApi.refresh();
      if (!isMounted.current) return;
      // If refresh succeeded but user is missing, fetch user
      if (session.user && session.user.id) {
        handleApplySession(session, false);
      } else {
        const fullUser = await usersApi.getMe();
        if (isMounted.current) {
          handleApplySession({ ...session, user: fullUser }, false);
        }
      }
    } catch (err) {
      if (!isMounted.current) return;
      tokenStore.clear();
      if (err instanceof ApiClientError) {
        // Expected for unauthenticated visitors
        if (
          err.code === ERROR_CODES.REFRESH_TOKEN_MISSING ||
          err.code === ERROR_CODES.INVALID_REFRESH_TOKEN ||
          err.code === ERROR_CODES.UNAUTHORIZED
        ) {
          setStatus('unauthenticated');
          return;
        }
        // Server or network connectivity issue
        if (err.code === ERROR_CODES.NETWORK_ERROR || err.status >= 500) {
          setStatus('unauthenticated');
          setBannerError("Can't reach the server. Check your connection and try again.");
          return;
        }
      }
      setStatus('unauthenticated');
    }
  }, [handleApplySession]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Multi-tab synchronization
  useEffect(() => {
    const cleanup = setupMultiTabSync({
      onSession: (syncedUser, accessToken, expiresIn) => {
        handleApplySession({ user: syncedUser, accessToken, expiresIn }, false);
      },
      onLogout: () => {
        handleClearSession(false);
        navigate(ROUTES.LOGIN);
      }
    });
    return cleanup;
  }, [handleApplySession, handleClearSession, navigate]);

  // Session expired event handler
  useEffect(() => {
    const handleExpired = () => {
      handleClearSession(false);
      toast.error('Your session ended. Sign in again.');
      const currentPath = location.pathname + location.search;
      navigate(ROUTES.LOGIN, { state: { returnTo: currentPath } });
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    };
  }, [handleClearSession, location, navigate, toast]);

  // Proactive refresh on visibility change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && status === 'authenticated') {
        const state = tokenStore.get();
        const now = Date.now();
        if (state.expiresAtMs - now <= TIMING.REFRESH_SKEW_MS) {
          try {
            const fresh = await authApi.refresh();
            if (isMounted.current) {
              handleApplySession(fresh, true);
            }
          } catch {
            /* ignore proactive refresh error */
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [status, handleApplySession]);

  const login = async (credentials: LoginInput) => {
    queryClient.clear();
    const session = await authApi.login(credentials);
    handleApplySession(session, true);

    const state = location.state as { returnTo?: string } | null;
    const destination = safeRedirect(state?.returnTo, ROUTES.HOME);
    navigate(destination, { replace: true });
  };

  const register = async (data: RegisterInput) => {
    queryClient.clear();
    const body: {
      name: string;
      email: string;
      password: string;
      currency?: string;
      timezone?: string;
    } = {
      name: data.name.trim(),
      email: data.email.trim(),
      password: data.password
    };

    if (data.useDeviceSettings) {
      if (data.currency) body.currency = data.currency;
      if (data.timezone) body.timezone = data.timezone;
    }

    const session = await authApi.register(body);
    handleApplySession(session, true);
    navigate(ROUTES.HOME, { replace: true });
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Always clean up locally even if API call fails
    } finally {
      handleClearSession(true);
      navigate(ROUTES.LOGIN, { replace: true });
    }
  };

  const updateUser = (updated: SafeUser) => {
    setUser(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        bannerError,
        login,
        register,
        logout,
        applySession: handleApplySession,
        updateUser,
        retryBootstrap: bootstrap
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within an AuthProvider');
  return ctx;
}
