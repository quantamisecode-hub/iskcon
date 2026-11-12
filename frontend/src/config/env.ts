/**
 * Central frontend configuration.
 * Reads ONLY public VITE_* variables. Vite embeds these into the
 * built bundle, so they must never contain secrets.
 *
 * VITE_API_URL is the FULL backend API root, including the version
 * prefix, for example:
 *   development: http://localhost:5000/api/v1
 *   production:  https://api.YOUR_DOMAIN/api/v1
 *
 * Endpoint constants therefore contain only the path after /api/v1
 * (for example `/health`), and Axios joins the two safely.
 */

const API_VERSION_PATH = '/api/v1';

function readApiUrl(): string {
  const raw = import.meta.env.VITE_API_URL?.trim();

  if (!raw) {
    throw new Error(
      'VITE_API_URL is not configured. ' +
        'Set it in frontend/.env.development or frontend/.env.production (see frontend/.env.example).',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      'VITE_API_URL must be an absolute URL, for example https://api.example.com/api/v1.',
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('VITE_API_URL must use http:// or https://.');
  }

  if (parsed.search || parsed.hash) {
    throw new Error('VITE_API_URL must not contain a query string or hash.');
  }

  // Normalise trailing slashes so base + endpoint never produces `//`.
  const pathname = parsed.pathname.replace(/\/+$/, '');

  if (!pathname.endsWith(API_VERSION_PATH)) {
    throw new Error(
      `VITE_API_URL must include the backend API prefix ${API_VERSION_PATH}, ` +
        `for example https://api.example.com${API_VERSION_PATH}.`,
    );
  }

  return `${parsed.origin}${pathname}`;
}

const API_URL = readApiUrl();

const API_TIMEOUT_MS = (() => {
  const raw = import.meta.env.VITE_API_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
})();

export const appConfig = {
  /** Full API root, always without a trailing slash. */
  apiUrl: API_URL,
  apiTimeoutMs: API_TIMEOUT_MS,
  /** True when running through Vite's dev server. */
  isDevelopment: import.meta.env.DEV,
  buildMode: import.meta.env.MODE,
} as const;

/** Socket.IO lives at the backend origin root, not under /api/v1. */
export const apiOrigin = new URL(API_URL).origin;
