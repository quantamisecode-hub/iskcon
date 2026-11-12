# Phase 6 Documentation — Inventory Master, Current Stock, Ledger, Requests, Notifications, Realtime

Date: 2026-11-09 | Status: Implemented (backend + frontend) · Final QA 2026-11-09

Phase 6 extends Phase 4 (events/dishes/planning) and Phase 5 (calendar/new-event) with the **inventory master layer, the material-request lifecycle, notifications, and realtime**.

> **Core invariant (never violated):** planning is never stock consumption. Event, dish, material, request creation, submission and approval **must not deduct stock**. Deduction happens only at explicit Stock Out (manual) and future Issue/Checkout (Phase 7 — not built). APPROVED ≠ ISSUED.

---

## 1. Implemented

### Backend

- **Food Item Master:** `GET /food-items` (filter/search/paginate, capped 100), `GET /food-items/:id`, `GET /food-items/:id/detail` (stock summary + recent txns + related events/requests, **scoped to actor** after QA-P2-01), `POST /food-items` (ADMIN-only, requires active Category + Unit), `PATCH /food-items/:id`, `POST /food-items/:id/stock-in`, `POST /food-items/:id/stock-out` (reason required, 409 on insufficient), `GET /food-items/stock/summary` (backend-computed KPIs).
- **Categories / Units:** `GET /categories`, `GET /units` (any-role read for dropdowns), ADMIN-only create/deactivate; linked categories cannot be deactivated/deleted (409); category delete is hard-delete only when unlinked.
- **Inventory / Ledger:** `Inventory` (one row per item, `currentQuantity`, `minimumStock`, `reorderLevel` on item), `InventoryTransaction` ledger with `balanceBefore`/`balanceAfter`, `type` (STOCK_IN/STOCK_OUT/ADJUSTMENT/RETURN), `referenceType`/`referenceId`, remarks, `performedBy`. `GET /ledger` (ADMIN-only, filters + pagination), **`GET /ledger/:id`** (ADMIN-only, detail — added in QA). Ledger is written **only** by stock operations.
- **Stock health:** `getStockStatus()` → `OUT_OF_STOCK` / `LOW_STOCK` / `REORDER_REQUIRED` based on `minimumStock`/`reorderLevel`; alerts persisted as `Notification` rows (reference FOOD_ITEM) **and** emitted via socket; survive refresh.
- **Material requests:** `MaterialRequest` + `MaterialRequestItem` + `MaterialRequestCodeCounter` (`REQ-YYYY-NNNNNN`); statuses `DRAFT|PENDING_APPROVAL|APPROVED|REJECTED|CANCELLED`. Endpoints: `POST /material-requests` (EXECUTOR-only; create from event's committed plan, adminId derived server-side), `POST /:id/submit` (EXECUTOR-only, own request), `POST /:id/approve` (ADMIN-only), `POST /:id/reject` (ADMIN-only), `POST /:id/cancel` (own request, or ADMIN in scope), `GET /` (scoped list), `GET /:id` (detail). Duplicate open request per event → 409. Draft lines (`isDraft`) excluded; events with only drafts → 400. **Separation of duties:** only an EXECUTOR may request materials and only an ADMIN may approve/reject; an ADMIN can never approve or reject a request they created.
- **Notifications:** `Notification` model + `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/mark-all-read`, `POST /notifications/test` (authenticated, self-only). Every actionable notification deep-links (`notificationTarget.ts` → page where recipient acts).
- **Realtime (Socket.IO `/socket.io`):** cookie auth primary, `auth.token`/`?token=` fallback for non-browser; rooms `user:<id>` + `role:<ADMIN|EXECUTOR>`; events `notification:new`, `stock:alert`, `material-request:*`. Initialized in `backend/src/lib/socket.ts`.
- **Dashboard:** deterministic aggregator — `pendingRequests` (real, previously null), `demandTrend`, `reorderRequired`, today's movement, frequently-used, low-stock health. **No AI/LLM** in inventory logic.
- **Auth/RBAC/audit:** server-enforced (ADMIN full; EXECUTOR assigned-admin scope only); Zod `.strict()`; audit log on mutations (incl. added `DELETE_EVENT`); `EventCodeCounter` for `EVT-YYYY-NNNNNN`.

### Frontend

- **Current Stock** (`/inventory`): KPI tiles (Total Items, Stock Lines, Low, Reorder, Out, Healthy) from `/stock/summary` with error state; Stock In/Out modals with full-catalogue picker + explicit selection.
- **Food Items** (`/inventory/food-items`): list/search/filter/paginate; **Item Detail** (`/inventory/food-items/:id`): stock summary, human status label (Healthy/Low Stock/Critical/Out of Stock), recent txns, related events/requests; Stock In/Out modals.
- **Ledger** (`/inventory/ledger`): filters (type/item/date), paginated table, **row-click detail Modal** (QA), item deep-links.
- **Categories / Units** pages: ADMIN-managed tables with `overflow-x-auto`.
- **Requests** (`/requests`, `/requests/:id`): list + detail with submit/approve/reject/cancel; create-from-event button on Event Detail is shown to EXECUTORs only. ADMINs review and decide, and never see approve/reject for a request they raised themselves.
- **Notifications** (`/notifications`): list with "Send test notification"; bell dropdown in `AppLayout` (opens → marks all read; `aria-expanded`, Escape/outside-click close; unread ping badge); realtime hook `useRealtimeNotifications`; socket client `services/realtime/socketClient.ts`.
- **Dashboards:** Admin (pending requests, low stock, health, movement, frequent) + Executor (today's work, upcoming, own requests, **real notifications widget** — fixed in QA). Terracotta/Poppins design, color-coded statuses + legend, loading/empty/error states, `prefers-reduced-motion`, hand cursor, responsive (overflow-x scroll tables, mobile calendar timeline).

---

## 2. UI / Backend / DB

| Layer | Detail |
|---|---|
| UI | Same-origin deployment: Express serves `frontend/dist`. All Phase 6 pages under `/inventory/*`, `/requests/*`, `/notifications`. No bottom toasts for notifications (bell only). |
| Backend | One REST base `/api/v1`; Socket.IO alongside. Services never trust client ownership (`adminId` server-derived). `sendSuccess`/`ApiError` envelope; `requestId` logging (no secrets). |
| DB | Prisma + MySQL. Models: `FoodItem`, `Inventory`, `InventoryTransaction`, `MaterialRequest`, `MaterialRequestItem`, `Notification`, `MaterialRequestCodeCounter`, `EventCodeCounter`. Migration `20261109131317_material_requests_notifications` applied. |

## 3. Security

- HttpOnly `fis_session` cookie (SHA-256 hash storage, 7d expiry, active-user re-check). `Secure` must be `true` in prod (`.env.production.example`).
- RBAC on every route; IDOR-scoped reads (events, requests, ledger ADMIN-only, item-detail scoped).
- Material-request separation of duties: EXECUTOR-only create/submit, ADMIN-only approve/reject, and a self-decision guard that blocks an admin from approving or rejecting a request they created (route + service + UI). See `docs/MATERIAL_REQUEST_AUTHORIZATION.md`.
- Rate limits: global 300/15min; login strict (429 verified).
- Helmet headers: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-referrer` (verified from prod build).
- CORS: only `CORS_ORIGIN` (legacy `FRONTEND_URL`) + credentials; evil origin blocked; no wildcard.

## 4. Testing

- Vitest 35/35 (regression, including material-request separation-of-duties suite).
- API batteries 76/77 product-pass (see `docs/QA_AUTOMATION_REPORT.md`).
- Boundary proof: stock unchanged through planning → request → submit → approve.
- Prod build + `:5055` smoke: health/SPA/headers/CORS pass.
- Full cases: `docs/QA_TEST_CASES.md`; bugs: `docs/QA_BUG_REPORT.md`.

## 5. Limitations (Phase 6 scope)

- Issue/Checkout (Phase 7) **not implemented** — APPROVED requests do not move stock. This is intentional.
- "Add Sub-category" pending (P2-11).
- Executor item-detail scope is own-only (conservative, P2-12).
- No browser automation / device farm (process gaps P2-13/P2-14).

## 6. Phase 7 pointer

Issue/Checkout deduct flow: authorized users issue approved request lines against an event; creates `STOCK_OUT` ledger rows with `referenceType=EVENT`/`referenceId`; pre-issue shortfall check (409 if insufficient); partial-issue semantics TBD. See `docs/PHASE_6_COMPLETION_REPORT.md`.
