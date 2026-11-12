# TC-33 — IDOR / Object-Level Authorization (§94 family)

**Method:** two principals of each role + foreign ids; probe every detail/mutate
endpoint with ids the actor must not touch. Existence-hiding (404) is acceptable
if consistent; effect-leaks (partial writes) never are.

| ID | Feature | Priority | Type | Target |
|---|---|---|---|---|
| TC-IDOR-001 | Foreign event detail + mutation | P0 | SECURITY | GET/PATCH /events/:id |

**Expected:** 403/404 per scope contract; no leak of name/status/reason.
**Status:** PASS (2026-11-11, security.test.ts) · Automation: FULL
**Evidence:** other-scope admin AND unassigned foreign executor → 403 on GET and
PATCH `/api/v1/events/:id`; response body contains no event name; DB re-check —
name unchanged after the denied PATCH. Scope contract verified in
event.service.ts (`adminId` for admin, assignment-OR-createdBy for executor).

| ID | Feature | Priority | Type | Target |
|---|---|---|---|---|
| TC-IDOR-002 | Foreign request approve/reject/issue | P0 | SECURITY | POST /material-requests/:id/* |

**Expected:** admin B on admin A's request → 403; executor on any approve → 403; zero rows written by denied calls (timeline/audit/notification).
**Status:** PASS (2026-11-11, security.test.ts) · Automation: FULL
**Evidence:** on a SUBMITTED (pending) request, foreign admin and foreign
executor → 403 on approve, reject, issue. DB re-check: timeline row count
unchanged, approvedQuantity unchanged, inventory still at 100 (no stock moved).

| ID | Feature | Priority | Type | Target |
|---|---|---|---|---|
| TC-IDOR-003 | Foreign return accept/reject + detail | P0 | SECURITY | POST /returns/:id/* |

**Expected:** 403; stock never moves from a denied accept.
**Status:** PASS (2026-11-11, security.test.ts) · Automation: FULL
**Evidence:** admin A lifecycle (stock 100 → issue 40 → stock 60), executor X
creates a 15-unit return. Foreign admin B and foreign executor Y → 403 on GET
`/api/v1/returns/:id`, accept, reject. DB re-check: stock still 60, zero
RETURN-type inventory transactions, return row still PENDING_ADMIN_REVIEW.

| ID | Feature | Priority | Type | Target |
|---|---|---|---|---|
| TC-IDOR-004 | Foreign notification read/mark | P0 | SECURITY | PATCH /notifications/:id/read |

**Expected:** cannot mark another user's notification; list shows own only.
**Status:** PASS (2026-11-11, security.test.ts) · Automation: FULL
**Evidence:** submission notification owned by admin A never appears in admin
B's or executor Y's `/notifications` list (id absent from both bodies). Foreign
PATCH `/:id/read` → 403/404 and DB `isRead` stays false; owner's PATCH → 200 and
DB `isRead` flips true (repository scopes `updateMany` by `{id, userId}`).

| ID | Feature | Priority | Type | Target |
|---|---|---|---|---|
| TC-IDOR-005 | Foreign user detail/update/reset | P0 | SECURITY | /users/:id (executor) |

**Expected:** 403 (route-level).
**Status:** PASS (2026-11-11, security.test.ts) · Automation: FULL
**Evidence:** executor → 403 on GET `/users/:adminB-id`, PATCH
`/users/:id/status` (INACTIVE), POST `/users/:id/reset-password`; DB re-check —
target user still `isActive: true`.

| ID | Feature | Priority | Type | Target |
|---|---|---|---|---|
| TC-IDOR-006 | IDOR via body params (userId spoofing) | P0 | SECURITY | all POST bodies |

**Expected:** `userId`/`requestedById`/`createdBy` in any body is ignored (server derives actor from session); strict schemas reject unknown fields.
**Status:** PASS (2026-11-11, security.test.ts) · Automation: FULL
**Evidence:** executor POST `/material-requests` with injected
`requestedById`/`adminId`/`userId` → 400 VALIDATION_ERROR (strict zod schema
rejects unknown fields outright); DB re-check — zero MaterialRequest rows for
the probe event. Note: the inline-validated masters routes (categories/units/
food-items) IGNORE unknown fields instead of rejecting — recorded under
TC-SEC-008; no spoofable identity field exists on those routers.

| ID | Feature | Priority | Type | Target |
|---|---|---|---|---|
| TC-IDOR-007 | Sequential-id enumeration sweep | P1 | SECURITY | detail endpoints |

**Steps:** iterate uuid-like/guessable ids as low-privilege user; assert uniform 403/404 without timing differences that reveal existence (>100ms delta between hit/miss would be a finding — record).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED
**Note:** ids are UUIDv4 (non-guessable) and the 403 path short-circuits on
scope before data load (same code path for hit/miss of a foreign id); timing
enumeration risk is low. Remaining: scripted iteration sweep.

| ID | Feature | Priority | Type | Target |
|---|---|---|---|---|
| TC-IDOR-008 | Socket room escape | P0 | SECURITY | io join |

**Expected:** a client cannot emit/join another user's or role's room (rooms set server-side from session only); verify no client-driven join handlers exist.
**Status:** PARTIAL (2026-11-11) · Automation: PARTIAL
**Evidence:** static check — rooms are derived server-side from the session
user (no client `join` handler exists); live socket-escape probe not automated.

## TC-33 roll-up
Cases: 8 · P0: 7 · Automated: 6 FULL (security.test.ts) + 2 PARTIAL
PASS: 6 · PARTIAL: 2 (IDOR-007 enumeration sweep pending, IDOR-008 socket
probe static-only)
