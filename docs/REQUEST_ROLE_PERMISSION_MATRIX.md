# Material Request — Role & Permission Matrix

> **Phase 7 · Who can do what**
> Companion to [`REQUEST_APPROVAL_ISSUE_WORKFLOW.md`](./REQUEST_APPROVAL_ISSUE_WORKFLOW.md) and [`REQUEST_STATE_MACHINE.md`](./REQUEST_STATE_MACHINE.md).
> The same matrix in question/answer form is repeated in [`REQUEST_APPROVAL_IMPLEMENTATION_REPORT.md`](./REQUEST_APPROVAL_IMPLEMENTATION_REPORT.md) §"CAN / NO matrix".

---

## 1. The two roles

There are exactly **two** roles in this system. No third role was introduced.

| Role | Constant | Scope |
|---|---|---|
| Administrator | `ROLES.ADMIN` | Approves, rejects, issues. Sees requests for events they admin. |
| Executor | `ROLES.EXECUTOR` | Creates and submits requests. Sees requests raised against their admin scope. |

Enforcement is **server-side at three layers**, in this order:

1. **Route middleware** — `requireRole(ROLES.EXECUTOR)` / `requireRole(ROLES.ADMIN)` on the mutating routes. Wrong role → `403 FORBIDDEN` before any handler runs.
2. **Service guards** — scope checks (does this event/request belong to this actor's admin scope?) and the **self-decision guard** (an admin may not approve/reject a request they created).
3. **UI** — buttons and routes hidden for the wrong role.

Layer 3 is **UX only**. Hiding a button is never the security boundary; every rule below is enforced by layers 1 and 2 and proven by tests that call the API directly with the wrong cookie.

---

## 2. CAN / NO matrix — the authoritative table

### ADMIN

| Action | ADMIN | Why |
|---|---|---|
| View requests in their scope | **CAN** | Read is allowed for both roles within scope |
| View request detail + timeline | **CAN** | Same |
| **Create** a material request | **NO** | `POST /material-requests` is `executorOnly` → `403`. Creating a request you could approve is a conflict of interest. No row is written. |
| **Submit** a material request | **NO** | `POST /:id/submit` is `executorOnly` → `403` |
| **Approve** a request someone else raised | **CAN** | `POST /:id/approve` is `adminOnly` |
| **Approve** a request **they created** | **NO** | Self-decision guard → `403` *"You cannot approve a material request you created."* |
| Approve a request raised by another admin | **NO** | Not reachable — creation is executor-only; the guard still covers legacy rows |
| **Reject** a request | **CAN** (others') | `adminOnly` + self-decision guard |
| **Reject** a request they created | **NO** | Self-decision guard → `403` |
| **Issue** stock against an approved request | **CAN** | `POST /:id/issue` is `adminOnly` |
| **Issue** a request they created | **NO** | Blocked upstream — they cannot create or approve it; issue still requires `APPROVED`, which they cannot grant |
| Issue more than approved | **NO** | `409` inside the transaction, no stock change |
| Issue more than is in stock | **NO** | `409` *"Not enough stock"*, inventory never goes negative |
| **Cancel** a request | **CAN** | adminOnly |
| Delete/edit a timeline entry | **NO** | No such API exists; `PUT`/`DELETE /:id` → `404` |
| Create events, dishes, food items, users | **CAN** | Outside this workflow — unchanged Phase 4/5/6 permissions |

### EXECUTOR

| Action | EXECUTOR | Why |
|---|---|---|
| View their own requests + detail | **CAN** | Read within their admin scope |
| View issued quantities + timeline | **CAN** | Core Phase 7 requirement |
| **Create** a material request | **CAN** | `executorOnly` route |
| Create against arbitrary items/events/units | **NO** | Payload is `{ eventId, items: [{ eventMaterialId, requestedQuantity }] }`; every `eventMaterialId` must be a committed line of that event. Arbitrary food items, event ids and units are rejected by validation. |
| **Submit** their own request | **CAN** | `executorOnly` route |
| **Approve** any request | **NO** | `POST /:id/approve` is `adminOnly` → `403` |
| **Reject** any request | **NO** | `adminOnly` → `403` |
| **Issue** stock | **NO** | `POST /:id/issue` is `adminOnly` → `403`; inventory proven untouched after the attempt |
| **Cancel** their own draft/pending request | **CAN** | Owner-only guard in the service |
| Cancel an approved/issued request | **NO** | State machine forbids it → `409` |
| View `/inventory`, `/users` (admin routes) | **NO** | Route guard → renders the 403 "Access denied" page (verified live) |
| Edit or delete a timeline entry | **NO** | No API exists → `404` |

---

## 3. Route → middleware map

| Method | Path | Middleware |
|---|---|---|
| `GET` | `/api/v1/material-requests` | `authenticate` (both roles, service scopes) |
| `GET` | `/api/v1/material-requests/:id` | `authenticate` (both roles, service scopes) |
| `POST` | `/api/v1/material-requests` | `authenticate` + `requireRole(EXECUTOR)` |
| `POST` | `/api/v1/material-requests/:id/submit` | `authenticate` + `requireRole(EXECUTOR)` |
| `POST` | `/api/v1/material-requests/:id/approve` | `authenticate` + `requireRole(ADMIN)` + body validation |
| `POST` | `/api/v1/material-requests/:id/reject` | `authenticate` + `requireRole(ADMIN)` + body validation |
| `POST` | `/api/v1/material-requests/:id/issue` | `authenticate` + `requireRole(ADMIN)` + body validation |
| `POST` | `/api/v1/material-requests/:id/cancel` | `authenticate` (owner/scope guard in service) |
| `PUT` / `DELETE` | `/api/v1/material-requests/:id` | **not registered** → `404` |

---

## 4. Golden rules and where each is enforced

| Golden rule | Enforced at | Test |
|---|---|---|
| Only EXECUTOR creates/submits | Route `requireRole(EXECUTOR)` | admin create → `403`, no row |
| Only ADMIN approves/rejects | Route `requireRole(ADMIN)` | executor approve → `403` |
| Only ADMIN issues | Route `requireRole(ADMIN)` | executor issue → `403`, stock unchanged |
| ADMIN can never create a request | Route `requireRole(EXECUTOR)` | `403`, `materialRequest.count == 0` |
| ADMIN can never approve/reject one they created | Service self-decision guard | `403` with explicit message |
| **Approval never deducts stock** | `approve()` performs no `Inventory` write | stock asserted `120 → 120` after approval |
| Only `issue()` deducts stock | Single write path in `materialRequestService.issue` | ledger `STOCK_OUT` rows only from issue |
| Issue is atomic & concurrency-safe | `SELECT … FOR UPDATE` on request then inventory, one transaction | over-issue/insufficient → `409`, no partial writes |
| No negative inventory | Pre-check under the inventory row lock | stock floored at 0, `409` on shortfall |
| Executor sees quantities + immutable timeline | Serializer + append-only table, no update/delete API | byte-identical earlier entries |
| Notifications/audit reflect successful changes | Emitted post-commit only | `409` produces no notification/audit |
| Historical records never rewritten | No update/delete API; legacy fallback is display-only | `PUT`/`DELETE` → `404` |
| Frontend permissions are UX only | Every rule also on the API | API called directly with wrong cookie in tests |

---

## 5. Test evidence

`backend/tests/material-request-rbac.test.ts` (separation of duties) and `backend/tests/material-request-issue.test.ts` (§77 acceptance + §78 negative) cover the matrix above.

Full suite: **4 files, 45/45 tests passing** — stable across 4 consecutive runs, with backend `lint` + `typecheck` clean.

Negative cases proven, each with an assertion that **no data changed**:

- ADMIN create → `403`, zero rows
- EXECUTOR issue → `403`, stock unchanged, status still `APPROVED`
- Cross-admin approve/get/issue → `403`
- Self-approve → `403` + explicit message
- Over-issue (> approved) → `409`, stock unchanged, `issuedQuantity` still 0
- Insufficient stock → `409`, stock unchanged (never negative), a fitting quantity still succeeds afterwards
- Non-integer / zero / negative quantity → `400`
- Issue while pending, and re-issue after full → `409`
