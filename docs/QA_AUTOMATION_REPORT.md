# QA Automation Report

Date: 2026-11-09

## 1. Framework

- **Existing:** Vitest 5.1 + supertest (backend integration). No Playwright/Cypress — per policy, no second browser framework was introduced.
- **QA ad-hoc scripts (this phase, removed after run):** Node `fetch` batteries executed against the live dev API (`:5000`). Temp files (`qa_api.tmp.mjs`, `qa_boundary.tmp.mjs`, `qa_rbac*.tmp.mjs`, `create_qa_users.tmp.ts`, `mint_sessions.tmp.ts`, `test_stocknotif.tmp.mjs`, etc.) were deleted after evidence capture. No test data is hardcoded into production code.

## 2. Tests executed

| Suite | File (temp) | Tests | Passed | Failed | Covers |
|---|---|---|---|---|---|
| Vitest (committed) | `backend/` vitest suites | 32 | 32 | 0 | Auth, RBAC, IDOR, event lifecycle, dish/material, duplicates, status machine, assignments, user guards |
| API battery | `qa_api.tmp.mjs` | 19 | 18 | 1 | Auth negative, event validation, pagination cap, stock boundary (409/400), XSS, events list, user strict-create, SQLi, ledger detail. **1 failure was a test-design error**: first request-creation attempt hit the correct 400 "no committed plan" guard (seeded event had only draft lines) — re-tested properly in boundary suite. Not a product bug. |
| Boundary / inventory integrity | `qa_boundary.tmp.mjs` | 12 | 12 | 0 | Create→dish→material→stock-unchanged→dup 409s→request→submit→approve→stock-unchanged (critical §30) |
| RBAC/IDOR (minted sessions) | `qa_rbac2.tmp.mjs` | 14 | 14 | 0 | Executor 403s, cross-scope 403s (GET/PATCH/DELETE), 404, mass-assignment 400, scoped lists, ledger 403 |

**Totals:** 77 executed · 76 passed · 1 test-design misread (product guard correct) · 0 product failures.

## 3. Critical journeys covered (brief §46)

| Journey | Proof |
|---|---|
| Admin login → dashboard | API 200 + browser dashboard walk |
| Executor login → dashboard | API 200 (minted + real login where limiter allowed) + dashboard render |
| Create event → calendar → details | API 201 + calendar Month/Week/Day browser walk |
| Edit event (name/date/time/people/location/desc) | vitest + API PATCH |
| Create dish → add material | vitest + API 201 |
| Add dish to event | API 201 |
| Authorization (Executor → Admin-only) | 403 battery (14) |
| Inventory boundary | QA-I01/I02 (stock unchanged) |
| Logout → protected denied | Code + 401 battery (logout-click not re-walked — ⚠️ partial) |

## 4. Automated API coverage (§47)

login, `/auth/me`, create event, get event, update event, create dish, add dish material, add dish to event, auth-failure 401, IDOR-failure 403, duplicate 409, back-boundary 409/400 — all assert **status + response shape + DB state** (stock comparison, ledger rows, scoped lists).

## 5. Flaky / skipped

- None flaky. No skipped committed tests (32/32). One login attempt hit the rate limiter (429) — **expected behavior** and itself a verified control; RBAC suite used minted sessions to avoid lockout contamination.

## 6. Gaps (remaining automation)

1. No Playwright browser tests (click-through deep-links, responsive screenshots, keyboard flows). Recommendations: add `playwright` + smoke spec: login→dashboard→calendar→create event→details; bell socket test; ledger drawer.
2. No calendar load test (100/500/1000 events) or p95 latency assertion.
3. No concurrency test harness (two users editing same event) — single-writer + 409 guards cover the DB layer, but no scripted race.
4. No frontend unit tests (Vitest for React components absent).

## 7. Reproduction

```bash
cd backend
npm test          # vitest 32/32
npm run build && npm run lint   # gates
# API batteries: run against a dev server (tsx watch) — scripts were temp files, now deleted.
# Re-create from docs/QA_TEST_CASES.md if re-testing is needed.
```
