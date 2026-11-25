import type { AuthRole } from '../../../components/routing/RoleGuard';

/** Safe landing page for each role — never a route the role cannot open. */
export function roleHome(role: AuthRole | undefined): string {
  return role === 'EVENT_CREATOR' ? '/events' : '/dashboard';
}

/** Check a post-login target against the role's allowed route prefixes. */
export function isRouteAllowedForRole(role: AuthRole | undefined, path: string): boolean {
  if (!role) return false;
  if (role === 'ADMIN') return true;
  if (role === 'EXECUTOR') {
    return ['/dashboard', '/calendar', '/events', '/requests', '/returns', '/profile', '/auth'].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  }
  return ['/calendar', '/events'].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Returns the requested target if the role may open it, otherwise the role home. */
export function safeTargetForRole(role: AuthRole | undefined, target: string): string {
  return isRouteAllowedForRole(role, target) ? target : roleHome(role);
}
