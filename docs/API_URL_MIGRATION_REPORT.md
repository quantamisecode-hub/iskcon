# API URL Migration Report

**Project:** Event-Based Food Inventory & Material Management System
**Migration date:** 2026-11-10
**Goal:** Move the frontend API origin from a hard-coded localhost fallback to a validated
environment variable without changing the backend contract or any business logic.

---

## Headline numbers

```text
Total hard-coded API references found:        34
Total migrated:                               34
Total intentionally retained (frontend API):   0
Additional secret/config findings fixed:       3
Potential production issues remaining:         0
```

### Breakdown of the 34 migrated references

| Category | Count | Where |
|---|---:|---|
| Base-URL fallbacks | 2 | `src/config/env.ts`, `src/services/realtime/socketClient.ts` |
| Endpoint path literals containing `/v1/` | 18 | `src/constants/apiEndpoints.ts` |
| Inline inventory paths containing `/v1/` | 9 | `src/features/inventory/api/inventory.api.ts` |
| Inline auth paths containing `/v1/` | 3 | `src/features/auth/api/auth.api.ts` |
| Environment-variable declarations | 2 | `src/config/env.ts`, `src/types/env.d.ts` |

### Additional findings fixed (security/config hygiene)

| Finding | File | Fix |
|---|---|---|
| Real MySQL password in dev launcher | `backend/start-server.bat` | Removed; loads `backend/.env` |
| Real MySQL password in test fallback | `backend/tests/global-setup.ts` | Removed; `FIS_TEST_DATABASE_URL` required |
| Real MySQL password in test fallback | `backend/tests/setup-env.ts` | Removed; `FIS_TEST_DATABASE_URL` required |

### Intentionally retained references

| Reference | Count / location | Why it is safe |
|---|---|---|
| Backend route mount `/api/v1` | `backend/src/app.ts` | The real public API contract; unchanged |
| `/api/v1/...` request paths in tests | `backend/tests/auth-rbac.test.ts`, `backend/tests/events.test.ts` | Tests must exercise the real prefixed routes |
| `/api/v1` in comments and docs | `frontend/src/features/**/*.api.ts`, `backend/src/routes/*.ts`, `docs/*` | Documentation only; helpful and accurate |
| `http://localhost:5173` dev CORS default | `backend/src/config/env.ts` | Development/test only; production requires explicit `CORS_ORIGIN` |
| `http://127.0.0.1:5000` reverse proxy | `deploy/nginx.conf` | Server-local upstream on the VPS; not a browser URL |
| `http://localhost:5000/api/v1` comments | `frontend/src/config/env.ts`, `.env.example` | Examples for developers; stripped from production bundles |
| Google Fonts URLs | `frontend/index.html` | Third-party static assets, not API traffic |

---

## Repository-wide scan (after migration)

Patterns scanned: `localhost`, `127.0.0.1`, `http://`, `https://`, `baseURL`,
`VITE_API`, `axios.create`, `fetch(`, `/api/v1`.

```text
Total raw matches: 261
  localhost:       27
  127.0.0.1:        1
  http(s)://:      42
  /api/v1:        168
  VITE_API:        19
  axios.create:     1
  baseURL:          1
  fetch(:           2
```

Most matches are backend route definitions, tests, documentation, comments, or example
environment files. After migration there are **no runtime frontend API URLs or `/v1`
path literals** outside the central `VITE_API_URL` and the `API_VERSION_PATH` validation
constant.

### Production bundle check

Two builds were produced and inspected:

1. Default production build (`.env.production` placeholder):
   embedded value `https://api.YOUR_DOMAIN/api/v1`.
2. Override build (`VITE_API_URL=https://api.env-smoke.example/api/v1`):
   embedded value changed to the override, proving the bundle is environment-driven.

Search results:

```text
Embedded application API URL:     configured value only
Hard-coded http://localhost:5000: 0 occurrences
Database credentials:             0 occurrences
JWT/session secrets:              0 occurrences
```

Note: the bundled Axios and Socket.IO libraries contain internal `localhost` fallback
strings for non-browser environments. These are third-party library internals, not
application API endpoints, and are not used by the browser deployment.

---

## Potential production issues

None identified in the frontend runtime configuration.

Operational notes for deployment:

1. `VITE_API_URL` is embedded at **build time**. Changing it requires a new Vercel
   deployment.
2. The backend must receive the matching frontend origin through `CORS_ORIGIN`.
3. Cross-origin deployment (Vercel frontend + separate API host) requires
   `COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true`; same-origin deployment keeps `lax`.
4. The real domains are still placeholders (`YOUR_DOMAIN`, `YOUR_FRONTEND_DOMAIN`) and
   must be supplied through hosting-panel/Vercel environment settings.
