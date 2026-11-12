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
  const { isAuthenticated, status } = useAuth();

  if (status === 'loading') {
    return <PageLoader label="Checking your session…" />;
  }

  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}
