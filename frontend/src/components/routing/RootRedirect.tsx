import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { PageLoader } from '../common/PageLoader';

/**
 * Landing page decision point:
 *  - signed in  -> /dashboard
 *  - signed out -> /login
 *  - session still being restored -> loader (no wrong-way flash)
 */
export function RootRedirect() {
  const { isAuthenticated, status, user } = useAuth();

  if (status === 'loading') {
    return <PageLoader label="Checking your session…" />;
  }

  // Event Creators have no dashboard — their landing page is the events list.
  const target = !isAuthenticated
    ? '/login'
    : user?.role === 'EVENT_CREATOR'
      ? '/events'
      : '/dashboard';
  return <Navigate to={target} replace />;
}
