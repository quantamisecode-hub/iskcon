# API Configuration Audit

**Project:** Event-Based Food Inventory & Material Management System
**Audit date:** 2026-11-10
**Scope:** Frontend API configuration, backend CORS/PORT configuration, environment files, deployment build.
**Behaviour change:** None. This audit documents the configuration layer only.

---

## 1. Current API client location

There is exactly **one** Axios client in the frontend:

| Item | Value |
|---|---|
| File | `frontend/src/services/api/apiClient.ts` |
| Creation | `axios.create({ baseURL, timeout, withCredentials: true })` |
| Base URL source | `appConfig.apiUrl` from `frontend/src/config/env.ts` |
| Auth transport | HttpOnly session cookie (`withCredentials: true`); no tokens in browser storage |
| Error normaliser | `toApiRequestError()` in the same file |

Feature API modules call this client through `frontend/src/constants/apiEndpoints.ts`:

- `frontend/src/features/auth/api/auth.api.ts`
- `frontend/src/features/dashboard/api/dashboard.api.ts`
- `frontend/src/features/events/api/events.api.ts`
- `frontend/src/features/inventory/api/inventory.api.ts`
- `frontend/src/features/notifications/api/notifications.api.ts`
- `frontend/src/features/requests/api/requests.api.ts`
- `frontend/src/features/users/api/users.api.ts`
- `frontend/src/services/api/health.ts`
- `frontend/src/services/realtime/socketClient.ts` (Socket.IO, shares the API origin)

No component calls `axios(...)`, `axios.create(...)` or `fetch(...)` directly for API traffic.

---

## 2. Base URL before this change

`frontend/src/config/env.ts` read:

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api';
```

Endpoint constants contained the version segment (`/v1/health`, `/v1/events`, ...), so the
effective URL was `http://localhost:5000/api/v1/...`.

Problems found:

1. The variable name did not match the documented deployment contract (`VITE_API_URL`).
2. A hard-coded `http://localhost:5000/api` fallback shipped in **every** production build.
3. `socketClient.ts` contained a second hard-coded fallback, `http://localhost:5000`.
4. The `/api/v1` prefix was duplicated across endpoint constants and inline literals,
   making it easy to produce `/api/v1/api/v1/...` or `/api/v1users`.
5. `backend/start-server.bat` and two test files contained a real local MySQL password.

---

## 3. Hard-coded URLs found

### Runtime frontend code (must be fixed)

| File | Finding | Resolution |
|---|---|---|
| `frontend/src/config/env.ts` | `http://localhost:5000/api` fallback | Removed; `VITE_API_URL` is required and validated |
| `frontend/src/services/realtime/socketClient.ts` | `http://localhost:5000` fallback | Removed; derived from the validated API URL origin |
| `frontend/src/constants/apiEndpoints.ts` | 18 endpoint literals containing `/v1/...` | Converted to version-relative paths (`/health`, `/events`, ...) |
| `frontend/src/features/inventory/api/inventory.api.ts` | 9 inline `/v1/...` literals | Converted to version-relative paths |
| `frontend/src/features/auth/api/auth.api.ts` | 3 inline `/v1/...` literals | Converted to version-relative paths |

### Backend deployment/configuration (must be fixed)

| File | Finding | Resolution |
|---|---|---|
| `backend/start-server.bat` | Hard-coded MySQL URL with real password | Removed; loads `backend/.env` via existing `dotenv/config` |
| `backend/tests/global-setup.ts` | Real MySQL password in fallback URL | Removed; `FIS_TEST_DATABASE_URL` is now required |
| `backend/tests/setup-env.ts` | Real MySQL password in fallback URL | Removed; `FIS_TEST_DATABASE_URL` is now required |

### Intentionally retained

| Location | Reason |
|---|---|
| `backend/src/config/env.ts` — `DEFAULT_DEVELOPMENT_ORIGIN = 'http://localhost:5173'` | Development/test only; production requires an explicit `CORS_ORIGIN` |
| `backend/src/app.ts` — `/api/v1` mount | This is the real backend route prefix; unchanged |
| `backend/tests/*` — `/api/v1/...` request paths | Tests intentionally target the real API prefix |
| `docs/*`, comments | Documentation and accurate API references |
| `deploy/nginx.conf` — `http://127.0.0.1:5000` | Server-local reverse-proxy target on the VPS |
| `.env.example` files | Document the required public/local values |
| `frontend/index.html` — Google Fonts URLs | Third-party font assets, not API traffic |

---

## 4. Existing environment variables

### Frontend (before)

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_API_TIMEOUT_MS=15000
```

### Frontend (after)

```env
VITE_API_URL=http://localhost:5000/api/v1   # full API root, includes /api/v1
VITE_API_TIMEOUT_MS=15000
```

`VITE_API_URL` is public by definition. No secret is present in any `VITE_*` variable.

### Backend (existing, preserved)

`NODE_ENV`, `PORT`, `DATABASE_URL`, `FIS_TEST_DATABASE_URL`, `SHADOW_DATABASE_URL`,
`SESSION_COOKIE_NAME`, `SESSION_EXPIRES_DAYS`, `REQUEST_BODY_LIMIT`, `FRONTEND_URL`
(legacy), `CORS_ORIGIN` (new canonical), `COOKIE_SECURE`, `COOKIE_SAME_SITE`,
`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `LOG_LEVEL`,
`DEV_ADMIN_*`, `DEV_EXECUTOR_*`.

---

## 5. Existing backend CORS configuration

| Item | Value |
|---|---|
| File | `backend/src/config/security.ts` |
| Origin source | `env.ALLOWED_ORIGINS` (derived from `CORS_ORIGIN`, legacy `FRONTEND_URL`, or dev default) |
| Credentials | `credentials: true` |
| Wildcard | Never used |
| Methods | `GET, POST, PUT, PATCH, DELETE` |
| Allowed headers | `Content-Type`, `X-Request-Id` |
| Max age | 600 seconds |
| CSRF layer | `originValidation.middleware.ts` validates `Origin`/`Referer` on state-changing requests |
| Socket.IO CORS | `backend/src/lib/socket.ts` uses the same allowlist |

Multiple allowed origins are supported as a comma-separated `CORS_ORIGIN` value
(useful for production plus Vercel preview deployments).

---

## 6. Existing backend PORT configuration

| Item | Value |
|---|---|
| File | `backend/src/config/env.ts` |
| Schema | `PORT: z.coerce.number().int().min(1).max(65535).default(5000)` |
| Usage | `backend/src/server.ts` → `httpServer.listen(env.PORT, ...)` |
| Hosting-panel injection | Supported automatically because the process reads `process.env.PORT` |

No source file forces a fixed production port. `deploy/ecosystem.config.cjs` is an optional
VPS/PM2 example and no longer hard-codes `PORT`; hosting panels that inject `PORT` can
ignore it and use `npm start`.

---

## 7. Files requiring modification (implemented)

- `frontend/src/config/env.ts`
- `frontend/src/types/env.d.ts`
- `frontend/src/services/api/apiClient.ts`
- `frontend/src/services/realtime/socketClient.ts`
- `frontend/src/constants/apiEndpoints.ts`
- `frontend/src/features/auth/api/auth.api.ts`
- `frontend/src/features/inventory/api/inventory.api.ts`
- `frontend/.env`, `.env.development`, `.env.production`, `.env.example`
- `backend/src/config/env.ts`
- `backend/src/config/security.ts`
- `backend/src/middleware/originValidation.middleware.ts`
- `backend/src/lib/socket.ts`
- `backend/src/server.ts`
- `backend/.env`, `.env.example`
- `backend/start-server.bat`
- `backend/tests/global-setup.ts`, `backend/tests/setup-env.ts`
- `.env.production.example`
- `deploy/ecosystem.config.cjs`
- `.gitignore`, `frontend/.gitignore`, `backend/.gitignore`
- `README.md`

## 8. Files intentionally left unchanged

- `backend/prisma/schema.prisma` and all migrations
- All backend services, controllers, repositories, validators and business rules
- Authentication/session implementation and RBAC middleware
- Event, dish, inventory, material-request, notification and dashboard logic
- Frontend pages, components, hooks, styles and routing
- API response envelope and endpoint contracts
- Database models and seed logic

No UI or business behaviour was changed.
