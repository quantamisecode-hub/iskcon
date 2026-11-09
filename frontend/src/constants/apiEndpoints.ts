/**
 * Single source of truth for API endpoint paths.
 */
export const API_ENDPOINTS = {
  health: '/v1/health',
  healthDatabase: '/v1/health/db',
  login: '/v1/auth/login',
  logout: '/v1/auth/logout',
  me: '/v1/auth/me',
  users: '/v1/users',
  assignments: '/v1/assignments',
} as const;
