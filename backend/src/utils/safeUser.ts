/**
 * SAFE USER PROJECTIONS
 * Central rule: passwordHash NEVER leaves the database layer.
 * Every API-facing user object is built through these helpers.
 */
import type { User, UserPermission } from '@prisma/client';
import type { Role } from '../constants/roles.js';
import { resolveEffectivePermissions } from '../constants/permissions.js';

export interface AuthenticatedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
  avatarUrl: string | null;
  permissions: string[];
}

export type UserWithPermissions = User & {
  permissions?: UserPermission[] | Array<{ permission: string }>;
};

export function toSafeUser(user: UserWithPermissions, explicitPermissions?: string[] | unknown): AuthenticatedUser {
  const permStrings = Array.isArray(explicitPermissions)
    ? explicitPermissions
    : user.permissions
      ? user.permissions.map((p) => p.permission)
      : undefined;

  const permissions = resolveEffectivePermissions(user.role, permStrings);

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    avatarUrl: user.avatarUrl ?? null,
    permissions,
  };
}
