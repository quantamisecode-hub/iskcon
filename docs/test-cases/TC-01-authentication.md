# TC-01 — Authentication

**Repo surface inspected:** `backend/src/routes/auth.routes.ts` —
`POST /auth/login` (authLimiter), `POST /auth/logout`, `GET /auth/me`,
`PATCH /auth/profile`, `POST /auth/change-password` (authLimiter),
`POST /auth/avatar`. Sessions are DB rows (`Session` model, hashed token) read
from an HttpOnly cookie; no logout-all endpoint exists (documented gap, TC-05).

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-AUTH-001 | Valid login (ADMIN) | P0 | FUNCTIONAL | ADMIN |
| TC-AUTH-002 | Valid login (EXECUTOR) | P0 | FUNCTIONAL | EXECUTOR |

**Preconditions:** active user exists in dev DB (admin: `vishnu@iskcon.com`;
executor: `qa-phase7@dev.local`).
**Steps:** `POST /auth/login` with correct credentials → inspect `Set-Cookie`,
then `GET /auth/me` with the cookie.
**Expected:** 200; cookie is `HttpOnly`, `SameSite` (no JS-readable token);
`/me` returns id/firstName/lastName/email/role/avatar and contains **no**
`passwordHash`, token, or session token; both roles can hold sessions
simultaneously.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED (add to auth-rbac suite)

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-AUTH-003 | Wrong password | P0 | NEGATIVE |
| TC-AUTH-004 | Unknown email | P0 | NEGATIVE |

**Steps:** `POST /auth/login` with (a) valid email + wrong password, (b) unknown email + any password.
**Expected:** 401 `INVALID_CREDENTIALS` with the **same generic message** in both cases (no user enumeration); no cookie set; response time not meaningfully shorter for unknown users.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/auth-negative.test.ts`
**Evidence:** wrong password and unknown email → identical status 401, code `INVALID_CREDENTIALS`, identical message "Invalid email or password."; no Set-Cookie in either; message contains no "not found"/"inactive" hints.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-AUTH-005 | Empty email / empty password | P0 | NEGATIVE |
| TC-AUTH-006 | Malformed email | P1 | NEGATIVE |
| TC-AUTH-007 | Unknown/extra fields | P1 | NEGATIVE |

**Test data:** `{}`; `{email:"",password:""}`; `email:"not-an-email"`;
`{email:"a@b.co",password:"x",remember:"true"}` (loginSchema is `.strict()`).
**Expected:** 400 `VALIDATION_ERROR`; no session created; validation runs
BEFORE the credential check (no partial auth side effects).
**Status:** PASS (2026-11-11) · Automation: `backend/tests/auth-negative.test.ts`
**Evidence:** `{}`, empty email/password, empty password, empty email, malformed email, extra field `remember` (strict schema) → all 400 VALIDATION_ERROR, no Set-Cookie, body never echoes the email; DB shows 0 session rows created for the target user.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-AUTH-008 | Inactive / deactivated user login | P0 | NEGATIVE |

**Preconditions:** test user created then deactivated via `PATCH /users/:id/status`.
**Expected:** 401 with the generic invalid-credentials message (login treats
inactive users as unauthenticated); the user's existing sessions must be
rejected by `GET /auth/me` (session middleware re-checks `user.isActive`).
**Status:** PASS (2026-11-11) · Automation: `backend/tests/auth-negative.test.ts`
**Evidence:** admin deactivates executor via `PATCH /users/:id/status`; re-login → 401 `INVALID_CREDENTIALS` "Invalid email or password." (identical to unknown-user message); the pre-deactivation session cookie then 401s on `/auth/me`.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-AUTH-009 | Brute-force rate limiting on /auth/login | P0 | SECURITY |

**Test data:** 11 failed logins within 15 min from one client (auth window: 10/15 min).
**Expected:** attempt #11 → 429 `RATE_LIMITED`; the limiter keys per IP+identity
per `rateLimit.middleware.js`; successful login before the limit is NOT blocked;
after window expiry login works again.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED (limiter is shared state; requires isolated window or per-test reset)

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-AUTH-010 | Logout revokes the session | P0 | FUNCTIONAL |
| TC-AUTH-011 | Logout of one tab keeps other tabs' other sessions | P2 | FUNCTIONAL |

**Steps:** login → `POST /auth/logout` → `GET /auth/me` with the same cookie.
**Expected:** logout 200 and clears the cookie; subsequent `/me` → 401
`UNAUTHORIZED` (session row deleted/invalidated — hash lookup fails); other
concurrent sessions of the same user stay valid (logout revokes only the
current session).
**Status:** PASS (2026-11-11, single-session core) · Automation: `backend/tests/auth-negative.test.ts`
**Evidence:** logout 200 → `/me` 401 `UNAUTHORIZED`; DB shows the session row soft-revoked (`revokedAt` set — `findValidByTokenHash` rejects revoked rows). Multi-session independence (TC-AUTH-011/016) remains manual/expansion.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-AUTH-012 | Direct protected URL while logged out | P0 | RECOVERY |

**Steps:** clear cookies → open `/events`, `/requests`, `/returns`, `/users` directly.
**Expected:** SPA redirects to `/login` (ProtectedRoute); no data flash (no
fetch leaks); API calls with no cookie return 401.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-AUTH-013 | Forged / expired / revoked session cookie | P0 | SECURITY |

**Test data:** `session=<random token>`; cookie from a logged-out session;
cookie whose session row was deleted.
**Expected:** 401 `UNAUTHORIZED`; the token is only accepted after a hash lookup
against `Session` (raw token is never stored — verify schema: `tokenHash`).
**Status:** PASS (2026-11-11) · Automation: `backend/tests/auth-negative.test.ts`
**Evidence:** forged `fis_session=<random>` → 401 `UNAUTHORIZED` "Authentication required."; a REAL session whose row is deleted server-side → 401 on the same cookie.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-AUTH-014 | Sessions survive a server restart | P1 | RECOVERY |

**Expected:** after backend restart, `GET /auth/me` still returns 200 (sessions
live in the DB, never in memory); socket reconnects and resumes the same room.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-AUTH-015 | No sensitive data in any auth response | P0 | SECURITY |

**Expected:** login/logout/me/profile/change-password/avatar responses contain
no `passwordHash`, session token, or other user's data; error responses never
echo passwords; logs (pino) redact password/token/cookie fields.
**Status:** PASS (2026-11-11, response-body scan) · Automation: `backend/tests/auth-negative.test.ts`
**Evidence:** login/me/failure bodies contain no `passwordHash`, no `tokenHash`, no raw token, and never echo the submitted password; executor `/me` leaks no other user's email. Log-redaction half remains a code-review item.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-AUTH-016 | Concurrent independent sessions | P1 | INTEGRATION |

**Expected:** two logins create two independent `Session` rows; revoking one
does not affect the other; unread-count badge works on both tabs.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-AUTH-017 | Login response cache-busting | P2 | SECURITY |

**Expected:** no-store / no-cache headers on auth responses; browser back
button after logout never renders a logged-in state from cache.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-01 roll-up

- Cases: 17 · P0: 9 · Automated today: 6 full + 1 core (auth-negative.test.ts,
  11 tests PASS): AUTH-003/004/005-007/008/010/013/015 PASS; AUTH-001/002 core
  covered by every suite's login helper (full flag audit manual).
- Known gaps remaining: brute-force limiter test (TC-AUTH-009 — test env raises
  the limit by design; needs a dedicated limiter-process run), multi-session
  independence (011/016), restart survival (014), cache headers (017), E2E (012).
