# QA Bug Report

Date: 2026-11-09 | Environment: local dev (`:5000` + `:5173`) + production build smoke (`:5055`)

Bug IDs `QA-P2-01` … map to `docs/QA_INITIAL_AUDIT.md`. Every bug follows: reproduce → root cause → fix → retest → regression.

---

## QA-P2-01 — Food-item detail leaked cross-admin events/requests

- **Severity:** P2 (unauthorized data exposure of operational metadata; ADMIN↔ADMIN and EXECUTOR cross-scope)  
- **Environment:** dev `:5000`, MySQL `food_inventory`  
- **User/Role:** Executor B1 (or Admin B) requesting `GET /food-items/:id/detail` for an item used by Admin A events  
- **Preconditions:** Item planned in Admin A event; caller scoped to Admin B.  
- **Steps to Reproduce:**  
  1. As Admin A, create Event + add dish material (Rice 50).  
  2. As Executor B1, `GET /food-items/<riceId>/detail`.  
  3. Observe `relatedEvents` contains Admin A's event name/code/date.  
- **Expected Result:** Caller sees only in-scope events/requests (or none).  
- **Actual Result:** All 25 related event-materials + 25 request items returned regardless of caller. `foodItem.service.ts:getDetail()` had no actor param; route passed none.  
- **Evidence:** Code: `foodItem.routes.ts` → `foodItemService.getDetail(id)`; service queried all rows unscoped.  
- **API:** `GET /api/v1/food-items/:id/detail` 200 with cross-scope rows.  
- **Database:** `EventMaterial` + `MaterialRequestItem` rows joined via `Event`/`MaterialRequest` — no scope filter.  
- **Root Cause:** Missing authorization filter on a detail aggregator; master is globally readable but operational links must be scoped.  
- **Fix:** `getDetail(foodItemId, actor?)` — ADMIN filters by `adminId === actor.id`, EXECUTOR by `createdBy/requestedBy === actor.id` (conservative, see P2-12). Route passes authenticated actor.  
- **Retest Result:** ✅ Cross-scope detail no longer leaks; in-scope detail still returns links. RBAC battery (14 checks) still passes.  
- **Regression Result:** ✅ vitest 32/32; frontend `FoodItemDetailPage` unchanged contract (same fields, subset).  
- **Status:** **Resolved**

## QA-P2-02 — Event delete produced no audit log

- **Severity:** P2 (audit-trail gap for a destructive action)  
- **Steps:** Delete an event as ADMIN; query `AuditLog` — no entry.  
- **Expected:** `DELETE_EVENT` entry with actor, entity, old values, IP/UA, timestamp.  
- **Actual:** `event.service.ts:remove()` deleted silently; `AUDIT_ACTIONS` had no `DELETE_EVENT`.  
- **Root Cause:** Incomplete audit coverage on `DELETE /events/:id`.  
- **Fix:** Added `DELETE_EVENT` constant + `auditLogService.createAuditLog` in `remove()` with `oldValues: { eventCode, name, status }`.  
- **Retest:** ✅ Delete now auditable (create→delete→log row).  
- **Regression:** ✅ vitest delete-case still passes (returns `{deleted:true}`).  
- **Status:** **Resolved**

## QA-P2-03 — Unbounded `pageSize` on list endpoints

- **Severity:** P2 (large-response / DoS)  
- **Steps:** `GET /food-items?pageSize=100000` (same for `/categories`, `/units`).  
- **Expected:** Bounded (≤100).  
- **Actual:** Returned 100k rows on dev (small DB hid impact).  
- **Root Cause:** `Number(req.query.pageSize) || 20` with no upper bound.  
- **Fix:** Clamped `pageSize = min(100, max(1, …))`, `page = max(1, …)` on all three routes.  
- **Retest:** ✅ `pageSize=100000` → ≤100 rows (API QA check).  
- **Regression:** ✅ Frontend uses ≤100 everywhere.  
- **Status:** **Resolved**

## QA-P2-04 — Ledger transaction detail missing (Phase 6 gap)

- **Severity:** P2 (spec gap; ledger rows not inspectable)  
- **Steps:** Open `/ledger`, click row — nothing happens.  
- **Expected:** Detail drawer/modal with transaction id, balanceBefore→After, reference, remarks, performer, timestamp.  
- **Actual:** Table only; no `GET /ledger/:id`.  
- **Fix:** Added `GET /api/v1/ledger/:id` (ADMIN-only, UUID-validated) + `ledgerService.getById()`; `LedgerPage` row-click → Modal; item name links to FoodItem detail.  
- **Retest:** ✅ 200 with fields; unknown UUID → 404.  
- **Regression:** ✅ List/filters/pagination unchanged.  
- **Status:** **Resolved**

## QA-P2-05 — Stock picker incomplete + silent wrong-item fallback

- **Severity:** P2 (wrong-item stock movement risk)  
- **Steps:** On `/inventory`, Stock Out modal lists only current page (20). `handleStockOut` fell back to `items[0]`.  
- **Expected:** Full catalogue in picker; explicit selection required.  
- **Actual:** Items beyond page 1 unselectable; fallback could deduct from a different item than displayed in edge case.  
- **Fix:** `pickerItems` fetch (pageSize 100); removed fallback (error "Choose a food item first").  
- **Retest:** ✅ Picker shows full list; no-selection → clean error.  
- **Status:** **Resolved**

## QA-P2-06 — Executor dashboard notifications hard-coded

- **Severity:** P2 (feature gap; Phase 6 requires live notifications widget)  
- **Steps:** Login as EXECUTOR → Dashboard Notifications widget — always "You're all caught up".  
- **Actual:** No fetch; static JSX.  
- **Fix:** Wired to `fetchNotifications({pageSize:3})`; renders recent 3 + unread count.  
- **Retest:** ✅ Empty → caught-up state; with notifications → real list.  
- **Status:** **Resolved**

## QA-P2-07 — Stock status showed raw enum token

- **Severity:** P2 (UI, color-independent status required by spec)  
- **Steps:** Open FoodItem detail — status tile shows `LOW`/`NORMAL`.  
- **Fix:** `statusLabel()` → Healthy / Low Stock / Critical / Out of Stock.  
- **Status:** **Resolved**

## QA-P2-08 — Tables clipped on mobile

- **Severity:** P2 (responsive §41–42)  
- **Steps:** View Inventory/Food Items/Categories/Units/Ledger at 375px.  
- **Actual:** `overflow-hidden` clipped wide tables.  
- **Fix:** `overflow-x-auto` (+ `min-w`) so tables scroll horizontally; page itself does not horizontally scroll.  
- **Status:** **Resolved (code-fixed; device retest recommended)**

## QA-P2-09 — Backend lint failed (14 `any` + type-import errors)

- **Severity:** P2 (release gate: production build/lint failure blocks deploy)  
- **Steps:** `cd backend && npm run lint`.  
- **Actual:** 14 `no-explicit-any` errors, 1 `consistent-type-imports`.  
- **Root Cause:** Phase 6 added `any` in `foodItem.service.ts` and `materialRequest.service.ts`.  
- **Fix:** Inferred Prisma types + `Notification` type + `import type { Prisma }` (no rule suppression).  
- **Retest:** ✅ `eslint` 0 errors; `tsc -p` build ✅; vitest 32/32.  
- **Status:** **Resolved**

---

## Non-bug negative tests (correct behavior, recorded to prevent re-filing)

| Case | Result |
|---|---|
| Invalid password / empty email → 401/400 (safe messages, no enumeration) | ✅ correct |
| Unauthenticated `/users` → 401 | ✅ correct |
| Event validation (empty name, 0 people) → 400 | ✅ correct |
| Stock-out over-draw (999999) → 409 "Not enough stock", balance unchanged | ✅ correct |
| Stock-out qty 0 → 400; missing reason → 400 | ✅ correct |
| XSS event name `<script>alert(1)</script>` → 201, round-trips literally, React-escaped (inert) | ✅ correct |
| SQLi `search=' OR '1'='1` → 200 inert, no DB error | ✅ correct |
| Duplicate dish/material → 409; create-request with only-draft plan → 400 (guard) | ✅ correct |
| Mass-assignment (`adminId`/`status`/`isActive` injection) → 400 via `.strict()` | ✅ correct |
| Login rate-limit 429 after burst | ✅ correct |
| Production headers + CORS allow/block | ✅ correct |
| Storage: `document.cookie` empty (HttpOnly), localStorage only nav prefs | ✅ correct |
| Console errors in Chromium walk: 0 | ✅ correct |

---

## Open / deferred

| ID | Title | Disposition |
|---|---|---|
| QA-P2-11 | Add Sub-category (Create Food Item) — not implemented | **Open, P2** — Phase 7 scope decision needed |
| QA-P3-01 | Frontend 11 lint warnings (unused disables, fast-refresh) | **Open, P3** — cleanup, not blocking (0 errors) |
| QA-P3-04 | npm audit high/moderate (prisma CLI deepmerge-ts, typescript-eslint minimatch) | **Open, P3** — requires major bumps; deferred by no-blind-upgrade policy |
| QA-P2-13 | No Playwright automation; Safari/Firefox/device testing absent | **Open, P2 (process)** — tracked in readiness report |

**Counts:** P0 open 0 · P1 open 0 · P2 open 3 (incl. process) · P3 open 3 · Resolved 9.
