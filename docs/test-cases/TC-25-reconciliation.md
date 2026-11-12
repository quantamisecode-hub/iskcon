# TC-25 — Reconciliation & §39 Material Summary (unreturned = issued − accepted returned)

**Repo surface:** `GET /events/:id/material-summary` (§39 summary endpoint,
admin-only semantics via scope), consumed by EventDetailPage's Material Summary
table. Service computes per item:
- `plannedQuantity` — committed EventMaterial lines
- `requestedQuantity` — union of request items (INITIAL + ADDITIONAL)
- `approvedQuantity`, `issuedQuantity` — from request items
- `returnedQuantity` — sum of return items of returns with status in
  `ACCEPTED, PARTIALLY_ACCEPTED, COMPLETED` (event.service.ts lines 707–709)
- lifecycle chip `RETURN_RECONCILIATION_PENDING` when issued > accepted-returned.

**Master invariant:** for every (event, item):
`unreturned == issued − acceptedReturned`, and
`acceptedReturned ≤ issued` always; `issued ≤ approved ≤ requested`.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-REC-001 | §39 numbers match DB arithmetic exactly | P0 | DATABASE | ADMIN |

**Preconditions:** event with planned/requested/approved/issued/returned history
(use EVT-2026-000003 `Iskcon Mela` + a fresh instrumented event).
**Steps:** call the summary endpoint; independently recompute each figure with
direct Prisma/SQL queries; diff.
**Expected:** every column identical to DB truth (zero tolerance); totals row =
column sums; unit labels match the item's unit; no stale-cache discrepancies.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REC-002 | Unreturned chip: RETURN_RECONCILIATION_PENDING appears iff issued > returned | P0 | FUNCTIONAL |

**Test data:** issue 40, accept return 15 → unreturned 25 > 0 → chip shown; then
accept return 25 more → chip clears.
**Expected:** chip state flips exactly at the boundary; the summary never shows a
negative unreturned figure.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REC-003 | Pending/REJECTED returns never counted as returned | P0 | DATABASE |

**Test data:** create a pending return (15) and a rejected return (10).
**Expected:** returnedQuantity unchanged; eligible-return math (TC-RET-003) also
ignores them; only ACCEPTED/PARTIALLY_ACCEPTED/COMPLETED rows count.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REC-004 | Ledger == inventory invariant across the full lifecycle | P0 | DATABASE |

**Steps:** script the lifecycle stock-in → issue → return-accept on one item;
after every step compare `Inventory.currentQuantity` with ledger running balance.
**Expected:** equal after EVERY step (10/10 checkpoints); any drift is a BUG.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/invariants.test.ts` + `partial-issue.test.ts`
**Evidence:** stock-in 100 → issue 40 → accept 15: stock verified after every step (100 → 60 → 75); ledger running balance recomputed per row; final 75 == inventory == ledger sum. Parallel-issue suite additionally asserts inventory == ledger sum after every partial issue.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REC-005 | ADDITIONAL requests included in reconciliation | P0 | INTEGRATION |

**Expected:** issued qty of ADDITIONAL requests counts toward issued/unreturned
alongside INITIAL requests; parent/child double-count impossible (each ledger
row counted once by referenceType).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-REC-006 | Reconciliation unaffected by event cancellation | P0 | INTEGRATION |

**Expected:** after cancel(), the §39 summary keeps all issued/returned history
(never reset); pendingIssue for zero-issued rows = 0; cancelled-event numbers
match pre-cancellation values byte-for-byte.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-REC-007 | Summary scoped: executor cannot fetch another admin's summary | P0 | AUTHORIZATION |

**Expected:** 403/404 per scope contract; admin gets own events only.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-REC-008 | UI §39 table renders endpoint truth with zero console errors | P1 | E2E |

**Expected:** EventDetailPage Material Summary table matches endpoint payload
field-for-field (live-verified 2026-11-11 after stale-transform fix); render
issues were Vite-transform bugs, not logic bugs — regression watch.
**Status:** PASS (live check) · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-REC-009 | Over-return impossible end-to-end (integration sweep) | P0 | DATABASE |

**Steps:** randomize sequences: issue k times, create returns r times with
various quantities (property-style test, 20 seeds).
**Expected:** invariant `returned ≤ issued` holds in every seed; any 500 or
negative quantity = BUG; ledger == inventory at every checkpoint.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED (build into `invariants.test.ts`)

| ID | Feature | Priority | Type |
|---|---|---|
| TC-REC-010 | Rounding/decimal units: quantities exact at every step | P1 | BOUNDARY |

**Test data:** item with decimal-friendly unit; partial issues 0.5/0.25 steps.
**Expected:** no float drift (int columns/decimal config); sums exact.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-25 roll-up
Cases: 10 · P0: 8 · Automated: 1 (`invariants.test.ts`) — TC-REC-004 PASS;
TC-REC-009 (property-style sweep) is the remaining certification-grade suite to build.
