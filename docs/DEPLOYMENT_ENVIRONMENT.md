# Deployment Environment Contract

This document describes exactly how the application expects environments to work.
The same source code runs locally and in production; only environment values change.

> **Placeholders.** `YOUR_DOMAIN` and `YOUR_FRONTEND_DOMAIN` are intentionally not
> replaced with guessed values. Supply the real domains through the hosting platform.

---

## 1. Architecture at a glance

```text
Browser
  → Vercel-hosted React SPA (built by Vite)
  → VITE_API_URL (public, embedded at build time)
  → Node.js/Express API on the hosting panel
  → Prisma
  → MySQL (hosting-panel database)
```

The backend can still serve the built SPA for the optional same-origin VPS deployment
(Nginx → PM2/Express → MySQL). Both deployment shapes use the same environment contract.

---

## 2. Frontend environment variables

Only **public** values are allowed. Anything starting with `VITE_` is embedded into the
JavaScript bundle and is readable by every visitor.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_URL` | Yes | Full API root **including** `/api/v1` |
| `VITE_API_TIMEOUT_MS` | No | Axios timeout in milliseconds (default `15000`) |

### Local frontend

`frontend/.env.development`:

```env
VITE_API_URL=http://localhost:5000/api/v1
VITE_API_TIMEOUT_MS=15000
```

### Production frontend

Configure in **Vercel → Project Settings → Environment Variables**:

```env
VITE_API_URL=https://api.YOUR_DOMAIN/api/v1
```

Or, for a preview/staging environment:

```env
VITE_API_URL=https://api-staging.YOUR_DOMAIN/api/v1
```

### Rules

- `VITE_API_URL` must be an absolute `http://` or `https://` URL.
- It must include the `/api/v1` prefix.
- Trailing slashes are normalised; do not include query strings or hashes.
- If it is missing or malformed, the app fails fast with a clear error instead of
  silently calling localhost.
- Never put `DATABASE_URL`, `DB_PASSWORD`, `JWT_SECRET`, `SESSION_SECRET`,
  `SMTP_PASSWORD`, private keys or any other secret in `VITE_*`.
- Changing a `VITE_*` value requires a **new build/deployment** (Vite embeds it).

---

## 3. Backend environment variables

Backend values are private and must be configured only on the Node.js hosting panel
(or in the VPS `backend/.env`). They are never exposed to the frontend.

| Variable | Required | Example / notes |
|---|---|---|
| `NODE_ENV` | Yes | `development` \| `test` \| `production` |
| `PORT` | Yes in production | Injected by the hosting panel; local default `5000` |
| `DATABASE_URL` | Yes | `mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| `CORS_ORIGIN` | Yes in production | `https://YOUR_FRONTEND_DOMAIN` (comma-separated list allowed) |
| `FRONTEND_URL` | No | Legacy alias; `CORS_ORIGIN` takes precedence |
| `COOKIE_SECURE` | Recommended | `true` in production (HTTPS) |
| `COOKIE_SAME_SITE` | Recommended | `lax` same-origin, `none` cross-origin |
| `SESSION_COOKIE_NAME` | No | Default `fis_session` |
| `SESSION_EXPIRES_DAYS` | No | Default `7` |
| `REQUEST_BODY_LIMIT` | No | Default `100kb` |
| `RATE_LIMIT_WINDOW_MS` | No | Default `900000` |
| `RATE_LIMIT_MAX` | No | Default `300` |
| `AUTH_RATE_LIMIT_MAX` | No | Default `10` |
| `LOG_LEVEL` | No | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` |
| `FIS_TEST_DATABASE_URL` | Tests only | Dedicated test database; never the app database |
| `SHADOW_DATABASE_URL` | Migrations only | Shadow database for `prisma migrate dev` |
| `DEV_ADMIN_*`, `DEV_EXECUTOR_*` | Local seed only | Never deploy development seed accounts |

Production validation rules:

- `CORS_ORIGIN` is **required**; the backend will not start in production without it.
- Origins must be bare `http(s)` origins (no path/query/hash).
- `COOKIE_SAME_SITE=none` requires `COOKIE_SECURE=true`; the backend refuses to start
  otherwise because browsers reject that combination.
- No wildcard CORS is possible in the existing implementation.

### Local backend

`backend/.env` (Git-ignored):

```env
NODE_ENV=development
PORT=5000
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/food_inventory"
CORS_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

### Production backend (hosting panel)

```env
NODE_ENV=production
PORT=<hosting-provider-port>
CORS_ORIGIN=https://YOUR_FRONTEND_DOMAIN
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE"
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
```

Use `COOKIE_SAME_SITE=lax` instead of `none` only when the frontend and API are served
from the **same** origin (for example the optional Nginx/PM2 deployment).

---

## 4. Health endpoints

These already exist and are unchanged:

```text
Local:       http://localhost:5000/api/v1/health
Production:  https://api.YOUR_DOMAIN/api/v1/health
```

Optional database probe:

```text
https://api.YOUR_DOMAIN/api/v1/health/db
```

---

## 5. Authentication and CORS compatibility

Authentication is unchanged: an HttpOnly session cookie (`fis_session`) issued by the
backend. The frontend Axios client always sends `withCredentials: true`.

| Deployment shape | CORS | Cookie settings |
|---|---|---|
| Same origin (Nginx serves SPA + API) | `CORS_ORIGIN=https://YOUR_DOMAIN` | `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=lax` |
| Split origin (Vercel + separate API) | `CORS_ORIGIN=https://YOUR_FRONTEND_DOMAIN` | `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=none` |

For split-origin deployment:

- Both sides must use HTTPS.
- The backend CORS allowlist must contain the exact Vercel production origin.
- Add Vercel preview domains explicitly if they need to call the API
  (comma-separated `CORS_ORIGIN`).
- The backend already validates `Origin`/`Referer` on state-changing requests.
- Do not weaken or disable CORS to "make it work".

---

## 6. Vercel frontend deployment

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` (or the platform default) |
| Environment variable | `VITE_API_URL=https://api.YOUR_DOMAIN/api/v1` |

Notes:

- The frontend is a static SPA; do not add server-side assumptions.
- Vercel SPA rewrites are handled by the Vite SPA build/hosting defaults; if a custom
  rewrite is needed, route unknown paths to `/index.html`. No API proxy is required
  because the API URL is absolute.
- Changing `VITE_API_URL` requires a redeploy.

---

## 7. Node.js hosting-panel backend deployment

| Setting | Value |
|---|---|
| Application root | `backend` |
| Node.js version | 22 LTS or the panel's supported LTS version (project currently uses Node 26 locally) |
| Install command | `npm install` |
| Build command | `npm run build` |
| Prisma client | `npx prisma generate` |
| Migrations | `npx prisma migrate deploy` |
| Start command | `npm start` → `node dist/server.js` |
| Port | Read from the panel-injected `PORT`; do not force a fixed port |
| Health check | `/api/v1/health` |

The backend does not require Docker, Redis, Firebase, Supabase or any additional
infrastructure. It requires MySQL 8 and Node.js only.

### Prisma deployment sequence

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

Never run against production:

```text
prisma migrate dev
prisma migrate reset
```

`migrate deploy` only applies committed migrations and never resets data.

---

## 8. Local development commands

```bash
# Backend (port 5000)
cd backend
npm run dev

# Frontend (port 5173)
cd frontend
npm run dev
```

Expected path:

```text
Frontend → VITE_API_URL → http://localhost:5000/api/v1 → Backend → Prisma → MySQL
```

---

## 9. What must be supplied manually later

These values are intentionally placeholders and have **not** been filled in:

- Real frontend domain (Vercel).
- Real API/backend subdomain (hosting panel).
- `VITE_API_URL` in Vercel.
- `CORS_ORIGIN`, `DATABASE_URL`, `PORT` and cookie settings on the backend host.
- DNS records and SSL certificates.
- Production MySQL database/user creation.
- First production admin account (`backend/scripts/create-admin.ts`).
