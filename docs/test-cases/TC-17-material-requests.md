# TC-17 — Material Requests (executor-only lifecycle)

**Repo surface:** `POST /material-requests` (executorOnly), `POST /:id/submit`
(executorOnly), `POST /:id/cancel` (anyRole — service decides), `GET /` + `GET /:id`
(anyRole, scoped). Status chain: `DRAFT → PENDING_APPROVAL → (APPROVED →
ISSUED/PARTIALLY_ISSUED) / REJECTED / CANCELLED / CANCELLED_BY_EVENT`.
§104 duplicate guard: identical (event, item, qty) within 10 s rejected.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-REQ-001 | Executor creates a request from committed plan lines | P0 | FUNCTIONAL | EXECUTOR |

**Expected:** 201 with `requestCode REQ-<year>-<n>`; status `DRAFT`; quantities
> 0; items map to committed `EventMaterial` lines (dish + planned qty captured);
**stock unchanged**; NO notification yet (draft).
**Status:** NOT EXECUTED · Automation: PARTIAL — `material-request-issue.test.ts`

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REQ-002 | Submit → PENDING_APPROVAL + admin notified | P0 | FUNCTIONAL |

**Expected:** 200; status `PENDING_APPROVAL`; `submittedAt` set; timeline row
`SUBMITTED`; notification created **after commit** for the event admin
(`MATERIAL_REQUEST_SUBMITTED`); realtime `notification:new` reaches admin (verified live).
**Status:** NOT EXECUTED · Automation: PARTIAL

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REQ-003 | Only EXECUTOR can create/submit (route guard) | P0 | AUTHORIZATION |

**Expected:** admin POST/submit → 403 (executorOnly route); anonymous → 401.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REQ-004 | Invalid quantity: 0, negative, non-numeric | P0 | NEGATIVE |

**Expected:** 400 per line; nothing persisted.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REQ-005 | Unplanned / draft / foreign line rejected | P0 | NEGATIVE |

**Expected:** requesting a line that is not a committed `EventMaterial` of an
in-scope event → 400/403; draft lines excluded from selection.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REQ-006 | §104 duplicate guard (same event+item+qty within 10 s) | P1 | NEGATIVE |

**Expected:** second identical submission → 409/400 with duplicate message; race
protected by `SELECT ... FOR UPDATE` on the event row.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REQ-007 | One open request chip per event (service contract) | P1 | FUNCTIONAL |

**Expected:** second open (unsubmitted/draft or pending) request for the same
event by same executor is prevented by contract; completed/closed requests don't block.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REQ-008 | Executor cancels own open request | P1 | FUNCTIONAL |

**Expected:** status → `CANCELLED`; timeline `CANCELLED`; admin notification if
the admin had been notified; **stock unchanged**.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REQ-009 | Scope: executor sees only own + assigned-admin requests | P0 | AUTHORIZATION |

**Expected:** list + detail 403/filtered for foreign admins' requests; admin sees
own events' requests.
**Status:** NOT EXECUTED · Automation: PARTIAL — `material-request-rbac.test.ts`

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REQ-010 | Cancelled-by-event request is terminal and immutable | P0 | NEGATIVE |

**Expected:** submit/approve/issue on a `CANCELLED_BY_EVENT` request → 409;
history (timeline + items) preserved and never rewritten.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REQ-011 | Refresh/double-submit safety | P1 | RECOVERY |

**Expected:** double `POST /:id/submit` → second call 409 (already submitted);
no duplicate timeline/notification.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REQ-012 | Event CANCELLED blocks new requests with explicit message | P0 | NEGATIVE |

**Expected:** `POST /material-requests` for a cancelled event → 409 "This event
has been cancelled. Material requests can no longer be created for it."
(also verified in logs during Phase 11 runs).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-17 roll-up
Cases: 12 · P0: 7 · Automated: 3 partial
