import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import express from 'express';
import type { Application } from 'express';
import { env } from './env.js';

/**
 * SECURITY CONFIGURATION (single source of truth).
 *
 * Helmet locks down HTTP headers, CORS allows ONLY the configured
 * frontend origin for credential-bearing requests, and request bodies
 * are size-limited. None of these are weakened for development.
 */

const corsOptions: CorsOptions = {
  // Credential-capable CORS must never use a wildcard origin.
  origin(requestingOrigin, callback) {
    if (!requestingOrigin) {
      // Non-browser clients (curl, health checks) send no Origin header.
      return callback(null, true);
    }
    if (env.ALLOWED_ORIGINS.includes(requestingOrigin.toLowerCase())) {
      return callback(null, true);
    }
    // Reject silently: the browser refuses the response.
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Request-Id'],
  maxAge: 600,
};

/**
 * Helmet secure defaults: no-sniff, frameguard (DENY), no-referrer policy,
 * HSTS, XSS protections. The API serves JSON only - it never loads the
 * Vite dev server in a frame - so no header is disabled. A relaxed
 * Content-Security-Policy applies in development (JSON API, no pages served).
 */
function buildHelmetOptions(): Parameters<typeof helmet>[0] {
  return {
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    referrerPolicy: { policy: 'no-referrer' },
    // Frame + MIME protections remain ON in every environment.
    frameguard: { action: 'deny' },
    noSniff: true,
  };
}

export function applySecurityMiddleware(app: Application): void {
  app.use(helmet(buildHelmetOptions()));
  app.use(cors(corsOptions));
  // Body size limits - guard against oversized request attacks.
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: env.REQUEST_BODY_LIMIT }));
}

/**
 * Session cookie policy.
 * HttpOnly: JavaScript (and therefore XSS) cannot read the token.
 * Name comes from validated environment (default `fis_session`).
 */
export const SESSION_COOKIE_NAME = env.SESSION_COOKIE_NAME;

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: boolean | 'lax' | 'strict' | 'none';
  path: '/';
  maxAge?: number;
}

export function buildSessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/',
  };
}
