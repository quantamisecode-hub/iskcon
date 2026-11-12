# TC-19 — Material Issue (the ONLY stock-out path)

**Repo surface:** `POST /material-requests/:id/issue` (adminOnly). Issue is the
only place stock leaves inventory for a request: atomic transaction, row-locked
inventory, writes `InventoryTransaction` (`STOCK_OUT`,
`referenceType=MATERIAL_REQUEST_ISSUE`), `issuedQuantity` per item, timeline,
audit, post-commit notification + low-stock alarm (`maybeEmitStockAlert`).
Issued ≠ approved caps every call; negative stock is impossible.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-ISSUE-001 | Full issue deducts exactly the issued amount | P0 | DATABASE | ADMIN |

**Test data:** approved 40 KG, stock 100 KG; issue 40.
**Expected:** 200; item `issuedQuantity = 40`, status `ISSUED`; request status
`ISSUED`; inventory = 60; exactly one `STOCK_OUT` ledger row (qty 40, ref
request id, actor = admin, timestamp present); timeline `ISSUED`; audit; executor
notified after commit.
**Status:** NOT EXECUTED · Automation: PARTIAL — `material-request-issue.test.ts`

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ISSUE-002 | Issue above approved rejected | P0 | NEGATIVE |

**Test data:** approved 10; issue 11 (and 10.5 for Int column guards).
**Expected:** 400/409; stock/ledger unchanged; partial-free failure (no partial
writes — transaction rolled back).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ISSUE-003 | Issue above current stock rejected — never negative | P0 | DATABASE |

**Test data:** approved 40, stock 30; issue 40.
**Expected:** 400/409 with stock message; inventory stays 30; **inventory can
never go negative under any sequence** (invariant also asserted by DB tests).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ISSUE-004 | Issue on un-approved / rejected / cancelled request blocked | P0 | NEGATIVE |

**Expected:** issue on `DRAFT`, `PENDING_APPROVAL`, `REJECTED`, `CANCELLED`,
`CANCELLED_BY_EVENT` → 409; only `APPROVED`/`PARTIALLY_ISSUED` issuables.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ISSUE-005 | Duplicate issue cannot double-deduct | P0 | CONCURRENCY |

**Test data:** two rapid identical issue(10) calls on approved 10.
**Expected:** one 200, one 409; ledger exactly one row; stock −10 once.
**Status:** NOT EXECUTED · Automation: PARTIAL — `material-request-issue.test.ts` (concurrency cases)

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ISSUE-006 | Executor issue attempt → 403 + zero side effects | P0 | AUTHORIZATION |

**Expected:** 403; no timeline/audit/ledger/notification rows created by the denied call.
**Status:** NOT EXECUTED · Automation: PARTIAL — `material-request-rbac.test.ts`

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ISSUE-007 | Issue creates low-stock alarm when threshold crossed | P1 | FUNCTIONAL |

**Test data:** item with minimumStock/reorderLevel such that issue drops below reorder.
**Expected:** `LOW_STOCK`/`OUT_OF_STOCK`/`REORDER_REQUIRED` notification persisted
+ `stock:alert` emitted to role room post-commit; alarm fires per successful issue.
**Status:** NOT EXECUTED · Automation: AUTOMATED — `material-request-issue.test.ts` (2 alarm tests)

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ISSUE-008 | Ledger balance equals stock after issue | P0 | DATABASE |

**Expected:** for the item, `Inventory.currentQuantity` == ledger running
balance (stock-in − stock-out + returns) — reconciliation invariant TC-37 links here.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ISSUE-009 | Issue of foreign admin's request denied | P0 | AUTHORIZATION |

**Expected:** 403; nothing persisted.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ISSUE-010 | Actor visible in audit + ledger | P1 | DATABASE |

**Expected:** ledger row + audit row carry the issuing admin's id; no "unknown"
actor rows; historical records never rewritten by later issues.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-19 roll-up
Cases: 10 · P0: 8 · Automated: 3 (1 dedicated alarm suite)
