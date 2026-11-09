import type { ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';

/**
 * PLACEHOLDER - real enforcement arrives with Phase 2 authentication.
 *
 * Once the backend session exists, this component will:
 *   1. redirect unauthenticated visitors to the login page, and
 *   2. remember the page they wanted so they return after logging in.
 *
 * For Phase 1 it renders its children without checking anything,
 * because there is no authentication to check yet. NO fake logic.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  void isAuthenticated; // Placeholder: used for real protection in Phase 2.
  return <>{children}</>;
}
