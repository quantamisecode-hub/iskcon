import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { PageLoader } from '../common/PageLoader';

/**
 * SERVER-ENFORCED sessions; this guard is UX, not security.
 * - While the session is being restored: show a loader (no flash).
 * - No valid session: redirect to /login, remembering the target page
 *   so the user returns there after signing in.
 * - The backend still rejects every unauthenticated API call with 401.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <PageLoader label="Checking your session…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
