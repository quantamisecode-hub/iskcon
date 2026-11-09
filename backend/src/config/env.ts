import { z } from 'zod';

/**
 * Central, typed environment configuration.
 *
 * The application FAILS FAST at startup if required variables are missing
 * or invalid - it never runs silently with `DATABASE_URL = undefined`.
 * Every configuration read in the backend goes through this module;
 * `process.env` is not read anywhere else.
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

  // Only the configured frontend origin may call the API (CORS allowlist)
  FRONTEND_URL: z.string().min(1).default('http://localhost:5173'),

  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppEnv = z.infer<typeof envSchema>;

function loadEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('---------------------------------------------------------------');
    console.error('ENVIRONMENT VALIDATION FAILED - the API will not start.');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.') || 'environment'}: ${issue.message}`);
    }
    console.error('Fix backend/.env (see backend/.env.example) and restart.');
    console.error('---------------------------------------------------------------');
    process.exit(1);
  }

  return parsed.data;
}

/** Non-blocking reminder when credentials look like placeholders (Phase 1 convenience). */
function warnOnPlaceholderCredentials(value: AppEnv): void {
  if (value.DATABASE_URL.includes('CHANGE_ME') || value.DATABASE_URL.includes('USERNAME')) {
    console.warn(
      '[config] DATABASE_URL still contains placeholder credentials - replace them in backend/.env before using database features.',
    );
  }
}

export const env: AppEnv = loadEnv();
warnOnPlaceholderCredentials(env);
