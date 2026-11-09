/** Names of app-wide authentication lifecycle events. */
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

export const AUTH_EVENTS = {
  sessionExpired: SESSION_EXPIRED_EVENT,
} as const;

export interface AuthEventDetail {
  reason: 'unauthorized' | 'manual-logout';
}
