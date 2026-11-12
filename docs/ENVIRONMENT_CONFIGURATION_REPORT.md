# Environment Configuration Report

**Project:** Event-Based Food Inventory & Material Management System
**Date:** 2026-11-10
**Objective:** Make the existing application deployment-ready through environment configuration
only — without changing business logic, UI, API contracts, database schema or authentication.

---

## 1. Changes made

### Frontend

| File | Change |
|---|---|
| `frontend/src/config/env.ts` | Central config now reads `VITE_API_URL` (full API root including `/api/v1`), validates it, normalises trailing slashes, and exports `appConfig.apiUrl` + `apiOrigin` |
| `frontend/src/types/env.d.ts` | Declares `VITE_API_URL` as a required typed string |
| `frontend/src/services/api/apiClient.ts` | Single Axios client now uses `appConfig.apiUrl` |
| `frontend/src/services/realtime/socketClient.ts` | Socket origin derived from the validated API URL; hard-coded localhost fallback removed |
| `frontend/src/constants/apiEndpoints.ts` | Endpoint paths converted to version-relative form (`/health`, `/events`, ...); `/api/v1` owned by the env layer |
| `frontend/src/features/auth/api/auth.api.ts` | Inline `/v1/...` literals converted to version-relative paths |
| `frontend/src/features/inventory/api/inventory.api.ts` | Inline `/v1/...` literals converted to version-relative paths |
| `frontend/.env` (Git-ignored) | Local value switched to `VITE_API_URL` |
| `frontend/.env.development` | Created — localhost API root |
| `frontend/.env.production` | Created — documented production placeholder |
| `frontend/.env.example` | Rewritten to document `VITE_API_URL` and the no-secrets rule |
| `frontend/.gitignore` | Clarified that `.env*` local overrides are ignored while public mode files are committed |

### Backend

| File | Change |
|---|---|
| `backend/src/config/env.ts` | Added `CORS_ORIGIN` (single or comma-separated list) with legacy `FRONTEND_URL` fallback; derives `ALLOWED_ORIGINS`; production requires an explicit origin; validates `SameSite=None` + `Secure`; keeps `PORT` environment-driven |
| `backend/src/config/security.ts` | CORS allowlist uses `env.ALLOWED_ORIGINS`; no wildcard |
| `backend/src/middleware/originValidation.middleware.ts` | CSRF origin check uses the full allowlist |
| `backend/src/lib/socket.ts` | Socket.IO CORS uses the same allowlist |
| `backend/src/server.ts` | Logs all allowed origins instead of one |
| `backend/.env` (Git-ignored) | `FRONTEND_URL` replaced by `CORS_ORIGIN` |
| `backend/.env.example` | Documents `CORS_ORIGIN`, legacy alias, and multi-origin support |
| `backend/.gitignore` | Clarified local-secret handling |
| `backend/start-server.bat` | Removed hard-coded MySQL URL/password; now loads `backend/.env` |
| `backend/tests/global-setup.ts` | Removed real-password fallback; requires `FIS_TEST_DATABASE_URL` |
| `backend/tests/setup-env.ts` | Removed real-password fallback; requires `FIS_TEST_DATABASE_URL`; uses `CORS_ORIGIN` |

### Root / docs

| File | Change |
|---|---|
| `.env.production.example` | Uses `CORS_ORIGIN` and documents cross-origin cookie settings |
| `.gitignore` | Clarified committed vs local-only env files |
| `README.md` | Updated frontend/backend environment-variable documentation |
| `deploy/DEPLOY.md` | Updated to `CORS_ORIGIN` |
| `deploy/ecosystem.config.cjs` | Removed hard-coded `PORT`; PM2/hosting env or `.env` supplies it |
| `docs/PHASE_6_DOCUMENTATION.md`, `docs/PRODUCTION_READINESS_REPORT.md`, `docs/QA_INITIAL_AUDIT.md`, `docs/QA_TEST_ENVIRONMENT.md` | Variable-name references updated |
| `docs/API_CONFIGURATION_AUDIT.md` | **Created** — audit of existing configuration |
| `docs/API_URL_MIGRATION_REPORT.md` | **Created** — migration counts and classification |
| `docs/DEPLOYMENT_ENVIRONMENT.md` | **Created** — local/production environment contract |
| `docs/ENVIRONMENT_CONFIGURATION_REPORT.md` | **Created** — this report |

No package dependencies were added or removed. No Prisma schema or migration was changed.

> **Scope note:** sections 1–9 describe the environment-configuration task only. A later,
> separate follow-up introduced the material-request separation-of-duties rule (executor
> requests, admin approves) — see the addendum in section 10. That follow-up changed no
> environment behaviour, schema, API contract or dependency.

---

## 2. Files intentionally untouched

At the time of the environment task:

- `backend/prisma/schema.prisma` and every migration
- All backend services, controllers, repositories, validators and middleware business logic
- Authentication/session logic, RBAC rules, IDOR scoping and audit logging
- Event, dish, inventory, material-request, notification, dashboard and calendar logic
- All frontend pages, components, hooks, styles, routing and feature behaviour
- API response envelope and route contracts
- `backend/scripts/*`, seed logic and production admin script
- Existing tests' assertions (only secret fallbacks/setup variable names changed)

> **Superseded:** the material-request authorization follow-up (section 10) intentionally
> changed the material-request service, its routes, three request-related pages and added a
> test file. Every other item above remains untouched.

---

## 3. Environment variables

### Frontend (public only)

```text
VITE_API_URL          required — full API root including /api/v1
VITE_API_TIMEOUT_MS   optional — Axios timeout (default 15000)
```

### Backend (private)

```text
NODE_ENV
PORT
DATABASE_URL
CORS_ORIGIN           canonical allowlist (comma-separated supported)
FRONTEND_URL          legacy alias (optional)
COOKIE_SECURE
COOKIE_SAME_SITE
SESSION_COOKIE_NAME
SESSION_EXPIRES_DAYS
REQUEST_BODY_LIMIT
RATE_LIMIT_WINDOW_MS
RATE_LIMIT_MAX
AUTH_RATE_LIMIT_MAX
LOG_LEVEL
FIS_TEST_DATABASE_URL (tests only)
SHADOW_DATABASE_URL   (migration tooling only)
DEV_ADMIN_*, DEV_EXECUTOR_* (local seed only)
```

No backend variable is exposed to the frontend.

---

## 4. Local configuration

```env
# frontend/.env.development
VITE_API_URL=http://localhost:5000/api/v1
VITE_API_TIMEOUT_MS=15000

# backend/.env
NODE_ENV=development
PORT=5000
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/food_inventory"
CORS_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

Result:

```text
http://localhost:5173 → http://localhost:5000/api/v1 → Prisma → MySQL
```

---

## 5. Production configuration (placeholders)

```env
# Vercel → Environment Variables
VITE_API_URL=https://api.YOUR_DOMAIN/api/v1

# Backend hosting panel
NODE_ENV=production
PORT=<hosting-provider-port>
CORS_ORIGIN=https://YOUR_FRONTEND_DOMAIN
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE"
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
```

Use `COOKIE_SAME_SITE=lax` only for a same-origin deployment (Nginx serves both SPA and API).

---

## 6. API URL architecture

```text
React feature module
  → API_ENDPOINTS (version-relative path, e.g. /events)
  → apiClient (single Axios instance, withCredentials)
  → appConfig.apiUrl
  → import.meta.env.VITE_API_URL   (validated, no trailing slash)
  → https://api.YOUR_DOMAIN/api/v1/events
  → Express router mounted at /api/v1
```

Rules enforced by `frontend/src/config/env.ts`:

- Must be present.
- Must be an absolute `http(s)` URL.
- Must include `/api/v1`.
- Trailing slashes are stripped, preventing `//` joins.
- Query strings and hashes are rejected.
- Missing/malformed values throw a clear startup error; there is no localhost fallback.

---

## 7. Security verification

| Check | Result |
|---|---|
| Secrets in `VITE_*` variables | ✅ None |
| Database credentials in frontend source/bundle | ✅ None |
| JWT/session secrets in frontend | ✅ None |
| `.env` / `.env.local` Git-ignored | ✅ Yes (root, frontend, backend) |
| `.env.example` committed with placeholders | ✅ Yes |
| Real DB password removed from `start-server.bat` | ✅ Yes |
| Real DB password removed from test setup fallbacks | ✅ Yes |
| CORS environment-driven | ✅ `CORS_ORIGIN` → `ALLOWED_ORIGINS` |
| CORS wildcard with credentials | ✅ Never used |
| Production API URL hard-coded | ✅ No |
| Unintended localhost API endpoint in production bundle | ✅ None (verified) |
| Backend production requires explicit CORS origin | ✅ Fails fast if missing |
| `SameSite=None` without `Secure` | ✅ Rejected at startup |
| Authentication mechanism preserved | ✅ HttpOnly session cookie, unchanged |
| RBAC preserved | ✅ Env task changed no role/scope logic; a later follow-up added the executor/admin separation (section 10) |
| Prisma schema/migrations preserved | ✅ No changes |

Production bundle scan (default production build):

```text
Embedded API URL:                 https://api.YOUR_DOMAIN/api/v1
Hard-coded http://localhost:5000: 0
Database credentials:             0
Session/JWT secrets:              0
```

Note: third-party Axios/Socket.IO library code contains internal `localhost` fallback
strings for non-browser environments; these are not application endpoints.

---

## 8. Validation

| Gate | Result |
|---|---|
| Frontend lint | **PASS** — 0 errors, 11 pre-existing warnings |
| Frontend build (`tsc --noEmit` + `vite build`) | **PASS** — 191 modules |
| Backend typecheck (`tsc --noEmit`) | **PASS** |
| Backend lint | **PASS** — 0 errors |
| Backend build (`tsc`) | **PASS** |
| Backend tests (vitest) | **PASS** — 32/32 at env-task time; **35/35** after the section 10 follow-up |
| Prisma schema validation | **PASS** — schema valid, unchanged |
| API configuration audit | **PASS** |
| Production localhost scan | **PASS** — 0 application API endpoints |
| Production-mode smoke (`PORT=6124`, `NODE_ENV=production`) | **PASS** — health 200, injected port honoured, allowed origin reflected, evil origin blocked |
| Local end-to-end smoke | **PASS** — login, me, dashboard, events list/calendar/create/delete, food items, units, categories, ledger, material requests, notifications, logout |
| Frontend dev server loads new env | **PASS** — Vite serves `VITE_API_URL=http://localhost:5000/api/v1` |

Additional checks:

- Backend production validation rejects a missing `CORS_ORIGIN`.
- Backend accepts multiple comma-separated origins.
- Backend rejects `COOKIE_SAME_SITE=none` with `COOKIE_SECURE=false`.
- Backend honours a hosting-provided `PORT`.
- No database schema or API contract changed; all 32 pre-existing tests remained green
  (35 total after the section 10 follow-up).

---

## 9. Remaining manual deployment steps

These were **not** performed because the real domains and hosting credentials are not
available in this environment:

1. **Frontend domain** — choose the real Vercel production domain.
2. **Backend domain** — choose the real API subdomain (for example `api.YOUR_DOMAIN`).
3. **Vercel** — set `VITE_API_URL=https://api.YOUR_DOMAIN/api/v1` and redeploy.
4. **Backend hosting panel** — set `NODE_ENV`, panel-injected `PORT`, `DATABASE_URL`,
   `CORS_ORIGIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, and rate-limit/log values.
5. **MySQL** — create the production database and restricted user; run
   `npx prisma generate` and `npx prisma migrate deploy` (never `migrate dev`/`reset`).
6. **First admin** — run `backend/scripts/create-admin.ts`; do not deploy development seeds.
7. **DNS** — point the frontend and API hostnames at Vercel / the hosting panel.
8. **SSL** — enable HTTPS on both origins. Required for secure cookies.
9. **Cross-origin cookies** — if the frontend and API are on different sites, set
   `COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true`; otherwise keep `lax`.
10. **Production smoke** — verify `/api/v1/health`, login, dashboard, events, inventory,
    material requests and notifications on the real domains.

Until these are completed, the real production domains and credentials remain
placeholders; no deployment claim is being made.

---

## 10. Addendum (2026-11-10) — material-request separation of duties

**Later follow-up, not part of the environment task.** After the environment work was
finalised, a business rule was clarified: only an **EXECUTOR** may raise a material
request, and only an **ADMIN** may approve or reject one. An admin must never be able to
create a request and then approve it themselves.

This addendum corrects the earlier statement that material-request logic was untouched.
That statement is accurate for the environment task itself; the following changes belong
to the follow-up.

### What changed

| Layer | File | Change |
|---|---|---|
| Route | `backend/src/routes/materialRequest.routes.ts` | `POST /` and `POST /:id/submit` now use `requireRole(ROLES.EXECUTOR)`; approve/reject stay ADMIN-only |
| Service | `backend/src/services/materialRequest.service.ts` | `create`/`submit` reject non-executors; `approve`/`reject` reject the requester (`requestedById === user.id`) |
| Controller | `backend/src/controllers/materialRequest.controller.ts` | Doc comment aligned with the rule |
| UI | `frontend/src/pages/EventDetailPage.tsx` | Create-request button + modal render only for non-admins |
| UI | `frontend/src/pages/RequestsPage.tsx` | Create-request shortcut hidden for admins; empty-state copy adjusted |
| UI | `frontend/src/pages/RequestDetailPage.tsx` | `canSubmit` is executor-only; `canAct` excludes self-created requests |
| Tests | `backend/tests/material-request-rbac.test.ts` | **New** — 3 integration tests for the rule |

### What did **not** change

- No environment variable, CORS, cookie or port behaviour.
- No Prisma schema or migration.
- No API response envelope, status codes for allowed paths, or route paths.
- No dependency added or removed.

### Verification after the follow-up

| Gate | Result |
|---|---|
| Backend tests (vitest) | **PASS** — 35/35 (3 files) |
| Backend typecheck / lint / build | **PASS** |
| Frontend lint | **PASS** — 0 errors, 11 pre-existing warnings |
| Frontend build | **PASS** — 191 modules |
| Prisma schema validation | **PASS** — unchanged |
| Live admin UI check | **PASS** — no create-request control on event/requests pages; no approve/reject on a self-created request |

### Historical data

The pre-existing local record `REQ-2026-000001` (raised by admin Vishnu Pratap Singh,
already `APPROVED`) is preserved as historical data. It is not deleted or rewritten, and
the new self-decision guard prevents that admin from approving or rejecting it. See
`docs/MATERIAL_REQUEST_AUTHORIZATION.md` for the authoritative rule, role matrix and
enforcement details.
