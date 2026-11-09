import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';

/**
 * Redirects already-authenticated users away from /login to the dashboard.
 */
export function useRedirectIfAuthenticated() {
  const { isAuthenticated, status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'ready' && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, status, navigate]);
}
