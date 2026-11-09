import type { AuthRole } from '../components/routing/RoleGuard';

/**
 * Role-aware navigation structure (architecture only).
 * Business modules arrive in later phases; these entries already match
 * the final system's structure (ADMIN vs EXECUTOR access scopes).
 */
export interface NavItem {
  label: string;
  to: string;
  roles: readonly AuthRole[];
}

const ALL: readonly AuthRole[] = ['ADMIN', 'EXECUTOR'];

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', roles: ALL },
  { label: 'Calendar', to: '/calendar', roles: ALL },
  { label: 'Events', to: '/events', roles: ALL },
  { label: 'Inventory', to: '/inventory', roles: ['ADMIN'] },
  { label: 'Requests', to: '/requests', roles: ALL },
  { label: 'Notifications', to: '/notifications', roles: ALL },
  { label: 'Users', to: '/users', roles: ['ADMIN'] },
  { label: 'Settings', to: '/settings', roles: ['ADMIN'] },
  { label: 'Profile', to: '/profile', roles: ['EXECUTOR'] },
];
