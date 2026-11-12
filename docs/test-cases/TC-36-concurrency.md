# TC-36 — Concurrency (races on the money paths)

**Repo surface:** row-locked transactions (row-lock serialize patterns),
`transactionWithRetry` (BUG-DB-001 fix — P2034 deadlock replay), unique
constraints + counters. All money paths: issue, return-accept, stock-in/out,
approve, counter allocation.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-CNC-001 | Parallel issue calls cannot over-issue | P0 | CONCURRENCY |

**Test data:** approved 50, stock 100; 6 parallel issue(15) calls.
**Expected:** exactly 3 succeed (75 issued), 3 fail 409/400; ledger rows sum to 75; stock −75; no lost update, no negative.
**Status:** PASS (2026-11-12, stock-concurrency.test.ts TEST 1/3/5/12) · Automation: FULL — 12-test stock concurrency suite covers parallel stock-in lost-update prevention, parallel stock-out overselling prevention, high-concurrency (80×) stock-in/out, mixed in/out, idempotency, transaction rollback, deadlock contention, multi-product lock scoping, and 100-round repeat with zero anomalies.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CNC-002 | Parallel return-accept cannot double stock-in | P0 | CONCURRENCY |

**Test data:** return of 20; two parallel accept(20).
**Expected:** one 200, one 409; stock +20 once; one RETURN ledger row.
**Status:** PASS (2026-11-12, return-concurrency.test.ts R2/R3) · Automation: FULL — return-concurrency.test.ts covers parallel return-accept no over-return under SERIALIZABLE isolation.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CNC-003 | Issue racing return-accept on same item | P0 | CONCURRENCY |

**Test data:** stock 10; parallel issue(10) + accept-return(20-pending).
**Expected:** both serialize safely; final state consistent (either order yields
valid arithmetic); ledger == inventory (TC-DQ-005) after both settle.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED — planned follow-up; stock-concurrency.test.ts covers stock-in/out side, return-concurrency.test.ts covers return-accept side, but the mixed race is not yet covered.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CNC-004 | Approve/reject/cancel race → single winner | P0 | CONCURRENCY |

**Expected:** parallel approve+reject (and approve+cancel-event) → exactly one
takes effect; loser 409; no mixed status; single notification.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CNC-005 | Counter allocation race (EVT/REQ/RET codes) | P0 | CONCURRENCY |

**Test data:** 10 parallel event creates.
**Expected:** 10 unique sequential codes; no duplicates, no deadlock failures
after BUG-DB-001 fix; counter row consistent.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-CNC-006 | Deadlock storms replay and succeed (BUG-DB-001 regression) | P0 | CONCURRENCY |

**Expected:** under parallel mixed-lifecycle load, P2034 → whole-transaction
replay via withDeadlockRetry; final state = intended state; no partial writes;
suites stay green across repeated runs.
**Status:** NOT EXECUTED · Automation: AUTOMATED — db-retry.test.ts (unit) + suite stability observed

| ID | Feature | Priority | Type |
|---|---|
| TC-CNC-007 | Stock-in/out parallel same item | P0 | CONCURRENCY |

**Expected:** N parallel in/out pairs → final inventory == ledger; no lost update.
**Status:** PASS (2026-11-12, stock-concurrency.test.ts TEST 5) · Automation: FULL — mixed stock-in/stock-out concurrency covered.

| ID | Feature | Priority | Type |
|---|---|
| TC-CNC-008 | Event cancel racing request submit/approve | P1 | CONCURRENCY |

**Expected:** cancel() and submit() concurrently → one wins; if cancel won,
request lands CANCELLED_BY_EVENT; if submit won (pre-lock), next stage-gate
checks see the cancellation; never a half-cascaded state.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-36 roll-up
Cases: 8 · P0: 7 · Automated: 5 — CNC-001 (stock-concurrency.test.ts), CNC-002 (return-concurrency.test.ts), CNC-006 (db-retry.test.ts + suite stability), CNC-007 (stock-concurrency.test.ts); CNC-003/004/005/008 NOT EXECUTED — planned follow-up.
