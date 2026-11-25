import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';

/**
 * Redirects already-authenticated users away from /login to the dashboard.
 */
export function useRedirectIfAuthenticated() {
  const { isAuthenticated, status, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'ready' && isAuthenticated) {
      navigate(user?.role === 'EVENT_CREATOR' ? '/events' : '/dashboard', { replace: true });
    }
  }, [isAuthenticated, status, navigate, user?.role]);
}
