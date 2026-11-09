import type { ReactNode } from 'react';
import type { UserRole } from '../../context/AuthContext';

/**
 * PLACEHOLDER - real enforcement arrives with Phase 2 authorization.
 *
 * Phase 2 behaviour: renders children only when the logged-in user's
 * role (ADMIN / EXECUTOR) matches the allowed roles; otherwise shows
 * the Unauthorized page. No fake role checking in Phase 1.
 */
export function RoleGuard({ allowedRoles, children }: { allowedRoles: UserRole[]; children: ReactNode }) {
  void allowedRoles; // Placeholder: used for real checks in Phase 2.
  return <>{children}</>;
}
