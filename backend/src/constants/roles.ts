/**
 * System roles supported by the platform.
 * Authorization architecture (ADMIN / EXECUTOR and Admin->Executor scope)
 * is built around these constants in Phase 2 - it is never sprinkled
 * as raw strings through the code.
 */
export const ROLES = {
  ADMIN: 'ADMIN',
  EXECUTOR: 'EXECUTOR',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
