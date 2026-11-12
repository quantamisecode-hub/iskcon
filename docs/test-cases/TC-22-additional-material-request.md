# TC-22 — Additional Material Request (§35–§37)

**Repo surface:** `POST /events/:id/material-requests/additional` (executor-only —
creation under the event router; the executor-only golden rule applies to the
service as well). Creates a NEW `MaterialRequest` row with
`requestType = 'ADDITIONAL'` and `parentRequestId` link; only lines that are committed `EventMaterial` rows of
the event AND not fully satisfied by previous requests are selectable. Audit
`REQUEST_ADDITIONAL_CREATED`; §52 notification `REQUEST_ADDITIONAL_CREATED` → the
event's Admin, emitted post-commit. Approve/reject/issue reuse the normal
lifecycle with ADDITIONAL-specific audit action names and notification types
(`REQUEST_ADDITIONAL_APPROVED/_REJECTED/_ISSUED/_PARTIALLY_ISSUED`).

**Golden rule:** additional requests follow the exact same stage-gate chain —
executor creates, admin approves/issues; approval never deducts stock.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-ADD-001 | Executor creates ADDITIONAL request from unmet committed lines | P0 | FUNCTIONAL | EXECUTOR |

**Preconditions:** event with committed plan lines already covered by an earlier
request (or new lines added after the initial request).
**Expected:** 201; new row with `requestCode REQ-<year>-<n>`,
`requestType = 'ADDITIONAL'`, `parentRequestId` set; items reference the
selected committed lines; status `DRAFT`; **stock unchanged**; audit
`REQUEST_ADDITIONAL_CREATED`; §52 notification to the event admin post-commit.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ADD-002 | ADMIN cannot create an additional request | P0 | AUTHORIZATION |

**Expected:** 403 (route guard + service check); no row; no notification.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ADD-003 | parentRequestId linkage visible in list + detail | P1 | FUNCTIONAL |

**Expected:** detail shows the additional request linked to its parent initial
request; the parent's request history is untouched (never rewritten); both rows
keep their own independent timelines.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ADD-004 | Only committed (non-draft) lines selectable | P0 | NEGATIVE |

**Expected:** a parked `isDraft: true` EventMaterial line cannot be added to an
additional request (400); foreign-admin event lines → 400/403.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ADD-005 | §52 notification: event admin receives, actor executor does not | P0 | INTEGRATION |

**Expected:** `REQUEST_ADDITIONAL_CREATED` (category EVENT, priority NORMAL,
referenceType EVENT deep link); the creating executor receives nothing for the
creation itself.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ADD-006 | Approve → REQUEST_ADDITIONAL_APPROVED, stock untouched | P0 | DATABASE |

**Expected:** admin approves the ADDITIONAL request → status `APPROVED`, audit
`REQUEST_ADDITIONAL_APPROVED`, notification `REQUEST_ADDITIONAL_APPROVED` to
executor; `Inventory.currentQuantity` unchanged; zero ledger rows.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ADD-007 | Issue of ADDITIONAL request moves stock exactly once | P0 | DATABASE |

**Expected:** `STOCK_OUT` ledger row with reference to the ADDITIONAL request;
audit uses `MATERIAL_ISSUED` (ADDITIONAL variant per auditActions.ts §91);
issued totals aggregate correctly into §39 summary (both requests counted).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ADD-008 | Reject reason stored; REQUEST_ADDITIONAL_REJECTED notified | P1 | FUNCTIONAL |

**Expected:** status `REJECTED`; items `REJECTED` with rejectedQuantity = requested;
timeline + audit with `requestType: 'ADDITIONAL'`; executor notified.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ADD-009 | Event cancellation cascades zero-issued ADDITIONAL request too | P0 | INTEGRATION |

**Expected:** an ADDITIONAL request in PENDING_APPROVAL/APPROVED (zero issued) is
cascaded to `CANCELLED_BY_EVENT` by cancel() exactly like an INITIAL request;
issued ADDITIONAL requests are left untouched.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ADD-010 | CANCELLED event blocks additional-request creation | P0 | NEGATIVE |

**Expected:** `POST /events/:id/material-requests/additional` on a CANCELLED
event → 409 with the cancelled-event message; nothing persisted.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ADD-011 | Empty / zero-quantity item list rejected | P1 | NEGATIVE |

**Expected:** 400; no request row; no notification.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ADD-012 | Scope: executor of another admin denied | P0 | AUTHORIZATION |

**Expected:** executor assigned to admin B calling additional-create on admin A's
event → 403; nothing persisted.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-22 roll-up
Cases: 12 · P0: 8 · Automated: 0 — build automation for TC-ADD-001/002/004/006/007/009.
