# TC-16 — Material Planning (never mutates inventory)

**Repo surface:** `POST /events/:id/dishes`, `PATCH/DELETE /event-dishes/:id`,
`POST /event-dishes/:id/materials`, `PATCH/DELETE /event-dishes/:id/materials/:materialId`,
draft-line parking + `COMMIT_EVENT_MATERIAL` audit. Four concepts never merged:
Dish Material Definition / Material Request / Inventory Issue / Material Return.

**Master invariant:** Planning writes `EventMaterial` rows ONLY. Stock,
InventoryTransaction and Inventory MUST remain byte-identical before/after.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-PLAN-001 | Add material line leaves stock untouched | P0 | DATABASE | ADMIN |

**Test data:** item with stock = 100 KG; add planned 50 KG to an event dish.
**Expected:** 201; `Inventory.currentQuantity` = 100; ledger count for the item
= 0; audit row `ADD_EVENT_MATERIAL` exists; line visible with unit + stock context.
**Status:** NOT EXECUTED · Automation: AUTOMATED — `events.test.ts` (TC "no stock deduction")

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PLAN-002 | Update planned quantity does not touch stock | P0 | DATABASE |

**Expected:** 25 → 30 update; stock still 100; ledger still 0; audit `UPDATE_EVENT_MATERIAL`.
**Status:** NOT EXECUTED · Automation: AUTOMATED — `events.test.ts`

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PLAN-003 | Remove material line is a plan edit only | P1 | FUNCTIONAL |

**Expected:** line gone; stock/ledger unchanged; audit `REMOVE_EVENT_MATERIAL`.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PLAN-004 | Zero / negative planned quantity rejected | P0 | NEGATIVE |

**Expected:** 400 (validator); no row created.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PLAN-005 | Duplicate material line for same dish+item rejected | P1 | NEGATIVE |

**Expected:** 400/409 (per validator); no duplicate rows.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PLAN-006 | Inactive food item cannot be planned | P1 | NEGATIVE |

**Expected:** 400/404 per contract; no row.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PLAN-007 | Draft line parking + commit | P1 | FUNCTIONAL |

**Expected:** `isDraft: true` lines are parked (excluded from request-building
until committed); COMMIT flips to committed with audit `COMMIT_EVENT_MATERIAL`;
committing still never moves stock.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PLAN-008 | Planning locked on READY/COMPLETED/CANCELLED | P0 | NEGATIVE |

**Expected:** `assertEditableForPlanning` → 409 "This event can no longer be
edited while it is X." for dish AND material mutations in all three terminal/locked states.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PLAN-009 | Executor may plan within scope; foreign event denied | P1 | AUTHORIZATION |

**Expected:** executor can add/commit lines on their assigned admin's events;
403 on another admin's event.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-16 roll-up
Cases: 9 · P0: 4 · Automated: 2
