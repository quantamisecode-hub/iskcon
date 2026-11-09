import { createContext, useState, type ReactNode } from 'react';

/**
 * PLACEHOLDER - full implementation arrives with Phase 2 authentication.
 *
 * This establishes the shape of the authentication state so later phases
 * (login page, protected routes, role-based access) plug in without
 * redesigning the frontend. NO fake login is performed here.
 */

export type UserRole = 'ADMIN' | 'EXECUTOR';

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface AuthContextValue {
  /** The logged-in user, or null when nobody is logged in. */
  user: AuthUser | null;
  /** Convenience flag derived from `user`. */
  isAuthenticated: boolean;
  /** 'loading' while the session is being restored from the server. */
  status: 'loading' | 'ready';
}

const AuthContext = createContext<AuthContextValue | null>(null);

const initialAuthState: AuthContextValue = {
  user: null,
  isAuthenticated: false,
  status: 'ready',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // Phase 1: static placeholder state. Phase 2 will hydrate from the API session.
  const [authState] = useState<AuthContextValue>(initialAuthState);
  return <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>;
}

export { AuthContext };
