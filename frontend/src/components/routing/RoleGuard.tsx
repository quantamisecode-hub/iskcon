import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { PageLoader } from '../common/PageLoader';

/**
 * Role-based rendering guard (UX layer).
 * The backend independently enforces the same rule on every API call
 * with requireRole(...) — role data can never be spoofed from React.
 */
export function RoleGuard({ allowedRoles, children }: { allowedRoles: AuthRole[]; children: ReactNode }) {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return <PageLoader />;
  }
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return <>{children}</>;
}

export type AuthRole = 'ADMIN' | 'EXECUTOR';
