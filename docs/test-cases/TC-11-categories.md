# TC-11 — Categories

**Repo surface:** `/api/v1/categories` — ALL routes adminOnly (list, create,
get, patch, delete). Route-level validation: blank name → 400. Service writes
audit rows on every mutation. Referenced by FoodItem.categoryId.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-CAT-001 | Create category | P0 | FUNCTIONAL | ADMIN |

**Expected:** 201; audit row; visible in list + item-create dropdown.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-CAT-002 | Blank / whitespace name → 400 | P0 | NEGATIVE |

**Expected:** 400 "Name is required."; nothing persisted.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CAT-003 | Duplicate name rejected | P1 | NEGATIVE |

**Expected:** 400/409 (case-insensitivity — record actual); single row.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CAT-004 | Executor blocked (list included) | P0 | AUTHORIZATION |

**Expected:** 403 on GET/POST/PATCH/DELETE (list is adminOnly — note asymmetry vs units/food-items which are anyRole reads).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CAT-005 | Deactivate: hidden from active flows, items keep label | P0 | FUNCTIONAL |

**Expected:** isActive=false; food-item planning dropdown excludes; existing items show the category name without breaking.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CAT-006 | Delete guarded when items reference it | P0 | DATABASE |

**Expected:** 409 per contract (verify + record); unreferenced deletes clean; audit on all paths.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CAT-007 | PATCH rename / description / isActive + audit | P1 | FUNCTIONAL |

**Expected:** partial update; audit old→new; empty-name patch rejected.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-11 roll-up
Cases: 7 · P0: 4 · Automated: 0
