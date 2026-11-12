# Material Request — Approval & Issue Workflow

> **Phase 7 · Request → Approval → Issue**
> Status: implemented, tested (45/45), verified end-to-end in the browser.
> Related: [`REQUEST_STATE_MACHINE.md`](./REQUEST_STATE_MACHINE.md) · [`REQUEST_ROLE_PERMISSION_MATRIX.md`](./REQUEST_ROLE_PERMISSION_MATRIX.md) · [`REQUEST_APPROVAL_IMPLEMENTATION_REPORT.md`](./REQUEST_APPROVAL_IMPLEMENTATION_REPORT.md)

---

## 1. Purpose

A material request is an executor's ask for physical stock to run an event. The workflow exists to enforce **separation of duties**: the person who asks is never the person who authorises, and the person who authorises never touches stock by accident.

The single most important rule in this workflow:

> **APPROVAL NEVER DEDUCTS STOCK. ONLY AN ACTUAL ISSUE DOES.**

Approval is a *promise* — it reserves nothing and moves nothing. Stock only leaves the store when an admin explicitly issues it, in a transaction that is atomic and concurrency-safe.

---

## 2. Actors

| Actor | Role | Can do |
|---|---|---|
| Executor | `EXECUTOR` | Create, submit, cancel, **view** requests assigned to their admin scope |
| Admin | `ADMIN` | Approve, reject, issue, cancel, **view** requests in their scope |

An admin can **never** create a request, and can never approve/reject a request they created. See [`REQUEST_ROLE_PERMISSION_MATRIX.md`](./REQUEST_ROLE_PERMISSION_MATRIX.md) for the full CAN/NO matrix.

---

## 3. Where requests come from — the three-layer model

The architecture deliberately keeps configuration, request and issue as separate concerns:

```
LAYER 1 — CONFIGURATION (admin, planning time)
  Event → EventDish → EventMaterial (plannedQuantity, unit, isDraft)
  "We intend to use 24 L of Cooking Oil for Dal at Iskcon Mela."
  No inventory impact. Draft lines (isDraft) are unmet shortfalls, parked
  until an admin commits them.

LAYER 2 — REQUEST (executor, before the event)
  MaterialRequest → MaterialRequestItem (requestedQuantity)
  "Please release 10 L of Cooking Oil for that plan."
  No inventory impact.

LAYER 3 — ISSUE (admin, at the store)
  InventoryTransaction (STOCK_OUT) + Inventory.currentQuantity decrement
  "Here are the 10 L — they have physically left the store."
  THIS is the only layer that touches stock.
```

The executor's UI is deliberately constrained to Layer 1: they pick **checkboxes on lines that already exist in the committed plan** and enter a quantity. They cannot type an arbitrary food item, an arbitrary event id, or an arbitrary unit. The request payload is `{ eventId, items: [{ eventMaterialId, requestedQuantity }] }`.

---

## 4. The workflow, step by step

### 4.1 Create (executor, `EXECUTOR` only)

`POST /api/v1/material-requests`

- Body: `{ eventId, notes?, items: [{ eventMaterialId, requestedQuantity }] }`
- Every `eventMaterialId` must belong to `eventId` and be a **committed** (non-draft) plan line.
- `requestedQuantity` must be > 0.
- Server assigns `requestCode` (`REQ-YYYY-NNNNNN`, atomic per-year counter) and the event's `adminId` as the assigned admin.
- Status: **`DRAFT`**.
- Timeline entry: `CREATED`.
- **Stock unchanged.**

An admin hitting this endpoint receives `403 FORBIDDEN` — and no row is written.

### 4.2 Submit (executor)

`POST /api/v1/material-requests/:id/submit`

- `DRAFT` → **`PENDING_APPROVAL`**.
- Sets `submittedAt`.
- Timeline entry: `SUBMITTED`.
- Notification → assigned admin: `MATERIAL_REQUEST_SUBMITTED`.
- Socket: `material-request:submitted`.
- **Stock unchanged.**

### 4.3 Approve (admin, `ADMIN` only)

`POST /api/v1/material-requests/:id/approve`

- Guard: requester ≠ approver. An admin approving their own request gets `403` — *"You cannot approve a material request you created."*
- Body: `{}` (approve everything) or `{ items: [{ itemId, approvedQuantity }] }` for **partial approval**.
  - `approvedQuantity` defaults to the full `requestedQuantity`.
  - `approvedQuantity = 0` rejects that individual line.
  - Approving everything to zero is rejected with `400`.
- Per item: `approvedQuantity` recorded, `pendingQuantity = approved − issued`.
- Status: `PENDING_APPROVAL` → **`APPROVED`** (or `REJECTED` if the admin rejects instead).
- Timeline entry: `APPROVED`, message: *"Request approved. **No stock has been deducted.**"*
- Notification → requester: `MATERIAL_REQUEST_APPROVED`.
- Socket: `material-request:approved`.
- **Stock unchanged — verified by test and by live run (120 L before and after approval).**

### 4.4 Issue (admin, `ADMIN` only) — the ONLY place stock moves

`POST /api/v1/material-requests/:id/issue`

- Body: `{ items: [{ itemId, quantity }] }`, `quantity` a **positive integer**.
- Preconditions, all checked inside one DB transaction:
  1. Request status must be `APPROVED` or `PARTIALLY_ISSUED` (otherwise `409`).
  2. `quantity ≤ pendingQuantity` (over-issue → `409`, no stock change).
  3. `Inventory.currentQuantity ≥ quantity` (insufficient stock → `409` *"Not enough stock"*, stock never goes negative).
- **Concurrency control:**
  - `SELECT … FOR UPDATE` on the `MaterialRequest` row — serialises concurrent issues of the same request.
  - then `SELECT … FOR UPDATE` on each touched `Inventory` row — serialises concurrent drains of the same stock.
  - All reads, checks, writes and the ledger insert happen in a **single transaction**; anything failing rolls the whole thing back.
- Effects, atomically:
  - `Inventory.currentQuantity -= quantity`
  - `InventoryTransaction` row: `transactionType = STOCK_OUT`, `referenceType = MATERIAL_REQUEST_ISSUE`, `referenceId = requestId`, `quantity`, `balanceAfter`
  - `MaterialRequestItem.issuedQuantity += quantity`, `pendingQuantity -= quantity`, `itemStatus`
  - Request status → **`PARTIALLY_ISSUED`** (some pending remains) or **`ISSUED`** (nothing pending), `issuedAt` set on completion
  - Timeline entry `PARTIALLY_ISSUED` / `ISSUED`
  - Notification → requester: `MATERIAL_REQUEST_PARTIALLY_ISSUED` / `MATERIAL_REQUEST_ISSUED`
  - Audit log: `STOCK_ISSUED`
- Sockets are emitted **after commit**, so no client ever sees a state that was later rolled back.

### 4.5 Reject / Cancel

- `POST /:id/reject` — admin only; `PENDING_APPROVAL` → `REJECTED`, timeline `REJECTED`, notification `MATERIAL_REQUEST_REJECTED`. No stock movement.
- `POST /:id/cancel` — executor (owner) only, while still `DRAFT`/`PENDING_APPROVAL`. Timeline `CANCELLED`.

---

## 5. Quantities on each item

| Field | Meaning |
|---|---|
| `requestedQuantity` | what the executor asked for |
| `approvedQuantity` | what the admin authorised (≤ requested) |
| `issuedQuantity` | what has physically left the store |
| `pendingQuantity` | `approved − issued`, what is still owed |
| `issuedQuantity` | cumulative, monotonic — never decreases |
| `itemStatus` | `REQUESTED` → `APPROVED` → `PARTIALLY_ISSUED` → `ISSUED` (or `REJECTED`) |

Invariant enforced by tests: `requested ≥ approved ≥ issued ≥ 0` and `pending = approved − issued`.

Request status is **derived from its items**, never stored independently of them:

```
all items REJECTED                → REJECTED
nothing issued yet                → APPROVED
some issued, some pending         → PARTIALLY_ISSUED
nothing pending                   → ISSUED
```

---

## 6. Executor visibility

The executor sees the same detail page as the admin, minus every mutating control:

- 6-column item table: **Material · Requested · Approved · Issued · Remaining · Status**
- Status badge, including `PARTIALLY ISSUED` and `ISSUED`
- The **immutable timeline**
- Notifications for approve / partial-issue / full-issue

They see **no** Approve, Reject or Issue Stock button — and the API refuses those calls regardless (`403`), because frontend permissions are UX only.

---

## 7. The timeline is append-only

`MaterialRequestTimeline` rows are written once and never updated or deleted:

- There is **no** update or delete API for timeline entries (`PUT`/`DELETE` on the request return `404`).
- Each entry: `action`, `fromStatus`, `toStatus`, `message`, `actorId`, `actorName`, `createdAt`.
- Earlier entries keep their exact id, action, message and timestamp after later issues — asserted byte-for-byte in tests.
- Legacy requests created before Phase 7 have no stored rows; they fall back to a **display-only** derived timeline so old records still read sensibly. Nothing is backfilled into the table, so history is never rewritten.

---

## 8. Notifications & audit

| Event | Notification type | Recipient | Socket |
|---|---|---|---|
| Submit | `MATERIAL_REQUEST_SUBMITTED` | assigned admin | `material-request:submitted` |
| Approve | `MATERIAL_REQUEST_APPROVED` | requester | `material-request:approved` |
| Reject | `MATERIAL_REQUEST_REJECTED` | requester | `material-request:rejected` |
| Cancel | `MATERIAL_REQUEST_CANCELLED` | counterparty | `material-request:cancelled` |
| Partial issue | `MATERIAL_REQUEST_PARTIALLY_ISSUED` | requester | `material-request:partially-issued` |
| Full issue | `MATERIAL_REQUEST_ISSUED` | requester | `material-request:issued` |

Every notification deep-links to `/requests/:id` via `notificationTarget()` — no dead ends. Audit action `STOCK_ISSUED` records who issued what.

Notifications and sockets are only emitted for **successful** state changes; a `409` over-issue produces no notification and no audit row.

---

## 9. Verified end-to-end (live run, 10 Nov 2026)

Executor `qa-phase7@dev.local` → admin `vishnu@iskcon.com`, event `EVT-2026-000003` (Iskcon Mela), request `REQ-2026-000004`:

| Step | Result | Cooking Oil stock |
|---|---|---|
| Executor creates (10 L selected, Moong Dal unchecked) | `DRAFT` | **120 L** |
| Executor submits | `PENDING_APPROVAL` | **120 L** |
| Admin approves (10 L) | `APPROVED` — *"No stock has been deducted"* | **120 L** |
| Admin issues 4 L | `PARTIALLY_ISSUED` | **116 L** |
| Admin issues 6 L | `ISSUED` | **110 L** |

Database readout after the run:

```json
{
  "cookingOilStock": 110,
  "ledger": [
    { "qty": 4,  "balanceAfter": 116, "type": "STOCK_OUT", "ref": "MATERIAL_REQUEST_ISSUE" },
    { "qty": 6,  "balanceAfter": 110, "type": "STOCK_OUT", "ref": "MATERIAL_REQUEST_ISSUE" }
  ],
  "status": "ISSUED",
  "items": [{ "requested": "10", "approved": "10", "issued": "10" }],
  "timeline": ["CREATED","SUBMITTED","APPROVED","PARTIALLY_ISSUED","ISSUED"],
  "notifications": ["MATERIAL_REQUEST_PARTIALLY_ISSUED","MATERIAL_REQUEST_ISSUED",
                    "MATERIAL_REQUEST_APPROVED","MATERIAL_REQUEST_SUBMITTED"]
}
```

Exactly 10 L left the store, only after issue. The executor's detail page showed the full timeline and all quantities, with zero mutating buttons; hitting `/inventory` as an executor rendered the 403 page.

---

## 10. Known limitations

- **Issue quantities are positive whole numbers.** `Inventory.currentQuantity` is a Prisma `Int`, so fractional issues would truncate. The plan/request side allows decimals; only the issue step is integral.
- **One open request per event** while a request is `DRAFT` / `PENDING_APPROVAL` / `APPROVED` / `PARTIALLY_ISSUED`, so two requests can't race for the same plan.
- **No reservation on approval.** Because approval deducts nothing, two approved requests can compete for the same stock; the second to issue gets a `409` and must be re-planned. This is intentional — a reservation would be a silent stock movement.
