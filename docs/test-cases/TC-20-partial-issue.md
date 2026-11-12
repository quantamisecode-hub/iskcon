# TC-20 — Partial Issue (multi-step arithmetic)

**Repo surface:** same `POST /material-requests/:id/issue`; multiple issue calls
until `issuedQuantity == approvedQuantity` flips status to `ISSUED`;
intermediate status `PARTIALLY_ISSUED`; every call is an independent atomic
transaction with its own ledger row.

**Mission example encoded exactly:**

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-PART-001 | First partial issue 30 of 100 | P0 | DATABASE | ADMIN |

**Test data:** approved 100 KG; issue 30.
**Expected:** status `PARTIALLY_ISSUED`; item issued 30, remaining 70; inventory
−30; one STOCK_OUT row (30).
**Status:** PASS (2026-11-11) · Automation: `backend/tests/partial-issue.test.ts`
**Evidence:** status `PARTIALLY_ISSUED`; stock 500→470; one ledger row qty 30, balanceAfter 470, performedBy = admin id (DB-verified).

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PART-002 | Second issue 40 → 70 issued / 30 remaining | P0 | DATABASE |

**Expected:** issued 70; two ledger rows; inventory −70 cumulative.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/partial-issue.test.ts`
**Evidence:** stock 500→430; issued 70 / pending 30 in response AND `materialRequestItem.issuedQuantity` in DB; two ledger rows [30,40].

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PART-003 | Final issue 30 → 100 issued, status ISSUED, 0 remaining | P0 | DATABASE |

**Expected:** issued 100; three ledger rows; status `ISSUED`; further issue →
409 (nothing left to issue); stock −100 total.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/partial-issue.test.ts`
**Evidence:** status `ISSUED`; stock 400; ledger rows exactly [30,40,30], balanceAfter [470,430,400], all STOCK_OUT; extra issue → 409 CONFLICT, stock unchanged (DB-verified).

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PART-004 | Over-issue across partial calls rejected | P0 | NEGATIVE |

**Test data:** issued 70, approved 100; issue 31 (remaining is 30).
**Expected:** 400/409 "only 30 remaining"; issued stays 70; ledger unchanged.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/partial-issue.test.ts`
**Evidence:** 409 CONFLICT; DB shows issuedQuantity still 70, exactly 2 ledger rows, stock 430; the remaining 30 then issues fine (guard is per-call).

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PART-005 | Issue 0 / negative between partials rejected | P1 | NEGATIVE |

**Expected:** 400; no state change.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/partial-issue.test.ts`
**Evidence:** 0 / −10 / 12.5 → 400 VALIDATION_ERROR each; stock still 470; issuedQuantity still 30 (DB-verified).

| ID | Feature | Priority | Type |
|---|---|
| TC-PART-006 | Partial issue + concurrent partial issue race | P0 | CONCURRENCY |

**Test data:** remaining 70; two parallel issue(50) calls.
**Expected:** exactly one succeeds (or serializes to one-then-409); ledger rows
sum exactly to issued; stock never over-deducted (row-lock verified — no lost update).
**Status:** PASS (2026-11-11) · Automation: `backend/tests/partial-issue.test.ts`
**Evidence:** parallel issue(50)×2 → exactly [200,409]; issued 80 in DB; ledger rows sum == issuedQuantity; stock 420 == 500 − ledger sum.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PART-007 | Partial issue events each notify (per §49) | P1 | INTEGRATION |

**Expected:** each successful partial issue notifies the executor
(`MATERIAL_REQUEST_PARTIALLY_ISSUED` vs `MATERIAL_REQUEST_ISSUED` on the final
one) — no duplicates per call.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/partial-issue.test.ts`
**Evidence:** notifications (DB) contain PARTIALLY_ISSUED and exactly one ISSUED for the request.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PART-008 | Partially-issued request remains visible in §39 summary | P1 | INTEGRATION |

**Expected:** `issuedQuantity` aggregated across partial calls; `pendingIssueQuantity`
= approved − issued; lifecycle shows `RETURN_RECONCILIATION_PENDING` after issue.
**Status:** PASS (2026-11-11) · Automation: `backend/tests/partial-issue.test.ts`
**Evidence:** `GET /api/v1/events/:id/material-summary` — line: requested 100 / approved 100 / issued 100 / pendingIssue 0 / returnable 100; totals.issuedQuantity 100; lifecycleStatus `RETURN_RECONCILIATION_PENDING`.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PART-009 | Executor sees issued totals + immutable timeline (UI) | P1 | E2E |

**Expected:** RequestDetailPage shows issued quantities and the complete
timeline; executor has no approve/issue controls; refresh preserves data.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-20 roll-up
Cases: 9 · P0: 5 · Automated: 8 (TC-PART-001…008) · PASS: 8 — the mission's
exact 30/40/30 example is automated in `backend/tests/partial-issue.test.ts`
(7 tests) and PASSes with DB verification; TC-PART-009 (E2E UI) remains manual.
