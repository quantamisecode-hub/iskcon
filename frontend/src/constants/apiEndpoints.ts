/**
 * Single source of truth for API endpoint paths.
 * Components/hooks must import from here instead of typing URLs directly.
 */
export const API_ENDPOINTS = {
  health: '/v1/health',
  healthDatabase: '/v1/health/db',
} as const;
