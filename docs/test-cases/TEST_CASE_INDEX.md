# TEST CASE INDEX — Phase 11 Test Case Repository

> Built after a full repository inspection (§3). Every file below maps to a
> module that ACTUALLY exists in the codebase (`backend/src/routes/*`,
> `frontend/src/pages/*`). Modules listed in the Phase 11 brief that do NOT
> exist in the current build are still included as files with an explicit
> **MODULE ABSENT** gap record — a missing module is a finding, not an excuse.

## Repository surface actually inspected

| Layer | Surface |
|---|---|
| Backend routers | auth (login/logout/me/profile), users, assignments, categories, units, food-items (+stock in/out), events (+dishes/materials/cancel/material-summary), event-dishes materials, dishes, calendar, dashboard, ledger, material-requests, returns (materialReturn router), notifications, health |
| Socket layer | `user:<id>` + `role:<ADMIN\|EXECUTOR>` rooms; `notification:new`, `notification:unread`, `material-request:*` (6), `event:cancelled`, `material-return:*` (4), `stock:alert` |
| Frontend pages | Login, Dashboard, Calendar, EventsList, EventNew, EventDetail, Dishes, DishDetail, Inventory, FoodItems, FoodItemDetail, Categories, Units, Ledger, Requests, RequestDetail, Returns, ReturnDetail, Notifications, Users, UserDetail, Profile + NotFound/Unauthorized |
| Persistence | 24 Prisma models (users/sessions, assignments, audit, categories, units, food items, inventory + transactions, events + dishes + materials, requests + items + timeline, notifications, returns + items + timeline, 3 code counters) |
| Automated suites | auth-rbac, events, material-request-rbac, material-request-issue, event-material-lifecycle, db-retry, **partial-issue (TC-20, 7 tests)**, **invariants (TC-31/15/25/24 cores, 8 tests)**, **auth-negative (TC-01/32 security, 11 tests)**, **security (TC-32/33/34/35 IDOR+CORS+mass-assignment+validation+XSS/SQLi, 14 tests)**, **return-concurrency (TC-36 return stock, 4 tests)**, **stock-concurrency (TC-36 stock in/out, 12 tests)** — 143 tests across 13 suites |
| Modules ABSENT in build | Inventory Intelligence (Ph-8), Operational Decision Center (Ph-9), Management Reports (Ph-10), any export/CSV endpoint, audit-log API/UI (audit rows are written to DB but never exposed) |

## File map

| File | Module | Cases | Status |
|---|---|---|---|
| TC-01-authentication.md | login / logout / session / me | | |
| TC-02-authorization-rbac.md | route guards + service scope + self-approval ban | | |
| TC-03-user-management.md | create / edit / activate / status | | |
| TC-04-admin-executor-assignment.md | assign / reassign / history / scope ties | | |
| TC-05-profile-settings.md | PATCH /auth/profile, password policy | | |
| TC-06-dashboard.md | KPIs vs database truth | | |
| TC-07-calendar.md | month range, boundaries, multi-events | | |
| TC-08-events.md | create / edit / status chain / dishes / planning | | |
| TC-09-dishes.md | dish CRUD + material mapping | | |
| TC-10-food-item-master.md | create / thresholds / active-inactive | | |
| TC-11-categories.md | create / duplicate / deactivate | | |
| TC-12-units.md | units, no silent conversion | | |
| TC-13-stock-in.md | stock in atomic + ledger + audit | | |
| TC-14-current-stock.md | stock vs ledger, filters, zero/low/out | | |
| TC-15-inventory-ledger.md | every transaction immutable + correct | | |
| TC-16-material-planning.md | planning NEVER mutates inventory | | |
| TC-17-material-requests.md | executor-only create/submit/cancel | | |
| TC-18-request-approval.md | approve/reject — approval never deducts stock | | |
| TC-19-material-issue.md | full issue — stock moves only here | | |
| TC-20-partial-issue.md | multi-step partial issue arithmetic | | |
| TC-21-event-cancellation.md | §28–§34 matrix across request states | | |
| TC-22-additional-material-request.md | ADDITIONAL request rows, §35–§37 | | |
| TC-23-returns.md | return creation eligibility §41–§46 | | |
| TC-24-partial-returns.md | accept / partially accept / reject | | |
| TC-25-reconciliation.md | unreturned = issued − accepted returned (§39) | | |
| TC-26-notifications.md | §49 matrix + realtime socket + deep links | | |
| TC-27-inventory-intelligence.md | **MODULE ABSENT** | | |
| TC-28-operational-decision-center.md | **MODULE ABSENT** | | |
| TC-29-management-reports.md | **MODULE ABSENT** | | |
| TC-30-audit-logs.md | audit rows exist; **no API/UI — gap** | | |
| TC-31-data-quality.md | detect corrupt states | | |
| TC-32-api-security.md | auth/CORS/rate-limit/cookies/helmet | 8 | SEC-001/002/003/006/007/008 PASS · SEC-004 blocked (limiter run) · SEC-005 partial |
| TC-33-idor.md | cross-scope/cross-role object access | 8 | IDOR-001…006 PASS · IDOR-007 NOT EXEC · IDOR-008 PARTIAL |
| TC-34-input-validation.md | zod contracts, boundaries | 8 | VAL-002/005/006 PASS · VAL-001/004 PARTIAL · VAL-003/007/008 NOT EXEC |
| TC-35-xss-injection.md | stored/reflected payloads | 6 | XSS-001/002/004 PASS (API + static) · XSS-003/005 NOT EXEC · XSS-006 static |
| TC-36-concurrency.md | issue/return/approval/stock races | | |
| TC-37-data-integrity.md | constraints, rollback, ledger=stock | | |
| TC-38-performance.md | response time NFRs | | |
| TC-39-accessibility.md | keyboard/ARIA/contrast | | |
| TC-40-responsive-ui.md | breakpoints | | |
| TC-41-browser-compatibility.md | engines | | |
| TC-42-export-security.md | **MODULE ABSENT** (no export exists) | | |
| TC-43-error-recovery.md | retries, rollback, no duplicates | | |
| TC-44-regression.md | bug→regression ledger | | |
| TC-45-production-readiness.md | release gates | | |
| TEST_CASE_INDEX.md | this file | | |
| TRACEABILITY_MATRIX.md | requirement → feature → case → automation → bug → fix | | |

## Standards

- **ID format:** `TC-<MODULE>-<NNN>` — IDs are never reused.
- **Every case carries:** Test Case ID, Module, Feature, Priority (P0–P3),
  Type (FUNCTIONAL/NEGATIVE/BOUNDARY/SECURITY/AUTHORIZATION/API/DATABASE/
  INTEGRATION/E2E/CONCURRENCY/PERFORMANCE/ACCESSIBILITY/RESPONSIVE/REGRESSION/
  RECOVERY), Role, Preconditions, Test Data, Steps, Expected Result, Actual
  Result, Status (NOT EXECUTED / PASS / FAIL / BLOCKED / SKIPPED / FLAKY),
  Automation Status (AUTOMATED / NOT AUTOMATED / PARTIAL — suite name),
  Bug ID, Regression Test.
- **Golden rules embedded in expectations** (test anything that violates them):
  only EXECUTOR creates/submits requests (incl. additional/returns); only ADMIN
  approves/rejects/issues/accepts-returns/cancels; ADMIN can never approve or
  issue a request they created; **approval NEVER deducts stock — only ISSUE and
  ACCEPTED RETURN move stock**; issue/return-accept are atomic and
  concurrency-safe; no negative inventory, no over-issue, no over-return;
  executor sees issued quantities + immutable timelines; notifications only
  after a successful commit; historical records are never rewritten.
- **Execution status values must be honest.** Coverage percentages in
  `TEST_EXECUTION_REPORT.md` derive from these actual statuses only.
- **Execution protocol per case:** API-first (supertest), then UI (browser)
  where the case is E2E/RESPONSIVE/ACCESSIBILITY; a case is PASS only when the
  database is also verified, never merely because the page opened.
