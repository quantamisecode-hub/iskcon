# QA Test Environment

Date: 2026-11-09  
All values verified by running, not inferred from `package.json` alone. Secrets are **redacted** — no passwords, hashes, tokens, or full `DATABASE_URL` are printed here.

---

## 1. Local dev environment (where tests were executed)

| Item | Value | Verified by |
|---|---|---|
| OS | Windows 11 (win32), `D:\Iskcon Software\food-inventory-system` | `env` block + paths |
| Node | v26.13.0 | `node --version` |
| npm | 11.20.0 | `npm --version` |
| Backend | Express 5.1, Prisma 6.16, MySQL (Prisma client `@prisma/client 6.16.0`), socket.io 4.8.4, zod 4.1, argon2 2.2.2 | `backend/package.json` + `npm audit` |
| Frontend | React 19.1, React Router 7.9, Vite 7.3.7, axios 1.12, socket.io-client 4.8.4, Tailwind 4.1 | `frontend/package.json` + build output |
| TypeScript | 5.9.0 (both) | build output |
| Vitest | 5.1.0, supertest 7.3 | `backend/package.json`, run 32/32 |
| MySQL | `localhost:3306`, db `food_inventory` (dev), `food_inventory_test` (vitest), `prisma_shadow_db` (migrate dev) — credentials from local `.env` (redacted) | `backend/.env` (structure only), `prisma validate` |
| Backend URL | `http://localhost:5000` (`tsx watch src/server.ts`) | dev server logs |
| Frontend URL | `http://localhost:5173` (Vite) | Vite ready logs |
| API base | `/api/v1` + health `/api/v1/health` | `curl` |
| CORS origin (dev) | `http://localhost:5173` (`CORS_ORIGIN`; legacy `FRONTEND_URL` accepted) | `backend/.env` (non-secret) + preflight test |

## 2. Production-build environment (what was actually tested)

| Item | Value |
|---|---|
| Backend | `npm run build` → `tsc -p` ✅, then `NODE_ENV=production` + `PORT=5055` + `node dist/server.js` |
| Frontend | `npm run build` → `tsc --noEmit && vite build` ✅, 191 modules, `dist/` served by Express |
| Smoke result | `GET /api/v1/health` 200 `{"status":"healthy"}`; `GET /` 200 SPA HTML; assets `Cash: no-cache`; security headers present (see §4) |
| Socket.IO | same server at `/socket.io`, initialized log confirmed |

> Dev ≠ prod: both modes were exercised separately. Production smoke on 5055 used the *built* artifact, not `tsx watch`.

## 3. Test users (controlled fixtures, created via API / direct DB where noted)

| Label | Role | Scope | Provisioning |
|---|---|---|---|
| Admin A | ADMIN | owns events/requests A | pre-existing dev admin (Vishnu) |
| Admin B | ADMIN | owns events/requests B | pre-existing dev admin (executor@dev.local, ADMIN role) |
| Executor A1 | EXECUTOR | assigned → Admin A | QA-created via `POST /users` + `POST /assignments` |
| Executor A2 | EXECUTOR | unassigned / own-events only | QA-created (assignment test) |
| Executor B1 | EXECUTOR | assigned → Admin B | QA-created |

QA users were created without hardcoding fixtures into production code. Their passwords were generated at test time and are **not recorded here**. Sessions for RBAC tests were minted directly against the `Session` table (to bypass login rate-limiter after repeated logins) — test-only, not a product feature.

Test dishes/items: seeded masters (Rice, Dal, Sabji, Halwa, Tomato/Rice etc.) + QA events (`QA Boundary …`, `QA ScopeB …`, `QA …` XSS event deleted after test). QA boundary event intentionally left in dev DB as evidence (no cleanup delete, to preserve audit trail).

## 4. Verified production configuration (5055)

**Security headers (from actual `curl -i` response):**

```text
Content-Security-Policy: default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' https: 'unsafe-inline'; upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-DNS-Prefetch-Control: off
X-Download-Options: noopen
X-Frame-Options: DENY
X-Permitted-Cross-Domain-Policies: none
X-XSS-Protection: 0
Vary: Origin
Access-Control-Allow-Credentials: true
RateLimit: "300-in-15min"; r=~295; t=~850
RateLimit-Policy: "300-in-15min"; q=300; w=900
```

**CORS:**

- Allowed origin (`http://localhost:5173`) → `Access-Control-Allow-Origin: http://localhost:5173` + preflight 204.
- Evil origin (`http://evil.example`) → **no** `Access-Control-Allow-Origin` header (browser blocks). No wildcard with credentials.
- Non-browser (no Origin) → allowed (health checks, curl).

**Rate limiting:**

- Global: `300-in-15min` (header observed).
- Login: stricter limiter — after repeated QA logins the 429 `RATE_LIMITED` fired correctly (`POST /api/v1/auth/login` → 429), proving lockout, with subsequent legitimate login succeeding outside test burst (vitest logins unaffected per-process window).

**Cookies (prod):**

- `fis_session` HttpOnly (empty `document.cookie` in browser — expected), `SameSite=Lax`, `Secure=false` in dev `.env` and must be `true` + `CORS_ORIGIN=https://…` in production (`.env.production.example` sets `COOKIE_SECURE=true`). **Release checklist item R-1.**

## 5. Build & quality gates (final run)

| Gate | Result |
|---|---|
| `backend tsc --noEmit` | ✅ clean |
| `frontend tsc --noEmit` | ✅ clean |
| `backend eslint .` | ✅ 0 errors, 0 warnings (after P2-09 fix) |
| `frontend eslint .` | ✅ 0 errors, 11 warnings (P3-01) |
| `prisma validate` | ✅ schema valid (deprecation warning only) |
| `backend build` (`tsc -p`) | ✅ |
| `frontend build` (`tsc + vite build`) | ✅ 191 modules, 1.76s (`dist/index-*.js 413kB`, gzip 131kB) |
| `vitest run` | ✅ 2 files, 32 tests passed (5.58s) |
| `npm audit` (backend) | 3 high + 7 moderate (P3-04, deferred) |

## 6. What was NOT available

- **VPS / preview deployment:** not yet provisioned (awaiting SSH/access). No `*.vercel.app` preview tested — production smoke therefore ran on local `dist/` (port 5055). Real-deployment smoke (§59 of brief) remains **pending** — tracked as release condition in `docs/PRODUCTION_READINESS_REPORT.md`.
- **Mobile devices / Safari / Firefox:** Chromium manual walk only. No device-farm results — not claimed as passed.
- **Browser automation:** no Playwright/Cypress installed — API-level automation only (see `docs/QA_AUTOMATION_REPORT.md`).
