/**
 * SAFE USER PROJECTIONS
 * Central rule: passwordHash NEVER leaves the database layer.
 * Every API-facing user object is built through these helpers.
 */
import type { User } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'ADMIN' | 'EXECUTOR';
  isActive: boolean;
}

export function toSafeUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
}
