# TC-09 — Dishes & Dish Materials (master data)

**Repo surface:** `/api/v1/dishes` CRUD + `DishMaterial` mapping (dish → food
item + qty). Dishes are master definitions; attaching to events creates
EventDish rows; dish materials FEED planning lines (never stock). Frontend:
DishesPage + DishDetailPage. Read anyRole / write admin (verify route guard and
record).

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-DSH-001 | Create dish with materials | P0 | FUNCTIONAL | ADMIN |

**Expected:** 201; DishMaterial rows map items with qty > 0; audit; shows in list.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-DSH-002 | Duplicate dish name rejected | P1 | NEGATIVE |

**Expected:** 400/409 (case-insensitive — record); no partial row.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DSH-003 | Material qty 0/negative/unknown item rejected | P0 | NEGATIVE |

**Expected:** 400; nothing persisted.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DSH-004 | Edit dish materials updates future planning only | P0 | DATABASE |

**Expected:** editing dish material qty does NOT touch existing EventMaterial
lines already committed on events (history intact); new planning uses new values.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DSH-005 | Delete dish guarded when referenced | P0 | DATABASE |

**Expected:** dish referenced by EventDish → 409/soft-delete per contract
(verify + record); deletion must never orphan event history.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DSH-006 | Executor read access; write denied | P1 | AUTHORIZATION |

**Expected:** GET ok (dropdowns); POST/PATCH/DELETE → 403 (verify actual guard).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DSH-007 | DishDetail UI renders materials + usage | P2 | E2E |

**Expected:** materials table + events usage; zero console errors.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-09 roll-up
Cases: 7 · P0: 3 · Automated: 0
