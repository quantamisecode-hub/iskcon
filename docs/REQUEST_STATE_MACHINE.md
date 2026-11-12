# Material Request — State Machine

> **Phase 7 · Statuses, transitions and derived state**
> Companion to [`REQUEST_APPROVAL_ISSUE_WORKFLOW.md`](./REQUEST_APPROVAL_ISSUE_WORKFLOW.md) and [`REQUEST_ROLE_PERMISSION_MATRIX.md`](./REQUEST_ROLE_PERMISSION_MATRIX.md).

---

## 1. Request-level states

```
                    (executor creates)
                            │
                            ▼
                       ┌─────────┐
                       │  DRAFT  │
                       └────┬────┘
                 submit │        │ cancel
                        ▼        ▼
            ┌──────────────────┐  ┌───────────┐
            │ PENDING_APPROVAL │  │ CANCELLED │ (terminal)
            └───────┬──────┬───┘  └───────────┘
        approve │        │ reject
                ▼        ▼
        ┌────────────┐  ┌───────────┐
        │  APPROVED  │  │ REJECTED  │ (terminal)
        └─────┬──────┘  └───────────┘
              │ issue (partial)
              ▼
     ┌───────────────────┐
     │ PARTIALLY_ISSUED  │ ◄──┐
     └─────┬─────────────┘    │ issue (remaining)
           │    issue (rest) ─┘
           ▼
      ┌─────────┐
      │  ISSUED │ (terminal)
      └─────────┘
```

`CANCELLED` and `REJECTED` are terminal. `ISSUED` is terminal. There is no transition out of a terminal state, and no transition that re-opens a request.

---

## 2. Transition table

| # | From | To | Actor | Trigger | Guard | Stock effect |
|---|---|---|---|---|---|---|
| 1 | — | `DRAFT` | EXECUTOR | `POST /material-requests` | role + valid committed plan lines | **none** |
| 2 | `DRAFT` | `PENDING_APPROVAL` | EXECUTOR | `POST /:id/submit` | owner/scope | **none** |
| 3 | `DRAFT` | `CANCELLED` | EXECUTOR (owner) / ADMIN | `POST /:id/cancel` | owner or admin scope | **none** |
| 4 | `PENDING_APPROVAL` | `CANCELLED` | EXECUTOR (owner) / ADMIN | `POST /:id/cancel` | owner or admin scope | **none** |
| 5 | `PENDING_APPROVAL` | `APPROVED` | **ADMIN** | `POST /:id/approve` | admin + **not self** | **none** |
| 6 | `PENDING_APPROVAL` | `REJECTED` | **ADMIN** | `POST /:id/reject` | admin + **not self** | **none** |
| 7 | `APPROVED` | `PARTIALLY_ISSUED` | **ADMIN** | `POST /:id/issue` | admin, `qty ≤ pending`, `qty ≤ stock` | **deduct** |
| 8 | `APPROVED` | `ISSUED` | **ADMIN** | `POST /:id/issue` | admin, all pending issued, stock sufficient | **deduct** |
| 9 | `PARTIALLY_ISSUED` | `PARTIALLY_ISSUED` | **ADMIN** | `POST /:id/issue` | admin, more pending remains | **deduct** |
| 10 | `PARTIALLY_ISSUED` | `ISSUED` | **ADMIN** | `POST /:id/issue` | admin, last pending issued | **deduct** |

**Rows 1–6 never touch inventory. Only rows 7–10 deduct stock.** This is the single most important property of the machine.

Any transition not listed is invalid and returns `409 CONFLICT` — for example approving a `DRAFT`, issuing a `PENDING_APPROVAL`, cancelling an `ISSUED`, or issuing an already-`ISSUED` request.

---

## 3. Item-level states

Each `MaterialRequestItem` carries its own state, and the request state is **derived** from them:

```
REQUESTED ──approve──► APPROVED ──issue partial──► PARTIALLY_ISSUED ──issue rest──► ISSUED
    │                                                                                
    └──rejected (approvedQuantity = 0)──► REJECTED
```

| Item field | Invariant |
|---|---|
| `requestedQuantity` | > 0, fixed at creation, never rewritten |
| `approvedQuantity` | `0 ≤ approved ≤ requested` |
| `issuedQuantity` | `0 ≤ issued ≤ approved`, **monotonic non-decreasing** |
| `pendingQuantity` | `= approved − issued` |
| `itemStatus` | derived from the three quantities above |

### Derivation rule (request status ← items)

```
let approved   = items where approvedQuantity > 0
let issuedSum  = Σ issuedQuantity
let pendingSum = Σ pendingQuantity

approved is empty                        → REJECTED
issuedSum == 0                           → APPROVED
pendingSum > 0 && issuedSum > 0          → PARTIALLY_ISSUED
pendingSum == 0 && issuedSum > 0         → ISSUED
```

The stored request status is always recomputed from the items inside the same transaction as the quantity update, so the two can never disagree.

---

## 4. Multi-item and partial flows

A request holds many items; each progresses independently.

**Partial approval** (`approve` with per-item `approvedQuantity`):

```json
{ "items": [ { "itemId": "…", "approvedQuantity": 40 }, { "itemId": "…", "approvedQuantity": 0 } ] }
```

- First line: approved 40 of 50 → pending 40.
- Second line: approved 0 → line is rejected; if **all** lines are 0 the whole call is `400`.

**Partial then full issue** (the canonical sequence from the spec):

| Step | Request | Item quantities | Stock |
|---|---|---|---|
| create + submit | `PENDING_APPROVAL` | req 50, app 0, iss 0, pend 0 | 100 |
| approve | `APPROVED` | req 50, app 50, iss 0, pend 50 | **100 (unchanged)** |
| issue 30 | `PARTIALLY_ISSUED` | iss 30, pend 20 | **70** |
| issue 20 | `ISSUED` | iss 50, pend 0 | **50** |

This exact sequence is asserted in `material-request-issue.test.ts`.

---

## 5. Concurrency & atomicity

Two independent races must be impossible:

1. **Two issues of the same request** — both would read `pending = 50` and each issue 50, over-releasing stock.
2. **Two issues of the same food item** — both would read `stock = 100` and each deduct 90, driving it negative.

Both are closed by lock ordering inside one transaction:

```
BEGIN
  SELECT ... FROM MaterialRequest WHERE id = ? FOR UPDATE      -- (1) request lock
  validate status ∈ {APPROVED, PARTIALLY_ISSUED}
  for each item:
    SELECT ... FROM MaterialRequestItem WHERE id = ? FOR UPDATE
    validate quantity <= pendingQuantity
    SELECT ... FROM Inventory WHERE foodItemId = ? FOR UPDATE   -- (2) inventory lock
    validate currentQuantity >= quantity                        -- never negative
    UPDATE Inventory      SET currentQuantity = currentQuantity - quantity
    UPDATE MaterialRequestItem SET issuedQuantity = issuedQuantity + ?, pendingQuantity = pendingQuantity - ?
  INSERT InventoryTransaction (STOCK_OUT, MATERIAL_REQUEST_ISSUE, requestId, quantity, balanceAfter)
  recompute request status; INSERT MaterialRequestTimeline
  INSERT AuditLog (STOCK_ISSED) ; INSERT Notification(s)
COMMIT
-- sockets emitted only after COMMIT
```

Lock order is always **request → item → inventory**, so two transactions cannot deadlock by waiting on each other. Any failed validation throws before any write, or rolls everything back — leaving stock, quantities, status and timeline exactly as they were.

The `409` paths (over-issue, insufficient stock, wrong status) therefore leave **zero** partial effects, and emit **no** notification, audit row or socket.

---

## 6. Timeline states

The timeline is an append-only log, one row per transition:

| Action | When | Message (example) |
|---|---|---|
| `CREATED` | transition 1 | "Request REQ-2026-000004 created for Iskcon Mela." |
| `SUBMITTED` | transition 2 | "Request submitted for Admin approval." |
| `APPROVED` | transition 5 | "Request approved. **No stock has been deducted.**" |
| `REJECTED` | transition 6 | rejection reason |
| `CANCELLED` | transitions 3–4 | cancellation reason |
| `PARTIALLY_ISSUED` | transitions 7, 9 | "Partially issued: 4 L Cooking Oil. Remaining quantities are still pending." |
| `ISSUED` | transitions 8, 10 | "All approved quantities issued. 6 L Cooking Oil issued from stock." |

Each row stores `fromStatus`, `toStatus`, `actorId`, `actorName`, `createdAt`.

**Append-only guarantees:**

- No update or delete endpoint exists for timeline rows; `PUT` / `DELETE` on the request return `404`.
- A later issue appends a row and leaves every earlier row byte-identical (id, action, message, timestamp) — asserted in tests.
- Requests that predate Phase 7 have no stored rows. They render a **display-only derived** timeline; nothing is written back, so historical records are never rewritten.

---

## 7. Observed sequence — live run, 10 Nov 2026

`REQ-2026-000004` (event `EVT-2026-000003`, 10 L Cooking Oil):

```
CREATED            11:00  executor   stock 120
SUBMITTED          11:01  executor   stock 120
APPROVED           11:03  admin      stock 120   ← approval moved nothing
PARTIALLY_ISSUED   11:05  admin      stock 116   ← issued 4 L
ISSUED             11:06  admin      stock 110   ← issued 6 L
```

Final stored state: `status = ISSUED`, `requested 10 / approved 10 / issued 10`, ledger `4 → 116`, `6 → 110`, all `STOCK_OUT` / `MATERIAL_REQUEST_ISSUE`.
