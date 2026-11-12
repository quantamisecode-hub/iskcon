# TC-24 — Partial Returns: accept / partially accept / reject (§44–§46)

**Repo surface:** `POST /returns/:id/accept` (adminOnly,
`acceptMaterialReturnSchema` — per-item accepted quantities ≤ returned), `/:id/reject`
(adminOnly, reason mandatory). Accept is the ONLY stock-in path: atomic
transaction (row-locked inventory), `InventoryTransaction STOCK_IN` with
`referenceType=MATERIAL_RETURN`, audit `RETURN_ACCEPTED` /
`RETURN_PARTIALLY_ACCEPTED` / `INVENTORY_RETURN_POSTED`, post-commit
notifications + sockets (`material-return:accepted | partially-accepted |
rejected`). Status transitions: `PENDING_ADMIN_REVIEW → ACCEPTED |
PARTIALLY_ACCEPTED | REJECTED`. All wrapped in `transactionWithRetry` (BUG-DB-001 fix).

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-PRN-001 | Full accept: stock += returned qty exactly | P0 | DATABASE | ADMIN |

**Test data:** return of 20 KG Moong Dal; accept full 20.
**Expected:** status `ACCEPTED`; `Inventory.currentQuantity` +20 (exact, no
rounding drift); one `STOCK_IN` ledger row (qty 20, ref return id, actor admin);
audit `RETURN_ACCEPTED` + `INVENTORY_RETURN_POSTED`; executor notified
post-commit; realtime `material-return:accepted` (verified live).
**Status:** PASS (2026-11-11) · Automation: `backend/tests/invariants.test.ts` (stock/ledger core)
**Evidence:** full accept 15/15: stock 60→75 exact; exactly one ledger row, type `RETURN` (service-design equivalent of STOCK_IN per TC-15 note), qty 15, final balanceAfter 75; accept is the only stock-moving step. Audit/notification/socket assertions remain manual (socket verified live 2026-11-10).

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRN-002 | Partial accept: accepted < returned per item | P0 | FUNCTIONAL |

**Test data:** returned 20; accept 12.
**Expected:** status `PARTIALLY_ACCEPTED`; item `quantityAccepted = 12`; stock
+12 only; ledger row 12; audit `RETURN_PARTIALLY_ACCEPTED`; notification carries
the accepted quantity; remaining 8 eligible again (§45 — re-returnable).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRN-003 | Multi-item return: mixed accept/reject per line | P0 | FUNCTIONAL |

**Test data:** 2 items (10 + 15); accept 10 of item A, 0 of item B.
**Expected:** status `PARTIALLY_ACCEPTED`; per-item accepted values stored
independently; stock +10; ledger rows reflect only accepted lines; item B stays
returnable later.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRN-004 | Reject with reason → REJECTED, zero stock movement | P0 | FUNCTIONAL |

**Test data:** reason "Items damaged on inspection."
**Expected:** status `REJECTED`; inventory unchanged; no ledger row; audit
`RETURN_REJECTED`; executor notified; reason stored in timeline + notification.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/invariants.test.ts` (stock core)
**Evidence:** reject with reason → 200, status `REJECTED`, item rejectedReturnQuantity 10 / accepted 0; inventory still 50; RETURN ledger rows still 0 (DB-verified). Audit/notification/timeline assertions remain manual.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRN-005 | Accept above returned quantity rejected | P0 | NEGATIVE |

**Expected:** accept 21 of 20 → 400; no state change, no partial stock movement.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRN-006 | Accept 0 / negative / non-numeric rejected | P0 | NEGATIVE |

**Expected:** 400; row stays `PENDING_ADMIN_REVIEW`.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRN-007 | Double accept → 409; single ledger row | P0 | CONCURRENCY |

**Expected:** second accept on ACCEPTED/PARTIALLY_ACCEPTED return → 409
(non-reviewable status); stock incremented exactly once; exactly one
`RETURN_ACCEPTED`/`PARTIALLY_ACCEPTED` audit + one notification.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRN-008 | Accept vs reject race: first mover wins | P0 | CONCURRENCY |

**Expected:** parallel accept + reject on the same pending return → exactly one
succeeds, other 409; no mixed state; no orphan ledger row.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRN-009 | Executor cannot accept/reject (route + service) | P0 | AUTHORIZATION |

**Expected:** 403 on both; return row untouched; inventory untouched.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRN-010 | Cross-admin accept denied (§94 family) | P0 | AUTHORIZATION |

**Expected:** admin B accepting admin A's pending return → 403; no stock movement.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRN-011 | Accept updates eligibility arithmetic immediately | P0 | DATABASE |

**Expected:** after accept, the accepted qty is excluded from "can be returned"
on the event (TC-RET-003 math) and §39 returned total includes it (TC-25).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRN-012 | Reject reason mandatory (blank rejected) | P1 | NEGATIVE |

**Expected:** `{}` or whitespace reason → 400 "A rejection reason is required.";
row stays pending.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRN-013 | Accept on CANCELLED event's pending return still works | P0 | INTEGRATION |

**Expected:** TC-CXL-015 continuation — reconciliation continues after event
cancellation; stock-in posts normally; §39 summary of the cancelled event updates.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-24 roll-up
Cases: 13 · P0: 10 · Automated: 2 stock-path cores (`invariants.test.ts`) —
TC-PRN-001/004 PASS (DB-verified); PRN-002/003/005/006/007/008/009/010 partial-accept,
negative, concurrency and authorization variants remain to automate.
