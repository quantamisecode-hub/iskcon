# TC-18 — Request Approval (never deducts stock)

**Repo surface:** `POST /material-requests/:id/approve` + `/:id/reject`
(adminOnly). Approve sets per-item `approvedQuantity` (partial approve
supported), status `APPROVED`; reject sets `REJECTED`. Timeline + audit +
notifications (admin cannot approve own-created request — see TC-RBAC-003).
**Golden rule: approval NEVER deducts stock.**

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-APR-001 | Full approve: approved == requested, stock untouched | P0 | DATABASE | ADMIN |

**Test data:** requested 10 KG; approve 10 KG.
**Expected:** 200; status `APPROVED`; every item `approvedQuantity = requestedQuantity`;
`Inventory.currentQuantity` unchanged; **no InventoryTransaction row**; audit
`APPROVE` + timeline `APPROVED`; executor notified after commit (`MATERIAL_REQUEST_APPROVED`).
**Status:** NOT EXECUTED · Automation: PARTIAL — `material-request-issue.test.ts`

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-APR-002 | Partial approve records the reduced quantity | P0 | FUNCTIONAL |

**Test data:** requested 40 KG; approve 25 KG.
**Expected:** status `APPROVED`; item `approvedQuantity = 25`; `rejectedQuantity`
0; later issue caps at 25 (TC-ISSUE-*); timeline reflects partial approval.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-APR-003 | Reject with reason → REJECTED, nothing moves | P0 | FUNCTIONAL |

**Expected:** 200; status `REJECTED`; items `REJECTED`; no stock/ledger change;
reason stored on timeline + notification text; executor notified.
**Status:** NOT EXECUTED · Automation: PARTIAL

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-APR-004 | Approve above requested quantity rejected | P0 | NEGATIVE |

**Expected:** approve 50 of 40 → 400/409; row unchanged.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-APR-005 | Approve 0 / negative / non-numeric rejected | P0 | NEGATIVE |

**Expected:** 400; row unchanged.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-APR-006 | Approve after cancellation / rejection blocked | P0 | NEGATIVE |

**Expected:** `CANCELLED`, `CANCELLED_BY_EVENT`, `REJECTED`, `ISSUED` requests →
409 on approve; only `PENDING_APPROVAL` is approvable.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-APR-007 | Duplicate approval → 409, single notification | P0 | CONCURRENCY |

**Expected:** two rapid approve calls → one 200, one 409; exactly one timeline
row and one notification (no double-send).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-APR-008 | Cross-scope approval denied (§94 IDOR family) | P0 | AUTHORIZATION |

**Expected:** admin B approving admin A's pending request → 403; also when B
knows the id (existence hiding acceptable but no effect either way).
**Status:** NOT EXECUTED · Automation: PARTIAL — `material-request-rbac.test.ts`

| ID | Feature | Priority | Type |
|---|---|---|
| TC-APR-009 | Approval after event cancellation of a zero-issued request blocked | P0 | NEGATIVE |

**Expected:** request became `CANCELLED_BY_EVENT` by cancel() → approve → 409.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-APR-010 | Approval notification timing: never pre-commit | P0 | INTEGRATION |

**Expected:** when the approve transaction fails (forced validation failure), NO
notification row exists — notifications are created inside the committed
transaction and emitted after it returns.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-APR-011 | Immutable history after approval | P1 | DATABASE |

**Expected:** timeline rows and audit log cannot be mutated by later actions
(no UPDATE paths on timeline in code — verify); old statuses remain queryable.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-18 roll-up
Cases: 11 · P0: 9 · Automated: 3 partial
