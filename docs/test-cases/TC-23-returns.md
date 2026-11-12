# TC-23 — Returns: creation eligibility (§41–§46)

**Repo surface:** `POST /events/:eventId/returns` (executor-only golden rule —
creation under the event router), `GET /returns`, `GET /returns/:id`
(anyRole, service-scoped), `POST /returns/:id/accept|reject`
(adminOnly — accept is the ONLY stock-in path). Return statuses:
`PENDING_ADMIN_REVIEW → ACCEPTED | PARTIALLY_ACCEPTED | REJECTED`.
Eligibility invariant: eligible qty per item = issued (STOCK_OUT ledger across
all requests of the event for that item) − returned (return items of returns in
`ACCEPTED/PARTIALLY_ACCEPTED/COMPLETED` only — never DRAFT/PENDING/REJECTED).
§39 `RETURN_RECONCILIATION_PENDING` lifecycle chip appears when issued > accepted-returned.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-RET-001 | Executor creates return for issued material | P0 | FUNCTIONAL | EXECUTOR |

**Preconditions:** event where an item was issued 40 KG, nothing returned.
**Test data:** return items: [{itemId, quantityReturned: 20}].
**Expected:** 201; `RET-<year>-<n>` code; status `PENDING_ADMIN_REVIEW`;
timeline `SUBMITTED`; audit `RETURN_REQUESTED`; §52 notification to the event
admin post-commit; **stock unchanged until accept**; realtime
`material-return:created` reaches admin (verified live 2026-11-10).
**Status:** PARTIAL (2026-11-11) · Automation: `backend/tests/invariants.test.ts` (stock/status core)
**Evidence:** create → 201; stock unchanged through create (50 → 50, no RETURN ledger row); accept afterwards succeeds, which is only possible from `PENDING_ADMIN_REVIEW` (status guard §45). Timeline/audit/notification rows not yet asserted in automation (socket verified live 2026-11-10).

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RET-002 | ADMIN cannot create a return | P0 | AUTHORIZATION |

**Expected:** 403 (only EXECUTOR creates/submits — golden rule applies to
returns); no row; no notification.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RET-003 | Return above eligible quantity rejected (no over-return) | P0 | NEGATIVE |

**Test data:** issued 40, accepted-returned 10 → return 31+.
**Expected:** 400/409 "Only 30 KG can be returned" (per-item eligibility check);
no row created; ledger unchanged.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RET-004 | Return material never issued rejected | P0 | NEGATIVE |

**Expected:** item with zero issued quantity for the event → 400 (eligibility
0); nothing persisted. Planning-only lines are NOT returnable.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RET-005 | Pending return quantities count against eligibility | P0 | NEGATIVE |

**Expected:** a `PENDING_ADMIN_REVIEW` return's quantities reserve nothing (only
ACCEPTED/PARTIALLY_ACCEPTED/COMPLETED reduce eligible qty per materialReturn
service comment), BUT a second concurrent pending return for the same items must
be guarded against over-return at ACCEPT time — test both interpretations
against actual behavior and record it (this is a spec-clarity probe).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RET-006 | Zero / negative / non-numeric return quantity rejected | P0 | NEGATIVE |

**Expected:** 400 per validator; no row.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RET-007 | Scope: executor not assigned to the event's admin denied | P0 | AUTHORIZATION |

**Expected:** 403; foreign admin's event id unresolvable-or-403 (no data leak).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RET-008 | Returns allowed on CANCELLED events (issued material survives) | P0 | INTEGRATION |

**Expected:** creating a return on a CANCELLED event for previously issued
material succeeds (eligibility has no event-status restriction — §34 family);
verified live via EVT-2026-000011 fixture during Phase 7 verification.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED (live-verified once, record here after suite run)

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RET-009 | Return list scoped: executor sees own; admin sees own events' | P0 | AUTHORIZATION |

**Expected:** list rows filtered per actor scope; status filter
`ACCEPTED,PARTIALLY_ACCEPTED` works; foreign rows absent.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RET-010 | Return timeline immutable after creation | P1 | DATABASE |

**Expected:** timeline rows never rewritten by later accept/reject (append-only);
original quantities/notes preserved verbatim.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RET-011 | §39 summary reflects return immediately after creation? (spec probe) | P1 | INTEGRATION |

**Expected:** summary counts ONLY accepted+partially-accepted returns as
"Returned" (line 707–709 filter confirmed in event.service.ts); a pending return
shows in pendingIssue/reconciliation chips, not returned totals — verify UI chip
matches service numbers.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RET-012 | Duplicate rapid return submissions guard | P1 | CONCURRENCY |

**Expected:** two identical rapid POSTs → eligibility arithmetic makes the second
fail at creation (same qty exceeds remaining); one row only.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-23 roll-up
Cases: 12 · P0: 8 · Automated: 1 core (`invariants.test.ts`) — TC-RET-001 stock/status
core PASS; RET-002/003/004/005/006/007 (negative + RBAC sweep) remain the priority build.
