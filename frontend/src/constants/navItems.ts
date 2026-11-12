import type { AuthRole } from '../components/routing/RoleGuard';

/**
 * Role-aware navigation structure.
 * Business modules land with their phases; entries already match
 * the final system's structure (ADMIN vs EXECUTOR access scopes).
 * Navigation here is UX — the backend independently enforces every rule.
 */
export interface NavChildItem {
  label: string;
  to: string;
}

export interface NavItem {
  label: string;
  to: string;
  roles: readonly AuthRole[];
  /** Sub-menu rendered under an expandable parent (e.g. Inventory). */
  children?: readonly NavChildItem[];
}

const ALL: readonly AuthRole[] = ['ADMIN', 'EXECUTOR'];

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', roles: ALL },
  { label: 'Calendar', to: '/calendar', roles: ALL },
  { label: 'Events', to: '/events', roles: ALL },
  { label: 'Dishes', to: '/dishes', roles: ['ADMIN'] },
  {
    label: 'Inventory',
    to: '/inventory',
    roles: ['ADMIN'],
    children: [
      { label: 'Stock In', to: '/inventory?stockIn=1' },
      { label: 'Stock Out', to: '/inventory?stockOut=1' },
      { label: 'Show Ledger', to: '/inventory/ledger' },
      { label: 'Add/Show Category', to: '/inventory/categories' },
      { label: 'Food Items', to: '/inventory/food-items' },
    ],
  },
  { label: 'Requests', to: '/requests', roles: ALL },
  { label: 'Returns', to: '/returns', roles: ALL },
  { label: 'Manage Users', to: '/users', roles: ['ADMIN'] },
  { label: 'Profile', to: '/profile', roles: ALL },
];
