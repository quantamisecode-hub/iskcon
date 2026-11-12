# Phase 5 — Calendar + Event + Dish Management — Completion Report

**Date:** 2026-11-09
**Scope:** Calendar, Event Management, Event Details, Dish Management, Event → Dish mapping, Dish → Inventory Material mapping, Event Material planning foundation.
**Status:** IMPLEMENTED — builds, lint, 32/32 backend tests green.

---

## 1. Implemented

### Calendar
- `/calendar` route — role-aware, same ISKCON design language.
- Month view (default), Week view, Day view — all with real data from `GET /calendar/events?from&to`.
- Week & Day render an **hourly timeline** (06:00–22:00) with events absolutely positioned by start/end, side-by-side when overlapping; hour rail on the left.
- Prev / Today / Next navigation; Month view has a native month picker on the month title; `role="tablist"` view switcher (`aria-selected`).
- Events show time, name, people count, and color-coded status; a legend (color + label) sits in the toolbar.
- Mobile: below `md`, the grid collapses to a tap-friendly agenda list grouped by day; month grid remains available ≥ `md`.
- Header rebuilt to spec: Calendar icon + `Calendar` + subtitle *“Manage events, schedules and material planning”* + right-side **Create Event** primary button.
- Fetches only the visible range (never the whole table). Loading skeleton, inline error with Retry, empty agenda state with a create CTA.

### Event Management
- `/events` — list with search / status / date range filters / pagination.
- `/events/new` — **dedicated full-page create form** (replaced the modal): sections Basic Information (Name, Date, People, Start, End, Status DRAFT|PLANNING), Location (Location + Notes), Description. Assignment hint is read-only: ADMIN → “your own Admin scope”; EXECUTOR → “your assigned Admin’s scope automatically”. Success navigates to the event detail page; calendar refreshes naturally on next visit.
- `/events/:id` — operational workspace: header (name, code, status badge), ACK status actions (`Start Planning → Mark as Ready → Mark as Completed`, `Cancel Event` with **confirmation dialog**), Edit (modal), Delete (guarded).
  - Status machine enforced server-side: DRAFT→PLANNING→READY→COMPLETED forward only; CANCELLED allowed from DRAFT/PLANNING/READY; COMPLETED/CANCELLED terminal. Illegal transitions rejected (409).
  - Event code `EVT-YYYY-NNNNNN` generated atomically (`EventCodeCounter`), unique, never a primary key.
- IDOR/scope enforced server-side on every read/write (Admin = own events; Executor = assigned Admin’s events + own creations). Out-of-scope access → 403, existence never leaked to other scopes (404 for missing records).
- Executor assignment survives reassignment by design (event stores `adminId` at creation; history never rewritten).

### Event Details — Dishes & Material Planning
- **Dishes section:** add/remove dishes to the event (unique `eventId + dishId`), ordered cards.
- **Per-item stock gate (client):** in the Add Materials panel, an item with zero stock is disabled and shows a red **Out of Stock — stock in first** badge; selected lines exceeding stock show inline **Short by X unit** and block the plain Add button.
- **Auto-split:** when quantity > available stock, the line is routed to **Draft automatically** on submit — the footer shows `X will be added · Y will go to draft (short)` before submit. The manual **Add to Draft** stays for saving everything as draft on purpose.
- **Event-level lock:** while any committed line exceeds on-hand stock (amber shortfall banner visible), **Add Materials is disabled for ADMIN and EXECUTOR alike**, with a lock note and `aria`-locked panel.
- **Draft → Commit:** draft lines show a DRAFT chip and *waiting for stock — short X*; committing is **ADMIN-only**, enabled only when fresh stock covers the plan (server re-checks), audited as `COMMIT_EVENT_MATERIAL`. Executors see a muted lock chip: *Admin adds once in stock.*
- Dish recipes (`/dishes/:id`) keep strict blocking behavior (no draft concept for recipes).
- Draft lines are excluded from the shortfall/refill calculation.
- **No inventory is deducted** at any point — creating/editing events, mapping dishes, planning materials, approvals: zero stock transactions. Stock only moves via audited Stock In / Stock Out / Adjustment endpoints.

### Dish Management
- `/dishes` — master table with search, Active/Inactive filter, pagination, **ADMIN-only** writes.
- `/dishes/new` equivalent: create via modal with validation; `/dishes/:id` — detail with description, status, and material mapping table; add/remove/edit materials (Food Item Master only — no free text).
- Historical snapshot stability: `EventMaterial` stores its own quantity/unit/foodItem at planning time; editing the Dish Master later never rewrites existing event plans. Same for Event Dish vs Dish Master name.
- Duplicate mappings rejected (`409`) for `dishId + foodItemId` and `eventDishId + foodItemId`.

### Data integrity observed live
- Event detail → dishes → material planning end-to-end with seeded data; shortfall lock engages/releases on line removal; draft auto-split verified with a mixed selection; validation toasts and notices work.

## 2. UI quality
- **Desktop / tablet:** full grids, responsive `grid-cols` collapse; tablet ≤ `lg` keeps comfortable row paddings. Medium breakpoint switches calendar from grid (`hidden md:block`) to agenda list (`md:hidden`).
- **States:** skeleton loaders everywhere (calendar, tables, cards); empty states with CTAs; inline errors with Retry (calendar); toast/notice system used throughout.
- **Accessibility:** `role="tablist"/tab` with `aria-selected`, `aria-expanded` on collapsibles, `aria-current="page"` on active nav/items, `aria-labelledby`-compatible dialogs (native focus handled by Modal), visible focus rings, labels on all inputs, required markers, no color-only signaling (legend always includes text).
- **Reduced motion:** animations use short durations with `motion-reduce:transition-none` where applicable (accordion, drawers).
- **Loading prevention:** submit buttons disabled with spinner text (`Saving…`); duplicate submissions blocked client-side and server-side (unique constraints).

## 3. Backend
- Architecture kept: Route → Controller → Service → Repository → Prisma. No business logic in controllers.
- **Validation:** Zod `.strict()` schemas on all event/dish/material create & update endpoints (mass-assignment safe). Calendar query params coerced and range-checked.
- **Errors:** hand-rolled master-data routes now emit the shared envelope; 500s no longer leak internals (`sendRouteError` + typed `ApiError`).
- **Transactions:** event code generation + event creation atomic; multi-step deletes in `$transaction`; material line commits re-read inventory inside the request path.
- **MySQL correctness fixes found & fixed this phase:**
  1. Food-item search used Postgres-only `mode: 'insensitive'` → **500 on MySQL**. Dropped `mode` (MySQL default collation is already case-insensitive). Verified: `SUGAR`, `basmati`, `zzzz-no-match` all behave correctly.
  2. `foodItemRepository.findById/update` didn’t `include` category/unit, so audit `oldValues/newValues` wrote `undefined` names. Both now include masters; audit rows carry real names.
- **Audit logging:** `CREATE_EVENT`, `UPDATE_EVENT`, `CANCEL_EVENT`, `CHANGE_EVENT_STATUS`, `ADD/REMOVE_EVENT_DISH`, `ADD/UPDATE/REMOVE_EVENT_MATERIAL`, `COMMIT_EVENT_MATERIAL`, plus dish/food-item/category/user actions from earlier phases.

## 4. Security
- RBAC enforced server-side (not route-guard-only): Dish Master writes = ADMIN; Food/Category/Unit masters = ADMIN; Events = scoped (above); ledger/stock = ADMIN; users = ADMIN.
- IDOR: every event fetch/mutation goes through `loadEventForActor` (scope filter). Cross-admin access → 403, missing records → 404 (no existence leak).
- Executor committing a draft material → 403 `Only an ADMIN can add a draft material once stock is available.`
- ID param normalization on all hand-rolled routes; `.strict()` schemas reject unknown fields; quantities validated (`> 0`, finite).
- Integration tests cover: health, CORS, 404 envelope, RBAC (401/403), IDOR cross-scope denial, event status-machine legality, material planning without stock deduction.

## 5. Verification performed
- `npx prisma validate` ✓
- Backend: `npm run lint` ✓ (0 errors) · `npm run build` ✓ · `npx vitest run` → **32/32 pass** ✓
- Frontend: `npm run lint` → 0 errors (4 benign warnings: fast-refresh/export shape, unused disable directive) · `npm run build` ✓
- Browser smoke (shared dev tab): calendar month/week/day render; week/day hourly timelines positioned correctly for the seeded 3 events; full create→detail→calendar round trip (`Phase 5 Smoke Test`, EVT-2026-000004, PLANNING, then deleted); shortfall banner + lock + auto-draft + commit flow verified with Salt/Tomato/Basmati Rice lines; cancel confirmation; delete confirm.
- Inventory ledger read-only confirmed mid-flow (planning generated **zero** stock transactions; only the deliberate Stock In of 160 KG Basmati Rice appears).

## 6. Known limitations / honest notes
- **No notification engine.** Spec referenced “existing notification architecture” — none exists; building a second system is out of scope. Event create/update/cancel currently generate **audit log** entries, not in-app notifications. (Phase 6 candidate.)
- **No request approval flow** (issue/return/approval) — per Phase 4 non-goals; still open.
- **Executor “Add once in stock”** button state not visually re-verified this session (executor account password was rotated; commit path is covered by server-side role check + integration reasoning, not by a live executor click).
- **Tablet 768px / mobile 390–430px not rendered this session** — responsive behavior is CSS-only (grid collapse, `md:hidden`/`md:block` switches, agenda list) and was reviewed in code; only desktop browser was exercised live.
- **Event 409 on empty edit form submission** — nothing broken, unchanged behavior.
- **Server-side planning quantity cap** intentionally NOT added: Phase 4/5 design permits planned > on-hand (that *is* the shortfall/refill workflow). The cap exists at the **UI/commit** boundary only (commit requires fresh stock; Add Materials panel blocks short lines or routes them to draft).
- **Month cell overflow:** >3 events in a cell collapse to “+N more” link (never rendered all).
- **`EventCodeCounter`** race-safe via `upsert` + increment inside a transaction; not load-tested beyond dev usage.

## 7. Phase 6 recommendation
**Requests & Notifications engine (Issue / Approval / Return)** — the missing business flow that makes the inventory master, ledger, events, and dishes operationally useful: executor raises a material request against an event, admin approves/adjusts, stock is issued (first real consumption), returns reconcile shortages, and everyone gets notified in-app. Pair with the **stock-out at event completion** rule already implied by the audit trail (deduct on actual issue only).
