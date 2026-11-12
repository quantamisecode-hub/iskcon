import { z } from 'zod';

/**
 * Central, typed environment configuration.
 *
 * The application FAILS FAST at startup if required variables are missing
 * or invalid - it never runs silently with `DATABASE_URL = undefined`.
 * Every configuration read in the backend goes through this module;
 * `process.env` is not read anywhere else.
 *
 * CORS allowlist:
 *   - `CORS_ORIGIN` is the canonical variable and accepts one origin or a
 *     comma-separated list (production frontend, staging/preview URLs).
 *   - `FRONTEND_URL` is still accepted for backwards compatibility with
 *     existing deployments and local .env files.
 *   - Development/test fall back to http://localhost:5173 when neither is set.
 *   - Production REQUIRES an explicit value (no silent localhost default).
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(5000),

  // MySQL connection string for Prisma/MySQL
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((value) => value.startsWith('mysql://'), {
      message: 'DATABASE_URL must be a MySQL connection string starting with mysql://',
    }),

  REQUEST_BODY_LIMIT: z
    .string()
    .regex(/^\d+([bKMG]b)$/i, 'REQUEST_BODY_LIMIT must look like 100kb, 1mb, ...')
    .default('100kb'),

  // CORS allowlist. CORS_ORIGIN is preferred; FRONTEND_URL is the legacy name.
  CORS_ORIGIN: z.string().min(1).optional(),
  FRONTEND_URL: z.string().min(1).optional(),

  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // Authentication session cookie settings. No server-side signing secret
  // is needed: session tokens are 256-bit random values stored as SHA-256
  // hashes (see docs/security-baseline.md).
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(64)
    .default('fis_session'),
  SESSION_EXPIRES_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppEnv = Omit<z.infer<typeof envSchema>, 'FRONTEND_URL'> & {
  /** Primary allowed origin (kept for logging/backwards compatibility). */
  FRONTEND_URL: string;
  /** Every allowed browser origin, already normalised and de-duplicated. */
  ALLOWED_ORIGINS: string[];
};

const DEFAULT_DEVELOPMENT_ORIGIN = 'http://localhost:5173';

function fail(messages: string[]): never {
  console.error('---------------------------------------------------------------');
  console.error('ENVIRONMENT VALIDATION FAILED - the API will not start.');
  for (const message of messages) {
    console.error(`  - ${message}`);
  }
  console.error('Fix backend/.env (see backend/.env.example) and restart.');
  console.error('---------------------------------------------------------------');
  process.exit(1);
}

/** Accept only a bare http(s) origin: no path, query, hash or credentials. */
function normalizeOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('CORS_ORIGIN contains an empty entry.');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`"${trimmed}" is not a valid origin URL.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`"${trimmed}" must use http:// or https://.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`"${trimmed}" must not contain credentials.`);
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`"${trimmed}" must be an origin only (no path, query or hash).`);
  }

  return parsed.origin.toLowerCase();
}

function resolveAllowedOrigins(config: z.infer<typeof envSchema>): string[] {
  const raw = config.CORS_ORIGIN ?? config.FRONTEND_URL;

  if (!raw) {
    if (config.NODE_ENV === 'production') {
      throw new Error(
        'CORS_ORIGIN is required in production (for example https://YOUR_FRONTEND_DOMAIN).',
      );
    }
    return [DEFAULT_DEVELOPMENT_ORIGIN];
  }

  return Array.from(new Set(raw.split(',').map(normalizeOrigin)));
}

function loadEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    fail(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`));
  }

  let allowedOrigins: string[];
  try {
    allowedOrigins = resolveAllowedOrigins(parsed.data);
  } catch (error) {
    fail([error instanceof Error ? error.message : 'Invalid CORS origin configuration.']);
  }

  if (parsed.data.COOKIE_SAME_SITE === 'none' && !parsed.data.COOKIE_SECURE) {
    fail(['COOKIE_SECURE must be true when COOKIE_SAME_SITE is none (browsers reject it otherwise).']);
  }

  const [primaryOrigin] = allowedOrigins;
  if (!primaryOrigin) {
    fail(['At least one CORS origin must be configured.']);
  }

  return {
    ...parsed.data,
    FRONTEND_URL: primaryOrigin,
    ALLOWED_ORIGINS: allowedOrigins,
  };
}

/** Non-blocking reminder when credentials look like placeholders (Phase 1 convenience). */
function warnOnPlaceholderCredentials(value: AppEnv): void {
  if (value.DATABASE_URL.includes('CHANGE_ME') || value.DATABASE_URL.includes('USERNAME')) {
    console.warn(
      '[config] DATABASE_URL still contains placeholder credentials - replace them in backend/.env before using database features.',
    );
  }
}

/** Non-blocking production reminders. These never weaken security. */
function warnOnProductionConfig(value: AppEnv): void {
  if (value.NODE_ENV !== 'production') return;

  if (!value.COOKIE_SECURE) {
    console.warn('[config] COOKIE_SECURE=false in production. Use HTTPS and COOKIE_SECURE=true.');
  }
  for (const origin of value.ALLOWED_ORIGINS) {
    if (!origin.startsWith('https://')) {
      console.warn(`[config] Allowed origin ${origin} is not HTTPS. Use HTTPS in production.`);
    }
  }
  if (value.COOKIE_SAME_SITE === 'lax' && value.ALLOWED_ORIGINS.length > 0) {
    console.info(
      '[config] COOKIE_SAME_SITE=lax is correct for same-origin deployments. ' +
        'For a cross-origin frontend (for example Vercel + separate API), use COOKIE_SAME_SITE=none and COOKIE_SECURE=true.',
    );
  }
}

export const env: AppEnv = loadEnv();
warnOnPlaceholderCredentials(env);
warnOnProductionConfig(env);
