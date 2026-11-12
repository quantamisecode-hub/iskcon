# TC-38 — Performance (response-time NFRs)

**Method:** measure p50/p95 against local dev stack (backend :5000 + local MySQL).
Thresholds are the Phase 11 defaults; record measured values honestly.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRF-001 | CRUD endpoints p95 < 500 ms | P0 | PERFORMANCE |

**Endpoints:** login, /me, events list/detail, food-items list, stock summary,
requests list/detail, returns list/detail, notifications list, dashboard summary.
**Expected:** p95 < 500 ms over 50 sequential calls each (record table).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRF-002 | Money paths p95 < 800 ms (heavy txns) | P0 | PERFORMANCE |

**Endpoints:** submit, approve, issue, return-create, return-accept, event-cancel (with cascade + notifications).
**Expected:** p95 < 800 ms incl. audit + notifications (record).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-PRF-003 | List pagination under load (1k rows) | P1 | PERFORMANCE |

**Test data:** seed ≥1000 food items / ledger rows / notifications.
**Expected:** page fetch p95 < 500 ms with filters; no unbounded queries (pageSize clamped ≤100).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-PRF-004 | Concurrency throughput: 50 parallel lifecycle ops | P1 | PERFORMANCE |

**Expected:** zero deadlocks surfacing as 500 after BUG-DB-001 fix (retry absorbs);
error rate 0; suite-style assertions on final state.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-PRF-005 | Frontend bundle + lazy chunks load in < 3 s local | P2 | PERFORMANCE |

**Expected:** Vite build output sized sanely; lazy per-page chunks (App.tsx lazy imports); LCP < 3 s on localhost; no double-fetch loops.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-PRF-006 | Socket fan-out latency < 1 s | P1 | PERFORMANCE |

**Expected:** notification:new / lifecycle channels arrive < 1 s after API response on local network (live script observed sub-second — record formal measurement).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED (live-verified qualitatively)

## TC-38 roll-up
Cases: 6 · P0: 2 · Automated: 0 — write `perf-measure.mjs` against dev stack; results go into TEST_EXECUTION_REPORT.md.
