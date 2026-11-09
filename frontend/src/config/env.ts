/**
 * Central frontend configuration.
 * Reads ONLY public VITE_* variables. Vite embeds these into the
 * built bundle, so they must never contain secrets.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api';

const API_TIMEOUT_MS = (() => {
  const raw = import.meta.env.VITE_API_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
})();

export const appConfig = {
  apiBaseUrl: API_BASE_URL,
  apiTimeoutMs: API_TIMEOUT_MS,
  /** True when running through Vite's dev server. */
  isDevelopment: import.meta.env.DEV,
  buildMode: import.meta.env.MODE,
} as const;
