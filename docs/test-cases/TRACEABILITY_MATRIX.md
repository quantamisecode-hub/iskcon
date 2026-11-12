# TRACEABILITY MATRIX — requirement → feature → cases → automation → bugs → fixes

> Built from the ACTUAL repository surface (§3 inspection). Every requirement
> area of the Phase 11 brief maps to concrete case IDs; automation names real
> suites; bugs reference the TC-44 ledger. Absent modules are traced explicitly.

## A. Golden-rule charter (the five invariants)

| # | Requirement / golden rule | Feature surface | Cases | Automation | Bug → Fix |
|---|---|---|---|---|---|
| A1 | Only EXECUTOR creates/submits requests (incl. additional + returns) | route guards `executorOnly`; service checks | TC-RBAC-002, TC-REQ-003, TC-ADD-002, TC-RET-002 | material-request-rbac.test.ts (partial); expansion pending | — |
| A2 | Only ADMIN approves/rejects/issues/accepts-returns/cancels | route guards `adminOnly` on approve/reject/issue/accept/reject/cancel | TC-RBAC-004/005/006, TC-CXL-002, TC-PRN-009 | partial (rbac + lifecycle suites) | — |
| A3 | ADMIN can never approve a request they created | service ban in approve()/reject() | TC-RBAC-003 | AUTOMATED — material-request-issue.test.ts | — |
| A4 | Approval NEVER deducts stock — only ISSUE and ACCEPTED RETURN move stock | issue() + return accept() are the only STOCK_OUT/RETURN writers | TC-APR-001/003, TC-ISSUE-001, TC-PRN-001, TC-CXL-009 | PARTIAL — accept-side core AUTOMATED in invariants.test.ts (create/reject never move stock; only accept restocks) | — |
| A5 | Issue/return-accept atomic + concurrency-safe; no negative inventory; no over-issue/over-return | row-locked transactions + eligibility arithmetic | TC-ISSUE-002/003/005, TC-PART-004/006, TC-RET-003, TC-PRN-005/007, TC-CNC-001/002, TC-DQ-001/003/004 | stock-concurrency.test.ts (12 tests PASS) + return-concurrency.test.ts (4 tests PASS) + TC-DQ-001/003 global scans in invariants.test.ts | BUG-DB-001 → dbRetry.ts; BUG-DB-002 → auth wrapped; BUG-DB-003 → afterAll retry wrap; BUG-STK-001 → row locks + idempotency + deadlock retry on stock-in/out/adjustment; BUG-RET-001 → Serializable isolation on return accept |

## B. Lifecycle modules

| Requirement area | Cases | Automation | Notes |
|---|---|---|---|
| Auth/session/profile | TC-01 (17), TC-05 (10) | auth-rbac.test.ts partial | logout-all gap recorded (TC-PRF-009) |
| Users / assignment | TC-03 (11), TC-04 (10) | partial | assignment row-lock + 409 message contract |
| Masters (items/categories/units/dishes) | TC-09…TC-12 (29) | none | delete-guard contracts to be recorded from actual runs |
| Stock (in/out/summary/ledger) | TC-13, TC-14, TC-15 (18) | none | ledger immutability by design |
| Events + planning | TC-08 (10), TC-16 (9) | events.test.ts (code, status chain, notifications, no-deduct) | |
| Requests | TC-17 (12), TC-18 (11), TC-19 (10), TC-20 (9) | material-request-*.test.ts + **partial-issue.test.ts (TC-PART-001…008 AUTOMATED, 7 tests PASS incl. the mission 30/40/30 example)** + issue alarms | — |
| Event cancellation | TC-21 (15) | event-material-lifecycle.test.ts partial + TC-CXL-013 live PASS | §28–§34 matrix |
| Additional requests | TC-22 (12) | none | §35–§37 |
| Returns + partial returns | TC-23 (12), TC-24 (13) | TC-RET-001 / TC-PRN-001/004 stock-path cores in invariants.test.ts; live socket 8/8 | §41–§46 |
| Reconciliation / §39 | TC-25 (10) | TC-REC-004 AUTOMATED in invariants.test.ts; live UI PASS recorded | unreturned = issued − acceptedReturned |
| Notifications / realtime | TC-26 (12) | events.test.ts 4 rows of §49 + db-retry + live 8/8 script | full §49 matrix expansion pending |

## C. Cross-cutting quality

| Area | Cases | Automation |
|---|---|---|
| Data quality / invariants | TC-31 (8), TC-37 (7) | `invariants.test.ts` (8 tests PASS): TC-DQ-001/002/003/007 PASS; DQ-005/006 scoped/enum form; ledger running balance (TC-LDG-003) + TC-REC-004 |
| API security | TC-32 (8) | `auth-negative.test.ts` (11) + `security.test.ts`: SEC-001/002/003/006/007/008 PASS; SEC-004 limiter run pending; SEC-005 partial |
| IDOR | TC-33 (8) | `security.test.ts`: IDOR-001…006 PASS (full); IDOR-007 sweep + IDOR-008 live socket probe remain |
| Input validation | TC-34 (8) | `security.test.ts`: VAL-002/005/006 PASS, VAL-001/004 PARTIAL; VAL-003/007/008 pending |
| XSS / injection | TC-35 (6) | `security.test.ts` XSS-001/002/004 API halves PASS + static audit (zero dangerouslySetInnerHTML; 18/18 raw-SQL sites parameterized tagged templates; no Unsafe); manual render sweeps remain |
| Concurrency | TC-36 (8) | stock-concurrency.test.ts (12 tests PASS) + return-concurrency.test.ts (4 tests PASS) + db-retry.test.ts; SERIALIZABLE isolation on return accept; row locks on all stock mutations |
| Error recovery | TC-43 (7) | partial |
| Performance | TC-38 (6) | pending measurement script |
| Accessibility / Responsive / Browsers | TC-39 (5), TC-40 (5), TC-41 (4, 1 BLOCKED) | browser-driven, pending |
| Regression ledger | TC-44 | 3 AUTOMATED + ledger (BUG-DB-001/002/003 FIXED, BUG-UI-001 FIXED, BUG-VAL-001 FIXED 2026-11-11 — unit create born inactive, found by security.test.ts, regression-locked; BUG-QA-001 workaround) |
| Production gates | TC-45 (9; TC-PRD-007 BLOCKED on VPS creds) | TC-PRD-001 PASS |

## D. Absent modules (findings, traced)

| Module | File | Impact | Status |
|---|---|---|---|
| Inventory Intelligence (Ph-8) | TC-27 | analytics only; underlying data trusted | NOT SHIPPED — sign-off required (TC-PRD-008) |
| Decision Center (Ph-9) | TC-28 | human workflow fully covered by TC-17…21 | NOT SHIPPED |
| Reports (Ph-10) | TC-29 | raw data reliable; report layer absent | NOT SHIPPED |
| Exports | TC-42 | attack class closed by absence; gates pre-recorded for future | NOT SHIPPED |
| Audit-log API/UI | TC-30 | trail complete in DB; exposure layer missing | PARTIAL GAP |

## E. Bug → fix → regression chain (summary)

| Bug | Cases affected | Fix artifact | Regression artifact |
|---|---|---|---|
| BUG-DB-001 (deadlock 500) | TC-RET-001, TC-26 rows, all parallel-suite stability | `backend/src/lib/dbRetry.ts` + 12 wrapped transaction sites + post-commit delivery helper | `db-retry.test.ts`; suite 74/74 ×3; TC-CNC-006 |
| BUG-DB-002 (login 500 on audit deadlock) | TC-01 login row, all auth-path cases | auth.service login/logout/changePassword wrapped with `transactionWithRetry` | `db-retry.test.ts` BUG-DB-002 test; suite 89/89 ×3 |
| BUG-DB-003 (afterAll cleanup deadlock) | all suites' teardown | afterAll bodies of 7 test files wrapped in `withDeadlockRetry(fn, 5)` | suite 89/89 ×3 zero suite-level failures |
| BUG-UI-001 (stale Vite transform → §39 blank) | TC-REC-008 | mtime touch process rule | live UI verification record |
| BUG-QA-001 (seed role) | any executor-role case | qa-phase7 executor account | TC-45 seed audit item |
| BUG-RET-001 (return over-return race) | TC-RET-003, TC-PRN-005/007 | `Serializable` isolation on `materialReturn.service.ts` accept/reject via `transactionWithRetry(fn, 'Serializable')`; `dbRetry.ts` DEFAULT_ATTEMPTS 7→15 | `return-concurrency.test.ts` R1–R4; suite 143/143 PASS |

## F. Status counting policy

Coverage and pass rates in TEST_EXECUTION_REPORT.md and
TEST_CASE_COVERAGE_REPORT.md are computed ONLY from per-case `Status` fields in
TC-01…TC-45 (NOT EXECUTED / PASS / FAIL / BLOCKED / SKIPPED / FLAKY) — never
estimated. Case totals as authored:

| TC file | Cases |
|---|---|
| TC-01 | 17 |
| TC-02 | 15 |
| TC-03 | 11 |
| TC-04 | 10 |
| TC-05 | 10 |
| TC-06 | 6 |
| TC-07 | 6 |
| TC-08 | 10 |
| TC-09 | 7 |
| TC-10 | 9 |
| TC-11 | 7 |
| TC-12 | 6 |
| TC-13 | 7 |
| TC-14 | 5 |
| TC-15 | 6 |
| TC-16 | 9 |
| TC-17 | 12 |
| TC-18 | 11 |
| TC-19 | 10 |
| TC-20 | 9 |
| TC-21 | 15 |
| TC-22 | 12 |
| TC-23 | 12 |
| TC-24 | 13 |
| TC-25 | 10 |
| TC-26 | 12 |
| TC-27 | 4 (GAP) |
| TC-28 | 4 (GAP) |
| TC-29 | 5 (GAP) |
| TC-30 | 5 (2 exec / 3 GAP) |
| TC-31 | 8 |
| TC-32 | 8 |
| TC-33 | 8 |
| TC-34 | 8 |
| TC-35 | 6 |
| TC-36 | 8 |
| TC-37 | 7 |
| TC-38 | 6 |
| TC-39 | 5 |
| TC-40 | 5 |
| TC-41 | 4 (1 BLOCKED) |
| TC-42 | 6 (GAP) |
| TC-43 | 7 |
| TC-44 | 3 + ledger |
| TC-45 | 9 |
| **Total** | **329 authored cases** |
