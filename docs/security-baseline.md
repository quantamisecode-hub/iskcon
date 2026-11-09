# Security Baseline — Food Inventory System

**Status legend:** `IMPLEMENTED` = active today. `PLANNED` = architecture ready, ships soon.

---

## Authentication — IMPLEMENTED (Phase 2)

- `POST /api/v1/auth/login`: Zod-validated credentials, active-user check,
  Argon2id verification, session creation, HttpOnly cookie, `lastLoginAt`, audit.
  Single generic failure message ("Invalid email or password.") — never reveals
  which part failed; failure reasons are recorded server-side in the audit log.
- `POST /api/v1/auth/logout`: revokes the session row, clears the cookie, audited.
  A stolen token used AFTER logout is rejected (revocation check).
- `GET /api/v1/auth/me`: returns the safe profile (id, name, email, role, isActive).
- Password hashing (Argon2id, OWASP m=19 MiB/t=2/p=1) — IMPLEMENTED.
  Password policy: min 8 chars + complexity, common-password denylist — IMPLEMENTED.
  Plaintext passwords are never stored, logged, or returned — IMPLEMENTED.

## Session architecture — IMPLEMENTED

- Token: 256-bit random value; DB stores ONLY its SHA-256 hash.
- Cookie `fis_session`: HttpOnly, SameSite (lax default), Secure in production
  (`COOKIE_SECURE`), maxAge `SESSION_EXPIRES_DAYS` (default 7).
- Multiple concurrent sessions supported (per-device rows).
- A server-side signing secret is intentionally NOT used: secrecy comes from
  token entropy; database leak alone does not grant valid sessions' forgery
  (hashes cannot be re-derived into new tokens) — documented design choice.
- Nothing session-related is stored in localStorage/sessionStorage.

## CSRF — IMPLEMENTED (layered), token hardening PLANNED

1. SameSite=lax cookie (default config) — browsers don't attach it on
   cross-site state-changing requests.
2. Origin/Referer validation middleware on ALL state-changing requests —
   implemented in `originValidation.middleware.ts` (evil origins → 403, tested).
3. Double-submit CSRF token — PLANNED hardening if/when the app grows beyond
   pure cookie auth. Documented, not falsely claimed.

## Authorization (RBAC) — IMPLEMENTED

- `authenticateSession` middleware resolves user from session server-side only.
- `requireRole(...roles)` enforces ADMIN / EXECUTOR (403 on mismatch).
- Role always comes from the DB; frontend-sent role fields are ignored and
  rejected (strict Zod schemas; tests prove spoof attempts fail).
- ADMIN-only surfaces: `/api/v1/users*`, `/api/v1/assignments*`.
- Frontend `ProtectedRoute` / `RoleGuard` mirror this for UX only.

## User management — IMPLEMENTED

- Admin-only create/update/status/filter/search/list endpoints.
- Guards: no self-role-change, no self-deactivation, last-active-ADMIN
  protection, duplicate email → 409, strict schemas reject unknown fields.
- Password changes are done via a future dedicated endpoint (not lumped
  into PATCH); record updates never touch `id`/`passwordHash`/timestamps.
- No hard delete of users: `isActive=false` only (history preserved).

## Assignments — IMPLEMENTED

- History-preserving model: unassign = `isActive=false` + `unassignedAt`.
- Server-side rules 1–7 (role checks, active checks, duplicate-active
  prevention via row lock in transaction, own-only management).
- `adminId` can never be injected from the client (derived from session).

## Audit logging — IMPLEMENTED

- `AuditLog` model + `auditLog.service`/repository; entries join the SAME
  transaction as the action they describe (atomic integrity).
- Audited: LOGIN, LOGIN_FAILED, LOGOUT, CREATE_USER/ADMIN/EXECUTOR,
  UPDATE_USER, ROLE_CHANGE, ACTIVATE/DEACTIVATE_USER, ASSIGN/UNASSIGN_EXECUTOR.
- Never stores: passwords, hashes, raw tokens, secrets. No log injection of
  client data beyond safe projections.

## Input validation — IMPLEMENTED

- Every endpoint covered by strict Zod schemas (login, createUser, updateUser,
  updateStatus, createAssignment, id params, list queries).
- Strict schemas reject unexpected/unknown fields (spoof attempts → 400).

## Rate limiting — IMPLEMENTED

- Global limiter on the API; strict `authLimiter` on `POST /auth/login`
  (brute-force protection); all values from environment variables.

## Errors, logging, tracing, misc (Phase 1) — IMPLEMENTED (carried forward)

Standard error envelope `{ success, error: { code, message }, requestId }`,
sanitized 500s, structured redacted pino logs, request IDs, Helmet headers,
CORS allowlist, body size limits, fail-fast env validation, Prisma singleton,
atomic `$transaction` foundation for future inventory flows.

## Environment & secrets — IMPLEMENTED

- Root/per-folder `.gitignore` excludes `.env`, keeps `.env.example` placeholders.
- Frontend env: public values only; backend secrets never leave backend/.env.
- Seed passwords only via `DEV_*` env vars (never source code).

## Frontend security — IMPLEMENTED

Single Axios client (401 broadcast + no-loop guard, 403/429-safe messaging,
network error normalization), no unsafe HTML rendering, no token storage,
session restore via `/auth/me`, guarded redirect to /login with return-to.

## ALWAYS MAINTAIN (future phases)

Keep validation-on-every-route, rate limits, headers, CSRF layers, audit
entries for every state-changing action, transactional inventory writes with
row locks, and sanitized errors. Never weaken these for convenience.
