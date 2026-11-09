/**
 * PLACEHOLDER - real authentication endpoints arrive in Phase 2.
 *
 * Planned architecture: secure HTTP-only cookie sessions.
 * The frontend never stores session tokens in localStorage;
 * the browser holds an HttpOnly cookie and the backend validates it.
 * This file will expose login() and logout() when the API exists.
 */
export const authApi = {
  async notImplemented(): Promise<never> {
    throw new Error('Authentication is planned for Phase 2.');
  },
};
