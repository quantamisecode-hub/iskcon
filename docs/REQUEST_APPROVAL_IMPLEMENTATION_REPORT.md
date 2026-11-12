# Material Request Approval & Issue — Implementation Report

> **Phase 7 · Approval / Issue implementation**
> Date: 10 November 2026
> Scope: executor request → admin approval → admin stock issue → executor visibility.
> Docs: [`REQUEST_APPROVAL_ISSUE_WORKFLOW.md`](./REQUEST_APPROVAL_ISSUE_WORKFLOW.md) · [`REQUEST_ROLE_PERMISSION_MATRIX.md`](./REQUEST_ROLE_PERMISSION_MATRIX.md) · [`REQUEST_STATE_MACHINE.md`](./REQUEST_STATE_MACHINE.md)

---

## 1. Outcome

Phase 7 is **implemented, tested and verified end-to-end in a live browser run.**

| Gate | Result |
|---|---|
| Backend tests | **4 files, 45/45 passing** — stable across 4 consecutive runs |
| Backend `typecheck` / `lint` | PASS / PASS (0 errors) |
| Frontend `tsc` + `vite build` | PASS |
| Frontend `lint` | 0 errors (11 pre-existing warnings, untouched) |
| Live E2E (executor → admin → executor) | PASS — see §7 |
| New migrations applied | `20261110044216_material_request_issue_timeline`, `20261110044500_backfill_request_item_quantities` |
| `prisma validate` / `generate` | PASS (client 6.19.3) |

Golden rule verified by both test and live run: **approval deducted nothing; only issue moved stock, and it moved exactly the issued quantity.**

---

## 2. THE CAN / NO MATRIX (explicit answer)

### ADMIN

| ADMIN can… | ADMIN cannot… |
|---|---|
| ✅ **View** requests and request detail within their scope | ❌ **Create** a material request — `POST /material-requests` is executor-only, `403`, no row written |
| ✅ **View** the item quantity table and the timeline | ❌ **Submit** a material request — `403` |
| ✅ **Approve** a request raised by an executor | ❌ **Approve** a request **they created** — `403` *"You cannot approve a material request you created."* |
| ✅ **Approve partially** (per-item `approvedQuantity`) | ❌ **Reject** a request they created — `403` (same self-decision guard) |
| ✅ **Reject** a request raised by an executor | ❌ **Issue** stock against a request that is not `APPROVED`/`PARTIALLY_ISSUED` — `409` |
| ✅ **Issue** stock (fully or in parts) against an approved request | ❌ **Issue more than approved** — `409`, no stock change |
| ✅ **Cancel** a draft/pending request | ❌ **Issue more than is in stock** — `409` *"Not enough stock"*, inventory never negative |
| ✅ **See** issued quantities, remaining quantities and status | ❌ **Issue** a non-integer, zero or negative quantity — `400` |
| ✅ **See** an immutable, append-only timeline | ❌ **Re-issue** an already fully issued request — `409` |
| ✅ **Receive** the executor's submission notification | ❌ **Edit or delete** a timeline entry — no API exists, `404` |
| ✅ **Act** on a request assigned to another admin's scope? **NO** — cross-admin approve/get/issue all return `403` | ❌ **Deduct stock anywhere except `issue`** — `approve()` performs no inventory write at all |

### EXECUTOR

| EXECUTOR can… | EXECUTOR cannot… |
|---|---|
| ✅ **Create** a material request for an event in their scope | ❌ **Create** a request with arbitrary food items, event ids or units — payload is constrained to `{ eventId, items: [{ eventMaterialId, requestedQuantity }] }` against **committed plan lines only** |
| ✅ **Select items** by checkbox and enter quantities (defaults to planned) | ❌ **Create** a request as an admin would — not applicable; they are the only role that can create |
| ✅ **Submit** their draft for approval | ❌ **Approve** any request — `403` |
| ✅ **Cancel** their own draft/pending request | ❌ **Reject** any request — `403` |
| ✅ **View** their requests, detail and full history | ❌ **Issue** stock — `403`; inventory proven unchanged after the attempt |
| ✅ **See approved and issued quantities** per item | ❌ **Issue** a request that is still pending — `409` |
| ✅ **See remaining (pending) quantity** per item | ❌ **Cancel** an approved or issued request — `409`, state machine forbids it |
| ✅ **See** the immutable timeline (`CREATED → SUBMITTED → APPROVED → PARTIALLY_ISSUED → ISSUED`) | ❌ **Edit or delete** a timeline entry — no API exists, `404` |
| ✅ **Receive** approve / partial-issue / full-issue notifications deep-linking to the request | ❌ **View** admin-only areas (`/inventory`, `/users`) — route guard renders the 403 page, verified live |
| ✅ **See** that no stock moved at approval (the timeline says so explicitly) | ❌ **Modify stock** in any way — they have no stock-writing endpoint at all |

**Summary:** ADMIN = authorise and issue, never request. EXECUTOR = request and observe, never authorise or issue. Neither role can approve a decision it originated, and only `issue` moves stock.

---

## 3. What was built

### 3.1 Schema (2 migrations, applied)

- `MaterialRequestItem` extended with `requestedQuantity`, `approvedQuantity`, `issuedQuantity`, `pendingQuantity`, `itemStatus`.
- New `MaterialRequestTimeline` — append-only (`id`, `requestId`, `action`, `fromStatus`, `toStatus`, `message`, `actorId`, `actorName`, `createdAt`). **No update/delete API.**
- Backfill migration populates quantities for pre-existing requests from their stored status, so historical rows are valid without being rewritten.

### 3.2 Backend

| Area | Change |
|---|---|
| Repository | Serializer emits quantities, `pendingQuantity`, `itemStatus`, `timeline`; `findById(id, client)` for use inside transactions; atomic `nextRequestCode` |
| Service | `create` (with items + plan-line validation), `submit`, `cancel`, `approve` (full + partial), `reject`, **`issue`** (locks, `STOCK_OUT`, timeline, audit, notification) |
| Controller | new `issue` handler |
| Routes | `POST /:id/issue` → `adminOnly` + body validation; approve/reject/issue validators |
| Validators | 7 status guards, `items[]`, `approveMaterialRequestSchema`, integer `issueMaterialRequestSchema` |
| Constants | `AUDIT_ACTIONS.STOCK_ISSUED`; `SOCKET_EVENT.MATERIAL_REQUEST_ISSUED` / `_PARTIALLY_ISSUED` |
| Notifications | `notificationTarget.ts` deep-links both new types to `/requests/:id` with action copy |

**Issue algorithm** (single transaction, lock order request → item → inventory):

1. `SELECT … FOR UPDATE` the request; require `APPROVED` or `PARTIALLY_ISSUED`.
2. Per item: lock the item, require `quantity ≤ pending`.
3. Lock `Inventory`, require `currentQuantity ≥ quantity` → **never negative**.
4. Decrement inventory, accumulate `issuedQuantity`, insert `STOCK_OUT` ledger row (`referenceType = MATERIAL_REQUEST_ISSUE`, `referenceId = requestId`) with `balanceAfter`.
5. Recompute request status (`APPROVED → PARTIALLY_ISSUED → ISSUED`), append timeline, write audit + notification.
6. Commit, **then** emit sockets.

### 3.3 Frontend

- `requests.api.ts` — types for quantities/timeline + `create` / `approve` / `issue` payloads.
- `EventDetailPage.tsx` — executor create modal with **per-line checkbox + quantity inputs** (default = planned), select-all, validation, in-stock and planned columns, explicit *"No stock is deducted"* copy. Sends `items`. Admin create button still hidden.
- `RequestDetailPage.tsx` — 6-column item table (Material · Requested · Approved · Issued · Remaining · Status), `canIssue` gating, `IssueModal` with per-item inputs + live preview (*"issue 4 … current stock 116"*), immutable `Timeline` with legacy fallback.
- `RequestsPage.tsx` — status badges and filters for `APPROVED` / `PARTIALLY_ISSUED` / `ISSUED`.
- `socketClient.ts` / `notificationTarget.ts` — mappings for both new events.

---

## 4. Defects found during QA (reproduce → root cause → fix → retest)

**D1 — `approve` with an empty body returned `400`.**
- *Reproduce:* `POST /:id/approve` with no payload.
- *Root cause:* Express 5 leaves `req.body` `undefined` for body-less POSTs; the strict schema rejected `undefined`.
- *Fix:* `validateBody` normalises `req.body ?? {}` before parsing — all-optional schemas accept an empty POST, schemas with required fields still fail.
- *Retest:* approve-all works; required-field schemas still `400`. Regression: full suite green.

**D2 — `POST /events` intermittently `500` (duplicate PRIMARY key).**
- *Reproduce:* parallel event creation (visible under test workers; would hit two admins in production).
- *Root cause:* Prisma's `upsert` falls back to SELECT-then-INSERT when no native path exists, racing on the counter's PRIMARY key.
- *Fix:* raw MySQL `INSERT … ON DUPLICATE KEY UPDATE` in both `nextEventCode` and `nextRequestCode` — the row lock held to commit serialises concurrent creators.
- *Retest:* concurrent-code test passes; no recurrence across 4 runs.

**D3 — one-off suite failure from cross-file interference.**
- *Reproduce:* full suite (4 files in parallel on one test DB).
- *Root cause:* `events.test.ts` cleanup ran unscoped `event.deleteMany()` / `inventoryTransaction.deleteMany()`, cascading away another suite's in-flight fixtures mid-test.
- *Fix:* scoped every cleanup to each file's own created IDs.
- *Retest:* **4 consecutive clean runs, 45/45.**

**D4 — `Event Date` rendered as a raw ISO string** (`2026-11-11T00:00:00.000Z`) on the request detail page.
- *Reproduce:* open any request detail.
- *Root cause:* `InfoRow` was given the raw `eventDate` instead of a formatted date, unlike the list pages.
- *Fix:* format with `toLocaleDateString('en-GB', { day, month, year })`.
- *Retest:* now renders **"11 November 2026"**; `tsc` + build + lint clean.

**D5 — QA test helper bugs (test-only).**
- `createTestUser` generated a password the caller never knew → login `401`; fixed by passing the password in.
- `GET /:id` wraps its payload as `{ request }`; assertions were reading `body.data.*` → fixed to `body.data.request.*`.
- `notification` model uses `userId`, not `recipientId` → corrected.
- *Retest:* 10/10 in the new file, then 45/45 suite-wide.

No validation or security was weakened to make a test pass, and no mock was used in place of the real database.

---

## 5. Test evidence

### Acceptance (§77)

`backend/tests/material-request-issue.test.ts`

1. **Issue 30 then 20 → stock 100 → 70 → 50**, status `APPROVED → PARTIALLY_ISSUED → ISSUED`; approval asserted to leave stock at 100.
2. Executor sees issued quantities and timeline `['CREATED','SUBMITTED','APPROVED','PARTIALLY_ISSUED','ISSUED']`, with actor and message.
3. Ledger: 2 `STOCK_OUT` rows `[30, 20]`, balances `[70, 50]`, `referenceType = MATERIAL_REQUEST_ISSUE`.
4. Executor notification `MATERIAL_REQUEST_ISSUED` present.
5. **Timeline append-only** — earlier entries byte-identical (id, action, message, timestamp) after a later issue; `PUT`/`DELETE` → `404`.

### Negative (§78)

6. ADMIN create → `403`, `materialRequest.count == 0`.
7. EXECUTOR issue → `403`, stock unchanged, status still `APPROVED`.
8. Cross-admin approve/get/issue → `403`, stock unchanged.
9. Self-approve → `403` with the explicit message.
10. Over-issue (> approved) → `409`, stock unchanged, `issuedQuantity` still 0.
11. Insufficient stock → `409`, stock unchanged (**never negative**), then a fitting quantity succeeds (`PARTIALLY_ISSUED`).
12. Non-integer / zero / negative → `400`, stock unchanged.
13. Issue-while-pending and re-issue-after-full → `409`.

Plus the pre-existing 35 tests (auth/RBAC, events, material-request RBAC) — **45/45 total**.

---

## 6. Separation of duties — enforcement layers

| Layer | Mechanism |
|---|---|
| Route | `requireRole(EXECUTOR)` on create/submit; `requireRole(ADMIN)` on approve/reject/issue |
| Service | scope checks (event/request must be in the actor's admin scope); **self-decision guard** (approver ≠ requester) |
| Transaction | `SELECT … FOR UPDATE` prevents concurrent over-issue; status guard prevents issuing an unapproved request |
| Data | `InventoryTransaction` written only by `issue()`; `approve()` contains no inventory write |
| UI | buttons/routes hidden per role — **UX only, never the boundary** |

Every rule in §2 is tested by calling the API directly with the wrong session cookie, so the frontend cannot be the thing keeping the rule true.

---

## 7. Live end-to-end verification (10 Nov 2026)

Accounts: executor `qa-phase7@dev.local` (minted by `backend/scripts/mint-qa-executor.ts`, additive only), admin `vishnu@iskcon.com`.
Event `EVT-2026-000003` "Iskcon Mela" — 2 committed lines (Cooking Oil 24 L, Moong Dal 1 KG).

| Step | Actor | Observed |
|---|---|---|
| Header layout | executor | profile (name, role below) → Log out → bell ✓ |
| Open create modal | executor | 2 plan lines, select-all checked, defaults = planned, stock shown |
| Uncheck Moong Dal | executor | row input disabled, counter "1 of 2 lines selected" |
| Set Cooking Oil = 10, notes, create | executor | `REQ-2026-000004` `DRAFT`, **stock still 120** |
| Submit | executor | `PENDING APPROVAL`, timeline `CREATED → SUBMITTED`, submit button gone |
| Login as admin | admin | dashboard "PENDING REQUESTS 1", 1 unread notification |
| Open request | admin | Reject / Approve buttons present |
| Approve | admin | timeline *"Request approved. No stock has been deducted."*, button becomes **Issue Stock**, **stock still 120** |
| Open issue modal | admin | approved 10, issued 0, remaining 10, **in stock 120** |
| Issue 4 | admin | `PARTIALLY ISSUED`, stock 116, timeline *"Partially issued: 4 L Cooking Oil"* |
| Issue 6 | admin | `ISSUED`, stock 110, timeline *"All approved quantities issued. 6 L"* |
| Executor re-login | executor | `ISSUED` badge, table 10/10/10/0, **full 5-entry timeline, zero action buttons**, 3 unread notifications |
| Executor → `/inventory` | executor | **403 "Access denied"** page |

DB readout afterwards: `stock 110`, ledger `4 → 116`, `6 → 110` (both `STOCK_OUT` / `MATERIAL_REQUEST_ISSUE`), `status ISSUED`, quantities `10/10/10`, timeline all 5 actions, 4 notifications (`SUBMITTED`, `APPROVED`, `PARTIALLY_ISSUED`, `ISSUED`).

---

## 8. Design decisions

1. **Approval reserves nothing.** Deliberate: a reservation is a silent stock movement and would break the golden rule. Two approved requests can compete for the same stock; the loser gets `409` and must re-plan.
2. **Issue quantities are positive whole numbers** (`Number.isInteger`) because the pre-existing `Inventory.currentQuantity` is `Int`. Documented limitation; plan/request sides still accept decimals.
3. **`transactionType` stays `STOCK_OUT`** with `referenceType = MATERIAL_REQUEST_ISSUE` / `referenceId = requestId`, so the existing ledger UI keeps working while issues remain traceable to their request.
4. **Partial approval is optional** — `approve {}` approves everything; supplying `approvedQuantity` per line enables partial approval, and `0` rejects that line. All-zero → `400`.
5. **Legacy requests fall back to a display-only derived timeline** rather than being backfilled, so history is never rewritten.
6. **The planning architecture was kept** (admin configures event-dish material plan; executor requests against committed lines) instead of restructuring to a `DishMaterial` master — configuration, request and issue stay three distinct layers.

---

## 9. Not done / blocked

- **Real deployment & production smoke test** — awaiting real domains, SSH/hosting credentials and production MySQL. All changes are local; no git repo exists, so nothing is committed.
- **Stale seeded `executor@dev.local` still has DB role `ADMIN`** (the seed uses `update:{}`). Workaround is the new `qa-phase7@dev.local` executor account. *Decision needed from you:* restore the original row, or leave it and rely on the QA account.
- `prisma migrate dev` cannot run while the backend dev server holds the query-engine DLL — stop the process on `:5000` first, then `generate`.
- Production placeholder domains remain `YOUR_DOMAIN` / `YOUR_FRONTEND_DOMAIN`.
