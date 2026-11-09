/**
 * Audited actions. Reusable by every future phase
 * (inventory, events, requests, approvals, returns...).
 */
export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  CREATE_USER: 'CREATE_USER',
  CREATE_ADMIN: 'CREATE_ADMIN',
  CREATE_EXECUTOR: 'CREATE_EXECUTOR',
  UPDATE_USER: 'UPDATE_USER',
  DEACTIVATE_USER: 'DEACTIVATE_USER',
  ACTIVATE_USER: 'ACTIVATE_USER',
  ROLE_CHANGE: 'ROLE_CHANGE',
  ASSIGN_EXECUTOR: 'ASSIGN_EXECUTOR',
  UNASSIGN_EXECUTOR: 'UNASSIGN_EXECUTOR',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
