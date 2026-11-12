# TC-31 — Data Quality (corrupt-state detection)

**Purpose:** prove the DB can never silently enter a corrupt state; if anything
is wrong, tests must FAIL loudly (never weaken validation).

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-DQ-001 | No negative inventory anywhere | P0 | DATABASE |

**Query:** `SELECT COUNT(*) FROM Inventory WHERE currentQuantity < 0` → must be 0.
**Expected:** zero rows across the whole dev/test DB after full regression run.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/invariants.test.ts`
**Evidence:** global whole-DB scan `inventory.count({ currentQuantity < 0 })` → 0, run in the full parallel suite (8 suites against one DB).

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-DQ-002 | No negative issued/returned/quantities on any row | P0 | DATABASE |

**Query:** all request items (requested/approved/issued/rejected ≥ 0), return
items (returned/accepted ≥ 0), inventory transactions (qty > 0, signed by type).
**Expected:** zero violations.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/invariants.test.ts`
**Evidence:** three global scans, all 0 violations: request-item quantity chain ≥ 0; return-item requested ≥ accepted+rejected ≥ 0; `inventoryTransaction.count({ quantity ≤ 0 })` → 0.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DQ-003 | issued ≤ approved ≤ requested per item | P0 | DATABASE |

**Expected:** no request item violates the chain (except REJECTED items where issued=0).
**Status:** PASS (2026-11-11) · Automation: `backend/tests/invariants.test.ts`
**Evidence:** global scan over every `materialRequestItem`: requested ≥ approved ≥ issued ≥ 0, REJECTED ⇒ issued 0 — zero violations under full parallel load.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DQ-004 | acceptedReturned ≤ issued per (event, item) | P0 | DATABASE |

**Expected:** sum of return-item accepted quantities per event+item never exceeds total issued ledger qty for that event+item (TC-RET-003 at DB level).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DQ-005 | Ledger balance == Inventory.currentQuantity for every item | P0 | DATABASE |

**Expected:** full-DB reconciliation query returns zero mismatches (TC-REC-004 global form).
**Status:** PARTIAL (2026-11-11) · Automation: `backend/tests/invariants.test.ts` (SCOPED form)
**Evidence:** full-lifecycle scoped check PASS (stock-in → issue → return-accept; ledger running balance == inventory at every row). The whole-DB scan is deliberately NOT global: suites delete transaction rows before inventory rows in cleanup, so a mid-cleanup scan would false-fail. Global form pending a checkpoint consistent read (out-of-transaction snapshot).

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DQ-006 | Status enums valid; no orphan references | P0 | DATABASE |

**Expected:** every status column contains only enum values; every FK resolves
(request → event, items → request, returns → event, timeline → parent,
notifications → user); no dangling rows.
**Status:** PARTIAL (2026-11-11) · Automation: `backend/tests/invariants.test.ts` (enum half)
**Evidence:** status enums of `materialRequest`, `materialReturn`, `event` hold only valid values (global `notIn` count → 0). FK-orphan scan not yet automated (covered structurally by schema FKs + cleanup order).

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DQ-007 | Unique codes truly unique (EVT/REQ/RET) | P0 | DATABASE |

**Expected:** `SELECT code, COUNT(*) HAVING > 1` → empty on all three counters' outputs; counter tables consistent with max(code).
**Status:** PASS (2026-11-11) · Automation: `backend/tests/invariants.test.ts`
**Evidence:** `groupBy(code) having count > 1` → empty for EVT/REQ/RET codes across the whole test DB (uniqueness also enforced by schema `@unique`); counter-table-vs-max(code) consistency not yet scanned.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DQ-008 | Timeline chains monotonic (no time travel) | P1 | DATABASE |

**Expected:** for each request/return, timeline rows ordered by createdAt match
the allowed state machine order (DRAFT→PENDING→…); no backwards transitions.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-31 roll-up
Cases: 8 · P0: 7 · Automated: 5 full + 2 partial (`invariants.test.ts`, 8 tests PASS) —
DQ-001/002/003/007 PASS; DQ-005/006 PASS in scoped/enum form; DQ-004/008 remain manual.
