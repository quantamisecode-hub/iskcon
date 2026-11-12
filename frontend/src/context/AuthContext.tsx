import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUserProfile } from '../features/auth/api/auth.api';
import { loginRequest, logoutRequest, fetchCurrentUser } from '../features/auth/api/auth.api';
import { SESSION_EXPIRED_EVENT, type AuthEventDetail } from '../constants/authEvents';

/**
 * AUTH CONTEXT (session via secure HttpOnly cookie).
 *
 * - The user profile (id/name/email/role) is the ONLY state held here.
 *   No tokens, passwords, or secrets exist in React state or storage.
 * - On mount the app asks the backend "who am I?" — the session cookie
 *   determines the answer; nothing is persisted in the browser.
 * - A global 401 event (from the API client) clears the session so all
 *   protected routes redirect to /login exactly once (no redirect loops).
 */

export type { AuthUserProfile };

export interface AuthContextValue {
  user: AuthUserProfile | null;
  isAuthenticated: boolean;
  status: 'loading' | 'ready';
  login(email: string, password: string): Promise<AuthUserProfile>;
  logout(): Promise<void>;
  /** Re-fetch the current user from the backend (after profile/avatar changes). */
  refreshUser(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  const isAuthenticated = user !== null;

  // Restore the session (if any) on application start.
  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((profile) => {
        if (!cancelled) {
          setUser(profile);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('ready');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Session died server-side (expired/revoked) -> drop local state once.
  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<AuthEventDetail>).detail;
      void detail;
      setUser(null);
      setStatus('ready');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const profile = await loginRequest(email, password);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await fetchCurrentUser();
      setUser(profile);
    } catch {
      // Keep the previous profile on transient failures.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated, status, login, logout, refreshUser }),
    [user, isAuthenticated, status, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
