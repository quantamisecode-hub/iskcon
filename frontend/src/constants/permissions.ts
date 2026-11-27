/**
 * Central Permission Definitions for Frontend Role & Permission Management.
 * Grouped by application module with individual CRUD actions.
 */

export interface PermissionDefinition {
  id: string;
  label: string;
  action: 'create' | 'read' | 'update' | 'delete';
}

export interface PermissionModule {
  id: string;
  name: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: 'events',
    name: 'Event Management',
    permissions: [
      { id: 'events:create', label: 'Create Events', action: 'create' },
      { id: 'events:read', label: 'View Events', action: 'read' },
      { id: 'events:update', label: 'Edit Events', action: 'update' },
      { id: 'events:delete', label: 'Delete / Cancel Events', action: 'delete' },
    ],
  },
  {
    id: 'inventory',
    name: 'Inventory Management',
    permissions: [
      { id: 'inventory:create', label: 'Create Food Items & Stock In', action: 'create' },
      { id: 'inventory:read', label: 'View Inventory & Ledger', action: 'read' },
      { id: 'inventory:update', label: 'Edit Food Items & Lots', action: 'update' },
      { id: 'inventory:delete', label: 'Stock Out & Delete Items', action: 'delete' },
    ],
  },
  {
    id: 'dishes',
    name: 'Dishes Management',
    permissions: [
      { id: 'dishes:create', label: 'Create Dishes', action: 'create' },
      { id: 'dishes:read', label: 'View Dishes', action: 'read' },
      { id: 'dishes:update', label: 'Edit Dishes', action: 'update' },
      { id: 'dishes:delete', label: 'Delete Dishes', action: 'delete' },
    ],
  },
  {
    id: 'requests',
    name: 'Material Requests',
    permissions: [
      { id: 'requests:create', label: 'Create Material Requests', action: 'create' },
      { id: 'requests:read', label: 'View Material Requests', action: 'read' },
      { id: 'requests:update', label: 'Edit & Approve Requests', action: 'update' },
      { id: 'requests:delete', label: 'Cancel Material Requests', action: 'delete' },
    ],
  },
  {
    id: 'returns',
    name: 'Material Returns',
    permissions: [
      { id: 'returns:create', label: 'Create Material Returns', action: 'create' },
      { id: 'returns:read', label: 'View Material Returns', action: 'read' },
      { id: 'returns:update', label: 'Edit & Process Returns', action: 'update' },
      { id: 'returns:delete', label: 'Cancel Material Returns', action: 'delete' },
    ],
  },
  {
    id: 'vendors',
    name: 'Vendors Management',
    permissions: [
      { id: 'vendors:create', label: 'Create Vendors', action: 'create' },
      { id: 'vendors:read', label: 'View Vendors', action: 'read' },
      { id: 'vendors:update', label: 'Edit Vendors', action: 'update' },
      { id: 'vendors:delete', label: 'Deactivate / Delete Vendors', action: 'delete' },
    ],
  },
  {
    id: 'users',
    name: 'User Management',
    permissions: [
      { id: 'users:create', label: 'Create Users', action: 'create' },
      { id: 'users:read', label: 'View Users & Assignments', action: 'read' },
      { id: 'users:update', label: 'Edit Users & Assign/Unassign', action: 'update' },
      { id: 'users:delete', label: 'Deactivate / Delete Users', action: 'delete' },
    ],
  },
  {
    id: 'profile',
    name: 'Profile Management',
    permissions: [
      { id: 'profile:read', label: 'View Profile', action: 'read' },
      { id: 'profile:update', label: 'Edit Profile', action: 'update' },
    ],
  },
];

export const ALL_PERMISSION_IDS: string[] = PERMISSION_MODULES.flatMap((m) =>
  m.permissions.map((p) => p.id),
);

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ALL_PERMISSION_IDS,
  EXECUTOR: [
    'events:read',
    'requests:create',
    'requests:read',
    'returns:create',
    'returns:read',
    'profile:read',
    'profile:update',
  ],
  EVENT_CREATOR: [
    'events:create',
    'events:read',
    'profile:read',
    'profile:update',
  ],
};
