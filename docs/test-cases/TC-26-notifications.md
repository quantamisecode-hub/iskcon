# TC-26 — Notifications & Realtime (§49 matrix + sockets + deep links)

**Repo surface:** `Notification` model (24-model schema), `GET /notifications`,
`GET /notifications/unread-count`, `PATCH /notifications/:id/read`,
`PATCH /notifications/read-all` (scoped per user). Socket layer (`lib/socket.ts`):
rooms `user:<id>` + `role:<ADMIN|EXECUTOR>`; channels `notification:new`,
`notification:unread`, `material-request:*` (6), `event:cancelled`,
`material-return:*` (4), `stock:alert`. Delivery is post-commit, retried on
deadlock (BUG-DB-001 fix), best-effort (never 500 after a successful commit).

**§49 / §50 event matrix encoded:**

| Event | Notifies | Priority | Category |
|---|---|---|---|
| EVENT_CREATED | assigned executors (minus actor) | NORMAL | EVENT |
| EVENT_READY | creator + admin + assigned executors (minus actor) | NORMAL | EVENT |
| EVENT_COMPLETED | same minus actor | NORMAL | EVENT |
| EVENT_CANCELLED | requesters ∪ creator ∪ assigned executors (minus actor) | HIGH | EVENT |
| MATERIAL_REQUEST_SUBMITTED | event admin | — | REQUEST |
| MATERIAL_REQUEST_APPROVED / PARTIALLY | executor | — | REQUEST |
| MATERIAL_REQUEST_REJECTED | executor | — | REQUEST |
| REQUEST_ADDITIONAL_CREATED | event admin | — | REQUEST |
| REQUEST_ADDITIONAL_APPROVED/_REJECTED/_ISSUED/_PARTIALLY_ISSUED | executor | — | REQUEST |
| MATERIAL_REQUEST_ISSUED / PARTIALLY_ISSUED | executor | — | REQUEST |
| MATERIAL_RETURN_SUBMITTED(=created) | event admin | — | RETURN |
| RETURN_ACCEPTED / PARTIALLY_ACCEPTED / REJECTED | executor | — | RETURN |
| LOW_STOCK / OUT_OF_STOCK / REORDER_REQUIRED | admins | — | INVENTORY |

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-NTF-001 | §49 matrix: every event produces the right notification row(s) | P0 | INTEGRATION | both |

**Steps:** drive each lifecycle event via API; dump `Notification` table; diff
against the matrix (recipients, type, priority, category, referenceType, deep link).
**Expected:** exact match; actor never notified of own action; one row per
recipient per event (no duplicates); delivered post-commit only.
**Status:** NOT EXECUTED · Automation: PARTIAL — `events.test.ts` covers 4 event rows
of this matrix; expand to the full grid in `notifications.test.ts`.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-NTF-002 | Notifications only after successful commit | P0 | INTEGRATION |

**Expected:** forced failure inside any lifecycle transaction → zero notification
rows for that attempt; on success → exactly the matrix rows. Never a 500 caused
by notification delivery after commit (deadlock retry + log-only fallback).
**Status:** NOT EXECUTED · Automation: PARTIAL — db-retry suite covers delivery failure resilience

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-NTF-003 | Unread count accuracy | P0 | FUNCTIONAL |

**Expected:** unread-count == DB count of unread rows for the actor; mark-one and
mark-all decrement correctly; count never includes other users' rows; badge
updates via `notification:unread` channel.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-NTF-004 | Deep links navigate to the right entity | P0 | FUNCTIONAL |

**Expected:** EVENT notifications → `/events/:eventId`; REQUEST →
`/requests/:requestId`; RETURN → `/returns/:returnId`; deep link works for both
roles within scope; scoped-out recipient rows must never exist.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-NTF-005 | Realtime delivery to the right rooms only | P0 | INTEGRATION |

**Expected:** socket delivery verified live 8/8 (verify-realtime.mjs,
2026-11-10): EVENT_CREATED/READY/CANCELLED → executor;
material-return:created/RETURN_* → admin; RETURN_REJECTED → executor.
Cross-room leakage (role room of the wrong role, foreign user room) = BUG.
**Status:** PASS (live 8/8; 9/9 incl. logout socket revocation on 2026-11-12) · Automation: PARTIAL — backend `npm run verify:realtime` (backend/scripts/verify-realtime.ts, manual) + events.test.ts (persistence)

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-NTF-006 | Live page refresh on socket events | P0 | E2E |

**Expected:** open EventDetailPage → cancel elsewhere → panel updates without
manual refresh (event:cancelled listener); ReturnDetailPage updates on all 4
material-return channels for its own return id only (unrelated returns ignored).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-NTF-007 | Socket auth: unauthenticated / foreign-token handshake rejected | P0 | SECURITY |

**Expected:** handshake without valid session → error "Authentication required.";
a valid session joins only its own `user:<id>` and `role:<role>` rooms.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-NTF-008 | Reconnect resumes missed state | P1 | RECOVERY |

**Expected:** after socket drop + reconnect, unread badge resyncs from REST
(`unread-count` on load); no phantom duplicates.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-NTF-009 | Low-stock alarms post-issue (role room) | P0 | INTEGRATION |

**Expected:** issue crossing minimumStock/reorderLevel → notification row +
`stock:alert` to the ADMIN role room post-commit; admin-only visibility.
**Status:** NOT EXECUTED · Automation: AUTOMATED — material-request-issue.test.ts (2 alarm tests)

| ID | Feature | Priority | Type |
|---|---|---|
| TC-NTF-010 | Notification list UI: mark read / mark all / badges | P1 | E2E |

**Expected:** NotificationsPage marks single/all read; row styling reflects
unread state; zero console errors; badge count matches list.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-NTF-011 | Event notifications survive server restart | P1 | RECOVERY |

**Expected:** rows persist (DB-backed); sockets rejoin rooms after restart
(session cookie re-auth); nothing lost or duplicated by the restart.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-NTF-012 | Test pollution control: notification cleanup between suites | P1 | REGRESSION |

**Expected:** suites that create notifications `deleteMany` in afterAll
(events.test.ts pattern) so parallel-suite runs don't cross-contaminate unread
counts; flaky-count bugs surface as FAIL, not silent drift.
**Status:** PASS · Automation: AUTOMATED — events.test.ts afterAll

## TC-26 roll-up
Cases: 12 · P0: 7 · Automated: 2 + live socket 8/8 + UI live checks.
Remaining automation: full §49 matrix test (TC-NTF-001) is the biggest gap.
