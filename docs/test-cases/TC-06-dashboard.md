# TC-06 — Dashboard (KPIs vs database truth)

**Repo surface:** `GET /dashboard/summary` (anyRole; role scoping enforced in the
service — admin sees own events/stock actions, executor sees assigned admin's
scope). Frontend: DashboardPage.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-DSH-001 | Admin summary matches DB truth | P0 | DATABASE | ADMIN |

**Steps:** call summary; independently compute expected KPIs with direct DB
queries (events by status, requests by status, items low/out, unread notifications).
**Expected:** every KPI identical; zero tolerance; totals include today's data.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-DSH-002 | Executor summary is scoped | P0 | AUTHORIZATION |

**Expected:** executor's summary counts ONLY their assigned admin's events + own
requests; foreign-admin events absent; numbers equal the scoped DB query.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DSH-003 | Empty state: fresh user / fresh DB | P2 | BOUNDARY |

**Expected:** zeros everywhere, no NaN/null leaks, no 500 on empty tables.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DSH-004 | Unauthenticated → 401 | P0 | SECURITY |

**Expected:** 401; no data.
**Status:** NOT EXECUTED · Automation: PARTIAL — auth-rbac.test.ts pattern

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DSH-005 | KPI updates after lifecycle actions | P1 | INTEGRATION |

**Steps:** submit request → approve → issue → cancel event; re-read summary each step.
**Expected:** counts move exactly as the DB does each step (never lags a commit).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DSH-006 | Dashboard UI renders + zero console errors | P2 | E2E |

**Expected:** cards render values; no React key warnings; responsive layout.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-06 roll-up
Cases: 6 · P0: 3 · Automated: 1 partial
