# Material Request Authorization — Separation of Duties

**Rule:** only an **EXECUTOR** can request materials; only an **ADMIN** can approve or reject.
An admin can never request and then approve the same item on their own.

This document records the enforcement points and the reasoning. It is a business-rule
clarification, not a change to the database schema, API shape or inventory behaviour.

---

## 1. Why this rule exists

Material requests are the control point between event planning and stock movement.
If the same person could raise and approve a request, the approval step would provide
no independent check. Separating the roles keeps a second pair of eyes on every request
before materials can be issued.

Stock is still never deducted by creating, submitting or approving a request. Deduction
remains a separate Issue/Checkout step.

---

## 2. Role matrix

| Action | EXECUTOR | ADMIN |
|---|---|---|
| Create a material request from an event plan | ✅ own assigned scope | ❌ always forbidden |
| Submit a draft request | ✅ own request | ❌ forbidden |
| View request list | ✅ own requests | ✅ requests where `adminId = user.id` |
| View request detail | ✅ own request | ✅ in-scope request |
| Approve / reject | ❌ forbidden | ✅ in-scope request, **except one they created** |
| Cancel | ✅ own draft/pending request | ✅ in-scope pending request, or own draft |

---

## 3. Enforcement points (defence in depth)

### Route layer — `backend/src/routes/materialRequest.routes.ts`

```ts
const executorOnly = [authenticate, requireRole(ROLES.EXECUTOR)];
const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];

materialRequestRouter.post('/', executorOnly, ...);
materialRequestRouter.post('/:id/submit', executorOnly, ...);
materialRequestRouter.post('/:id/approve', adminOnly, ...);
materialRequestRouter.post('/:id/reject', adminOnly, ...);
```

An ADMIN calling `POST /material-requests` now receives `403 FORBIDDEN` before any
business logic runs.

### Service layer — `backend/src/services/materialRequest.service.ts`

- `create()` rejects every non-EXECUTOR actor with
  `"Only an executor can create a material request."`
- `submit()` rejects every non-EXECUTOR actor.
- `approve()` and `reject()` reject when `existing.requestedById === user.id`:
  - `"You cannot approve a material request you created."`
  - `"You cannot reject a material request you created."`
- Existing scope checks remain unchanged: an admin only acts on requests where
  `adminId = user.id`, and an executor only sees requests they raised.

The self-decision guard also protects any historical request that was created by an
admin before this rule was introduced.

### UI layer

- `frontend/src/pages/EventDetailPage.tsx` — the **Create Material Request** button and
  its modal render only for non-admin users.
- `frontend/src/pages/RequestsPage.tsx` — the **Create Request (from an event)** shortcut
  is hidden for admins, and the empty state explains that executors raise requests.
- `frontend/src/pages/RequestDetailPage.tsx` — `canAct` additionally requires
  `requestedById !== user.id`, so an admin never sees Approve/Reject on their own request;
  `canSubmit` is executor-only.

The UI hides unavailable actions for clarity. The server remains the source of truth and
rejects forbidden actions even if a client bypasses the UI.

---

## 4. Behaviour examples

| Scenario | Result |
|---|---|
| Executor creates a request for an assigned event | `201 Created`, status `DRAFT` |
| Executor submits it | `200 OK`, status `PENDING_APPROVAL` |
| Executor tries to approve it | `403 FORBIDDEN` |
| Scoped admin approves it | `200 OK`, status `APPROVED`, `approverId = admin.id` |
| Admin tries to create a request | `403 FORBIDDEN`, no row is written |
| Admin tries again to approve a legacy request they created | `403 FORBIDDEN` |
| Admin tries to reject a legacy request they created | `403 FORBIDDEN` |

---

## 5. Tests

`backend/tests/material-request-rbac.test.ts` covers:

1. Admin create → `403`, and no request row exists.
2. Executor create → `201`; executor submit → `200`; executor approve → `403`;
   admin approve → `200` with the admin as approver.
3. Legacy self-created request: admin submit → `403`, admin approve → `403`,
   admin reject → `403`, and the row remains `PENDING_APPROVAL`.

Full backend suite: **35/35 passing**.

---

## 6. Historical data note

A pre-existing local development record (`REQ-2026-000001`, requested by the admin
`Vishnu Pratap Singh`) was already `APPROVED` before this rule was applied. It is kept
as historical data and is read-only in practice: the new guard prevents the same admin
from approving or rejecting it, and only an executor can submit. The record can be
cancelled by the in-scope admin if desired; no production data was deleted or rewritten.
