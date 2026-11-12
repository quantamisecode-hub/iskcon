# TC-02 — Authorization & RBAC

**Repo surface inspected (actual guards, not assumptions):**

| Route | Guard |
|---|---|
| `GET /users`, `POST /users`, `GET/PATCH/DELETE /users/:id`, `PATCH /users/:id/status`, `POST /users/:id/reset-password` | `userRouter.use(...adminOnly)` — ALL user management |
| `POST /material-requests`, `POST /material-requests/:id/submit` | **executorOnly** |
| `POST /material-requests/:id/approve|reject|issue` | **adminOnly** |
| `POST /material-requests/:id/cancel` | anyRole (service enforces who may cancel) |
| `POST /returns/:id/accept|reject` (materialReturn router) | **adminOnly** |
| Return creation (`POST /events/:id/returns`) | executorOnly (golden rule) |
| `POST /events/:id/cancel` | **adminOnly** |
| `GET /dashboard/summary`, `GET /events`, `GET /material-requests`, `GET /returns`, `GET /notifications`, `GET /ledger` | anyRole (service-level scoping applies) |
| Socket auth | same session cookie → `user:<id>` + `role:<ROLE>` rooms |

Golden rules under test: only EXECUTOR creates/submits (incl. additional +
returns); only ADMIN approves/rejects/issues/accepts-returns/cancels events;
**ADMIN can never approve a request they created**; frontend permissions are
UX only — the API is the boundary.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-001 | EXECUTOR blocked from all user management | P0 | AUTHORIZATION | EXECUTOR |

**Steps:** as executor (API): `GET /users`, `POST /users`, `PATCH /users/:id`,
`PATCH /users/:id/status`, `POST /users/:id/reset-password`, `DELETE /users/:id`,
`GET /assignments`, `POST /assignments`.
**Expected:** 403 `FORBIDDEN` on every call (router-level guard); no partial
effect; same result via direct HTTP with a valid session.
**Status:** NOT EXECUTED · Automation: PARTIAL — `material-request-rbac.test.ts`

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-002 | ADMIN cannot create or submit a material request | P0 | AUTHORIZATION | ADMIN |

**Steps:** as admin: `POST /material-requests` (valid body), `POST /material-requests/:id/submit`.
**Expected:** 403 `FORBIDDEN` — create/submit are executorOnly; golden rule
"only EXECUTOR creates/submits requests" is enforced at the route.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-003 | ADMIN cannot approve/reject a request they created | P0 | AUTHORIZATION | ADMIN |

**Preconditions:** a request exists where `requestedById == admin.id` (historical
seed data or direct row) — the service ban, beyond route guards.
**Expected:** `POST /material-requests/:id/approve` and `/reject` → 403
"You cannot approve a material request you created."; no timeline row; no notification.
**Status:** NOT EXECUTED · Automation: AUTOMATED — `material-request-issue.test.ts`

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-004 | EXECUTOR cannot approve / reject / issue | P0 | AUTHORIZATION | EXECUTOR |

**Expected:** 403 on `/approve`, `/reject`, `/issue`; stock NEVER moves as a
side effect of any denied call (ledger untouched, inventory row unchanged).
**Status:** NOT EXECUTED · Automation: PARTIAL — `material-request-rbac.test.ts`

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-005 | EXECUTOR cannot accept or reject a return | P0 | AUTHORIZATION | EXECUTOR |

**Expected:** 403 on `/returns/:id/accept` and `/reject`; the return
row stays `PENDING_ADMIN_REVIEW`; inventory unchanged.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-006 | EXECUTOR cannot cancel an event | P0 | AUTHORIZATION | EXECUTOR |

**Expected:** `POST /events/:id/cancel` → 403 "Only an admin can cancel an
event."; event status unchanged; no cascade, no notification.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-007 | Executor blocked in UI by DIRECT URL, enforced by API | P0 | E2E | EXECUTOR |

**Steps:** logged in as executor, open `/users`, `/assignments` directly.
**Expected:** UnauthorizedPage (frontend is UX only); the underlying API calls
return 403; no admin data is ever fetched/rendered.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-008 | Cross-admin scope isolation (ADMIN B ≠ ADMIN A's data) | P0 | AUTHORIZATION | ADMIN |

**Preconditions:** Admin A owns event/request/return; Admin B exists with own executor.
**Steps:** as Admin B: `GET /events/:aEventId`, request and return detail,
approve/issue on A's request, accept A's return.
**Expected:** 403 "You do not have permission…" / scope-specific message on all;
404 semantics preserved where the service hides existence (no data leak either way).
**Status:** NOT EXECUTED · Automation: PARTIAL — `event-material-lifecycle.test.ts`

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-009 | Executor scope = assigned admin's events + own creations only | P0 | AUTHORIZATION | EXECUTOR |

**Expected:** executor sees events of their assigned admin (and events they
created); a third admin's event → 403; list endpoints return ONLY in-scope rows
(verify row-level, not just detail-level).
**Status:** NOT EXECUTED · Automation: PARTIAL — `events.test.ts`

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-010 | No privilege escalation via user PATCH (role/status) | P0 | SECURITY | EXECUTOR |

**Steps:** executor PATCHes `/users/:self` with `{"role":"ADMIN"}` (also tries
mass-assigning `role` via `/auth/profile`).
**Expected:** `/users` route 403; `/auth/profile` 400 (strict schema rejects
unknown `role` field); no DB write.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-011 | Self-deactivation ban + admin cannot lock themselves out | P0 | NEGATIVE | ADMIN |

**Expected:** admin deactivating own account → 403 "You cannot deactivate your
own account."; last-active-admin creation of users still permitted per business rules.
**Status:** NOT EXECUTED · Automation: PARTIAL — `auth-rbac.test.ts`

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-012 | Role is server-derived, never client-trusted | P0 | SECURITY | any |

**Expected:** role checks read the session's DB user (`socket.data.role`,
`authenticateSession`), not any client header/body; sending
`X-Role: ADMIN` / body `role` changes nothing anywhere.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-013 | Unauthenticated access → 401 everywhere | P0 | SECURITY | anonymous |

**Steps:** hit every router root without cookie (incl. socket handshake).
**Expected:** 401 `UNAUTHORIZED` (socket: handshake error "Authentication
required."); no scope leak in the error body.
**Status:** NOT EXECUTED · Automation: PARTIAL — `auth-rbac.test.ts`

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-014 | Notifications are per-user only | P0 | AUTHORIZATION | any |

**Steps:** as user X: `PATCH /notifications/:yId/read` for user Y's notification;
`GET /notifications` must list only X's rows.
**Expected:** foreign notification not readable/markable (403/404); list scoped.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RBAC-015 | Dashboard/ledger scope per role | P1 | AUTHORIZATION | both |

**Expected:** dashboard summary + ledger reflect the actor's scope only
(admin: own events/stock actions; executor: assigned admin's scope) — compare
against direct DB counts for the same filter.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-02 roll-up

- Cases: 15 · P0: 13 · Automated today: 5 partial/automated
- Release gate: TC-RBAC-002/003/004/005/006/008 must all be automated before certification (§62).
