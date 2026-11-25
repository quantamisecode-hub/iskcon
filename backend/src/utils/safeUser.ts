/**
 * SAFE USER PROJECTIONS
 * Central rule: passwordHash NEVER leaves the database layer.
 * Every API-facing user object is built through these helpers.
 */
import type { User } from '@prisma/client';
import type { Role } from '../constants/roles.js';

export interface AuthenticatedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
  avatarUrl: string | null;
}

export function toSafeUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    avatarUrl: user.avatarUrl ?? null,
  };
}
