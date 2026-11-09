# Security Baseline — Food Inventory System

**Status legend:**
`IMPLEMENTED` = active in the code today.
`PLANNED` = architecture is prepared; the feature arrives in a future phase.
Nothing is claimed as implemented unless it really is.

---

## Authentication — PLANNED (Phase 2)

- Strategy: backend-side sessions with **secure HTTP-only cookies**
  (`fis_session`), not localStorage tokens. HttpOnly means JavaScript/XSS
  cannot read the session token.
- Password hashing: **Argon2id** (fallback bcrypt) — never plain text,
  never logged, never returned by the API.
- Login/logout, session expiration, invalidation on logout: Phase 2.
- Foundation present: `frontend` axios client uses `withCredentials: true`;
  backend has `buildSessionCookieOptions()` with HttpOnly/Secure/SameSite
  driven by environment; `auth.middleware.ts` refuses to authorize anything
  until the real system exists (returns 501, no fake auth).

## Authorization — PLANNED (Phase 2)

- Roles `ADMIN`, `EXECUTOR` defined centrally in `constants/roles.ts`.
- Admin → Executor assignment will define data scope (an Executor acts only
  within assigned scope). Central `requireRole` middleware — no scattered
  role strings — Phase 2.
- Frontend: `ProtectedRoute` and `RoleGuard` components exist as placeholders;
  auth state shape defined in `AuthContext`.

## CSRF — PLANNED, strategy decided

Because authentication will rely on cookies, CSRF will be handled with the
**double-submit cookie token** pattern plus SameSite cookies:
a random CSRF token is set in a readable cookie and must be echoed in a
request header; the backend rejects mismatches on state-changing requests.
Documented now so Phase 2 implements it from day one.

## Environment variables & secrets — IMPLEMENTED (mechanism)

- `.env` files are Git-ignored (root + per-folder `.gitignore`);
  only `.env.example` is committed.
- Frontend `.env` may contain only PUBLIC `VITE_*` configuration. Vite
  embeds these into the browser bundle — secrets are forbidden there and
  none exist.
- Backend secrets live only in `backend/.env` (local machine).
- No credentials are hard-coded anywhere in the code.

## Environment validation — IMPLEMENTED

`backend/src/config/env.ts` validates every required variable with Zod at
startup. Missing or malformed values (bad `DATABASE_URL`, unknown log level,
…) abort startup with an exact list of failures — the API cannot run with
`DATABASE_URL = undefined`.
Placeholder-credential DATABASE_URL warns at startup (real credentials are
expected in Phase 2), but malformed URLs still fail hard.

## CORS — IMPLEMENTED

- Origin allowlist: only `FRONTEND_URL` (default `http://localhost:5173`)
  may call the API with credentials. No `*` wildcard.
- Configured via environment; non-browser clients (no Origin) are allowed
  for health probes only.

## Security headers (Helmet) — IMPLEMENTED

- `X-Frame-Options: DENY` (clickjacking protection)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Strict-Transport-Security` (HSTS)
- CSP: production uses Helmet's strict default; development relaxes CSP
  **only** because the API serves JSON, never HTML pages. All other headers
  remain on in every environment. Vite is unaffected (separate origin/port).

## Rate limiting — IMPLEMENTED

- Global limiter: `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` (defaults: 15 min
  / 300 requests) on the whole API.
- Stricter `authLimiter` (`AUTH_RATE_LIMIT_MAX`, default 10) prepared and
  documented: it MUST be mounted on `/api/v1/auth/*` when those routes are
  created in Phase 2 — brute-force protection.
- All values from environment, not hard-coded.

## Request size limits — IMPLEMENTED

`express.json` and `express.urlencoded` limited by `REQUEST_BODY_LIMIT`
(default `100kb`), validated against a strict pattern.

## Input validation — IMPLEMENTED (mechanism) / applied per endpoint in Phase 2+

Zod-based `validateBody` / `validateQuery` / `validateParams` middleware
exists. Policy: client data is never trusted; every future endpoint attaches
validators; parsed data replaces raw values. Frontend validation is UX only.

## Error handling — IMPLEMENTED

Central handler (`error.middleware.ts`)
- one standard error envelope: `{ success, message, code, requestId }`
- unknown errors return a generic "Something went wrong" (500, INTERNAL_ERROR)
- stack traces, SQL, file paths, secrets go to server logs only — never to clients
- 404s use the same envelope with a request id.

## Logging — IMPLEMENTED

Structured JSON logs (pino): timestamp, level, request id, HTTP method, path,
status, duration. Redaction list strips passwords/tokens/cookies/DB URLs.
Query strings are not logged. Sensitive user data is never logged.

## Request ID — IMPLEMENTED

Every request gets `req_...` id (client-supplied valid ids are propagated),
returned via `X-Request-Id` and included in logs and error responses.

## Database access — IMPLEMENTED (foundation)

- Prisma singleton; one client per process.
- Browser never reaches MySQL: React → API → Prisma → MySQL only.
- Health endpoints expose only up/down status — never connection details.

## API surface — IMPLEMENTED

- All endpoints versioned under `/api/v1/`.
- Standard envelopes for success and errors.

## Frontend security principles — IMPLEMENTED (foundations)

- Single Axios client with timeout, credential setting, 401 broadcasting
  (session-expired event), 403 handling, and safe error normalization
  (`ApiRequestError`). Users never see raw internals.
- No `dangerouslySetInnerHTML` / unsafe HTML rendering anywhere.
- Error boundary, loading states, Unauthorized and Not Found pages.
- No fake authentication, no mock business data.

## Future phases must implement (contract)

1. Secure login/logout/session expiration; Argon2id password hashing.
2. Role-based API authorization incl. Admin→Executor scope.
3. CSRF protection (double-submit token) together with cookies.
4. Transactional + concurrency-safe inventory updates; audit logs.
5. Admin-only alerts & alarms (no client-side security decisions).
6. Keep: validation on every endpoint, rate limits, headers, sanitized errors.
