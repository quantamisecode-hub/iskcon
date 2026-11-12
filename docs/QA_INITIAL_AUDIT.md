# QA Initial Audit — Event-Based Food Inventory & Material Management System

Date: 2026-11-09  
Auditor role: Senior QA (Manual/Automation/API/DB/Security/UI/Responsive/Release)  
Scope: full repository at `food-inventory-system/` (frontend + backend + Prisma + migrations)

> Rule: document-and-fix. Every finding below was reproduced or traced to code, then fixed and re-tested. No finding was dismissed because "build passes".

---

## 1. Repository structure inspected

| Area | Paths |
|---|---|
| Frontend | `frontend/src/pages/` (22 pages), `features/{auth,dashboard,events,inventory,notifications,requests,users}`, `components/layout/`, `services/api`, `services/realtime/socketClient.ts`, `hooks/useRealtimeNotifications.ts` |
| Backend routes | `backend/src/routes/*.ts` (auth, users, assignments, events, dishes, foodItem, ledger, category, unit, materialRequest, notification, dashboard, health) |
| Backend services | `backend/src/services/{auth,event,dish,foodItem,materialRequest,ledger,dashboard,user,assignment,auditLog,notification}.service.ts` |
| Prisma | `backend/prisma/schema.prisma`, `backend/prisma/migrations/` (incl. `20261109131317_material_requests_notifications`) |
| Config | `backend/src/config/{env,security,database}.ts`, `backend/src/middleware/{auth,security,validation,error,requestId}.ts`, `backend/src/lib/socket.ts` |
| Docs | `docs/{api-conventions,architecture,development-setup,security-baseline,PHASE_5_COMPLETION_REPORT}.md` |
| Root | `package.json`, `.env.production.example`, `deploy/` |

## 2. Existing test coverage

- Backend: 2 vitest files, **32 tests passing** (auth/RBAC/IDOR/event lifecycle/dish/material/duplicate/status-machine guards). Test DB `food_inventory_test` (separate from dev).
- Frontend: **no automated tests**. No Playwright/Cypress present.
- Manual QA scripts used for this phase: API battery (auth, validation, boundary, XSS, SQLi, mass-assignment, ledger detail), boundary/inventory-integrity script, RBAC/IDOR script with minted sessions — see `docs/QA_AUTOMATION_REPORT.md`.

## 3. Findings summary (P0–P3)

### P2 — fixed in this cycle

| ID | Title | Evidence | Fix |
|---|---|---|---|
| P2-01 | Food-item detail leaked cross-admin operational links | `foodItem.service.ts:getDetail()` returned **all** `eventMaterial`/`materialRequestItem` rows regardless of actor. Executor of Admin B could see Admin A's event names/codes via `GET /food-items/:id/detail` | Scoped related events/requests to actor (ADMIN→own adminId; EXECUTOR→own created/requested; no-actor legacy path unchanged). Route now passes `actor`. Verified: cross-scope IDOR still 403, detail no longer leaks. |
| P2-02 | Event delete had no audit entry | `event.service.ts:remove()` deleted without `auditLogService.createAuditLog`. Other mutations (create/update/status) were audited | Added `DELETE_EVENT` to `auditActions.ts` and audit write on delete (oldValues: eventCode/name/status). |
| P2-03 | Unbounded `pageSize` (DoS/large-response risk) | `foodItem.routes.ts`, `category.routes.ts`, `unit.routes.ts` used raw `Number(pageSize) \|\| 20` — `?pageSize=100000` would load 100k rows | Clamped to `min(100, max(1, pageSize))` and `page >=1` on all three list endpoints. Verified: `pageSize=100000` returns ≤100 rows. |
| P2-04 | Ledger transaction detail missing (Phase 6 spec gap) | `LedgerPage.tsx` was table-only; no `GET /ledger/:id` endpoint | Added `GET /ledger/:id` (ADMIN-only, UUID-validated) + `ledgerService.getById()`; frontend row-click → detail Modal with id/item/type/qty/balance/reference/remarks/performer/timestamp; item name deep-links to FoodItem detail. Verified 200 + 404. |
| P2-05 | Stock In/Out picker incomplete + silent wrong-item fallback | `InventoryPage.tsx` picker mapped only visible page (20 rows); `handleStockOut` fell back to `items[0]` — could stock-out the wrong item | Dedicated `pickerItems` fetch (pageSize 100), removed `items[0]` fallback (explicit pick required, error if none). |
| P2-06 | Executor dashboard notifications were hard-coded static | `ExecutorDashboard.tsx` always rendered "You're all caught up" — no API call | Wired to `fetchNotifications({pageSize:3})`, shows real recent items + unread count. |
| P2-07 | Item-detail stock status showed raw enum | `FoodItemDetailPage.tsx` rendered `NORMAL`/`LOW` verbatim | `statusLabel()`: Healthy / Low Stock / Critical / Out of Stock. |
| P2-08 | Tables clipped on mobile | `overflow-hidden` wrappers on Inventory/FoodItems/Categories/Units/Ledger tables clipped content at ~375px | Changed to `overflow-x-auto` + `min-w-[720px]` where needed. Calendar already had mobile timeline. |
| P2-09 | Backend lint: 14 `any` + 1 type-import errors | `npm run lint` failed — blocked release gate (§83 build failure criterion) | Replaced `any` with inferred/Prisma (`Notification`, `FoodWithUnit`, inferred event-material rows) and `import type { Prisma }`. Build + lint now clean. |
| P2-10 | `GET /food-items/:id/detail` route ordering fragility | Detail must not be shadowed by `GET /:id` | Verified safe: `/stock/summary` declared before `/:id`; `/:id/detail` has extra segment, never hits `/:id`. No change needed. |

### P2 — remaining (known limitations, not blockers for local prod build)

| ID | Title | Impact |
|---|---|---|
| P2-11 | **"Add Sub-category"** (pending from earlier phases) not implemented | Create Food Item still uses Category + Unit only. No DB/UI support for sub-categories. Classified P2 — not in Phase 6 spec scope, but noted for Phase 7 planning. |
| P2-12 | Executor item-detail scope is conservative | EXECUTOR sees only own-created events/requests, not assigned-admin events. Under-exposes (safe direction) rather than over-exposes. If product wants assigned-scope visibility, extend with `assignmentRepository` lookup — tracked for Phase 7. |
| P2-13 | No browser automation framework | Critical journeys proven by API scripts + browser manual walk (see QA_TEST_CASES). Playwright should be added before scaling team. |
| P2-14 | No real-device / Safari testing | Responsive verified by code audit + 390–1440px Chromium manual check only. Documented, not claimed. |

### P3 — minor

| ID | Title |
|---|---|
| P3-01 | Frontend lint: 11 warnings (unused `eslint-disable react-hooks/exhaustive-deps`, `react-refresh/only-export-components` in AuthContext/EventStatusBadge, `no-console` disables in socketClient). 0 errors, build passes. Cleanup recommended post-release. |
| P3-02 | Global rate-limit header `300-in-15min` is generous for non-login APIs; login limiter (10/15min/IP) correctly triggered during QA (429 observed). Consider tightening global limit per route. |
| P3-03 | `package.json#prisma` deprecation warning (Prisma 6 → config file in Prisma 7). Harmless now. |
| P3-04 | `npm audit`: 3 high (deepmerge-ts via prisma CLI, dev-tooling only) + 7 moderate (minimatch via typescript-eslint). Not runtime-exploitable; fix requires breaking prisma@7 / typescript-eslint@8 — deferred by policy (no blind upgrades). |

### P0 / P1 — none open

No authentication bypass, authorization bypass, IDOR, data-loss, inventory-corruption, or build-failure remained after fixes. Evidence in `docs/QA_TEST_CASES.md` and `docs/QA_BUG_REPORT.md`.

## 4. Notable "no-bug" verifications (audited, correct)

- Auth: HttpOnly cookie, hash-only session storage (SHA-256), active-user re-check per request + socket handshake, 7d expiry, logout revokes, password change revokes all sessions. Passwords never in responses/logs.
- RBAC/IDOR: server-enforced on every route; `adminId` derived server-side from event at request creation; `.strict()` Zod schemas on all bodies reject mass-assignment (`adminId`/`status` injection → 400).
- XSS/SQLi: all queries via Prisma parameterization; React escapes by default (`<script>` payload stored literally, not executed).
- Inventory boundary (§30 of QA brief): planning → request → submit → approve **never moves stock**. Only Stock In/Out endpoints write `InventoryTransaction`. Verified by before/after stock + ledger inspection.
- Headers/CORS/rate-limit: production build emits CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS; CORS reflects only configured `CORS_ORIGIN` (legacy `FRONTEND_URL`) with credentials; evil origin gets no `Access-Control-Allow-Origin`; login 429 after repeated failures confirmed.
- Real-time: Socket.IO cookie auth primary, token fallback for non-browser; rooms `user:<id>` + `role:<ADMIN|EXECUTOR>`; notifications persisted (survive refresh) + live emission.

## 5. Mock / fake data sweep

- `grep -ri "mock\|fake\|placeholder\|coming soon"` across `frontend/src`, `backend/src`: no runtime mocks. The only "placeholder" texts are HTML input placeholders. Dashboard is deterministic (no AI/LLM in inventory logic, per spec). One intentional smoke residue remains in dev DB: a manual STOCK_OUT row (−85 KG) from an earlier smoke test — dev-only, not code.

## 6. Audit trail

- Backend `tsc --noEmit` clean; frontend `tsc --noEmit` clean.
- Backend `eslint` clean (after P2-09); frontend `eslint` 0 errors / 11 warnings.
- `prisma validate` ✅; migrations applied (`20261109131317_material_requests_notifications`).
- Production builds: backend `tsc -p` ✅; frontend `vite build` 191 modules ✅.
- Vitest: 32/32 ✅.
- Manual API battery: 18 ✅ + 12 ✅ boundary + 14 ✅ RBAC/IDOR (see QA_AUTOMATION_REPORT).
- Browser walk: login → dashboard → calendar (Month/Week/Day) → requests → notifications → ledger; console errors 0; storage audit clean (only nav prefs in localStorage, HttpOnly cookies).
- Production-mode smoke (port 5055 `NODE_ENV=production node dist/server.js`): health 200, SPA served, headers verified.

---
End of initial audit. Bugs fixed during audit are detailed in `docs/QA_BUG_REPORT.md`; environment in `docs/QA_TEST_ENVIRONMENT.md`; verdict in `docs/PRODUCTION_READINESS_REPORT.md`.
