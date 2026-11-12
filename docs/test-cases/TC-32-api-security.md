# TC-32 — API Security (auth/CORS/rate-limit/cookies/helmet)

**Repo surface:** `app.ts`/`server.ts` middleware chain; `authLimiter` on
/login + /change-password; cookie-based sessions (HttpOnly); helmet; CORS
config; global rate limiter (verify config and record).

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-SEC-001 | All protected routes 401 without cookie | P0 | SECURITY |

**Steps:** script every router's primary endpoints unauthenticated.
**Expected:** 401 `UNAUTHORIZED` everywhere (health + login excepted); no stack traces.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/auth-negative.test.ts`
**Evidence:** 22-endpoint sweep (users/assignments/categories/units/food-items/events/dishes/calendar/dashboard/ledger/material-requests/returns/notifications/auth-me/auth-profile/auth-change-password, GET+POST where applicable) → all 401 `UNAUTHORIZED`, zero leak patterns in bodies. RECORDED EXCEPTION: `POST /auth/logout` without a cookie returns 200 (idempotent no-op, clears any stale cookie, returns no data) — safe-by-design, pinned by a dedicated test.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-SEC-002 | Cookie flags: HttpOnly, SameSite, Secure (prod) | P0 | SECURITY |

**Expected:** login Set-Cookie HttpOnly + SameSite (strict/lax per config — record); Secure flag in production config; token never in body.
**Status:** PASS (2026-11-11, test-env form) · Automation: `backend/tests/auth-negative.test.ts`
**Evidence:** Set-Cookie `fis_session=…; HttpOnly; SameSite=Lax` (COOKIE_SECURE=false in the TEST env — recorded; prod sets Secure); token never present in the login body. Helmet's always-on headers (X-Content-Type-Options nosniff + frame protection) also asserted (TC-SEC-005 partial).

| ID | Feature | Priority | Type |
|---|---|---|
| TC-SEC-003 | CORS: only allowed origins; disallowed blocked | P0 | SECURITY |

**Test data:** request with `Origin: https://evil.example` and with the legit dev origin.
**Expected:** disallowed origin gets no CORS grant (browser would block; verify response headers/403 per config — record actual).
**Status:** PASS (2026-11-11, security.test.ts) · Automation: FULL
**Evidence:** evil origin GET → server answers 200 but NO
`access-control-allow-origin` header (browser would block reads); legit
`http://localhost:5173` → exact origin echo. Evil-origin preflight → no grant,
no method echo; legit preflight → origin echo + `access-control-allow-credentials: true`. Allowlist grants per-origin, never `*` with credentials.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-SEC-004 | Auth brute-force limiter (429 + window) | P0 | SECURITY |

**Expected:** 11th failed login in window → 429 RATE_LIMITED; per TC-AUTH-009 details.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-SEC-005 | Security headers present (helmet) | P1 | SECURITY |

**Expected:** X-Content-Type-Options, X-Frame-Options/frame-ancestors,
XSS-filter/deprecated-safe equivalents, HSTS (prod) present; no accidental
`Access-Control-Allow-Origin: *` with credentials.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-SEC-006 | Error responses leak nothing | P0 | SECURITY |

**Expected:** no stack traces, no SQL, no file paths, no Prisma internals in any 4xx/5xx body (pino logs may contain them server-side only).
**Status:** PASS (2026-11-11, error-body scan) · Automation: `backend/tests/auth-negative.test.ts`
**Evidence:** every 401 sweep body and the 404 body scanned for `stack`, `node_modules`, `prisma`, Windows paths — zero matches. Server-side pino logs intentionally carry full detail (correct per design).

| ID | Feature | Priority | Type |
|---|---|---|
| TC-SEC-007 | Unknown routes → clean 404; method abuse → 404/405 | P1 | NEGATIVE |

**Expected:** `/api/v1/nonexistent` → structured 404; DELETE on read-only route → 404/405 (record); no route confusion.
**Status:** PASS (2026-11-11, both halves) · Automation: `auth-negative.test.ts` (unknown route) + `security.test.ts` (method abuse)
**Evidence:** `/api/v1/nonexistent` → structured 404 with no stack/path leakage. Method-abuse half: DELETE on routes with no delete handler (`/dashboard/summary`, `/health`, `/ledger`) → clean 404. RECORDED: `DELETE /events/:id` is a REAL guarded route (admin-or-creator, event scope) — probed on a COMPLETED event (DRAFT→PLANNING→READY→COMPLETED walk): DELETE → 409 (terminal events cannot be deleted), row still present. History guard confirmed; not a 404-probe target.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-SEC-008 | Mass-assignment via JSON bodies blocked everywhere | P0 | SECURITY |

**Expected:** strict zod schemas reject unknown fields on every validateBody route (spot-check 6 routers); no `.save(raw req.body)` patterns.
**Status:** PASS with RECORDED split (2026-11-11, security.test.ts) · Automation: FULL
**Evidence:** STRICT routers (dishes, events, material-requests — zod `.strict()`): injected `role`/`passwordHash`/`adminId` fields → 400 VALIDATION_ERROR, nothing persisted. INLINE routers (categories, units, food-items — manual validation): unknown fields are IGNORED, not rejected — 200/201 with injected `role: 'ADMIN'`, `isActive: 'banana'`, and `stock: 999` all discarded (DB: `role` never persisted, `isActive` stays boolean, NO inventory row seeded with 999 — whitelisted inputs only, no exploit found). RECORDED as a consistency/robustness gap, not a vulnerability: injected identity fields have no effect and no spoofable sink exists on those routers; the foodItem create contract (categoryName/unitSymbol, NOT ids) is now pinned by test.
## TC-32 roll-up
Cases: 8 · P0: 5 · Automated: 7 (auth-negative.test.ts 11 tests + security.test.ts 14 tests, all PASS) —
SEC-001/002/003/006/008 PASS, SEC-007 both halves PASS; SEC-004 (limiter 429) still needs a
dedicated limiter-process run (test env raises RATE_LIMIT_MAX by design); SEC-005 partial
(always-on helmet set asserted).
