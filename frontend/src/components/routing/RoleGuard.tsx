import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { PageLoader } from '../common/PageLoader';

/**
 * Role-based rendering guard (UX layer).
 * The backend independently enforces the same rule on every API call
 * with requireRole(...) — role data can never be spoofed from React.
 */
export function RoleGuard({
  allowedRoles,
  requiredPermission,
  children,
}: {
  allowedRoles?: AuthRole[];
  requiredPermission?: string;
  children: ReactNode;
}) {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return <PageLoader />;
  }
  if (!user) {
    return <Navigate to="/unauthorized" replace />;
  }
  if (user.role === 'ADMIN') {
    return <>{children}</>;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (!requiredPermission || !(user.permissions ?? []).includes(requiredPermission)) {
      return <Navigate to="/unauthorized" replace />;
    }
  }
  if (requiredPermission && !(user.permissions ?? []).includes(requiredPermission)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return <>{children}</>;
}

export type AuthRole = 'ADMIN' | 'EXECUTOR' | 'EVENT_CREATOR';
