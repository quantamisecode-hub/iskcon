# TC-10 — Food Item Master

**Repo surface:** `/api/v1/food-items` — GET list / POST (adminOnly) /
GET /stock/summary (anyRole) / GET :id, :id/detail (anyRole; detail is
role-aware) / PATCH, DELETE (adminOnly) / stock-in, stock-out, adjustment
(adminOnly — TC-13). Create requires `categoryName` + `unitSymbol` (by name —
auto-link), thresholds default minimumStock 10 / reorderLevel 20; route
validates non-empty masters and non-negative numeric thresholds. Audit on every
write. Frontend: FoodItemsPage, FoodItemDetailPage, InventoryPage.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-FIM-001 | Create item with category + unit by name | P0 | FUNCTIONAL | ADMIN |

**Test data:** `{name:"QA Rice", categoryName:"Grains", unitSymbol:"KG", minimumStock:5, reorderLevel:10}`.
**Expected:** 201; linked to existing category/unit (auto-create-or-link per service — record); audit row; appears in list + dropdowns.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-FIM-002 | Missing category / unit rejected | P0 | NEGATIVE |

**Expected:** 400 "Category is required. Create a category first." / "Unit is required."; blank name → 400.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-FIM-003 | Threshold validation: negative/non-numeric → 400 | P0 | NEGATIVE |

**Expected:** `-5`, `"abc"` for minimumStock/reorderLevel → 400; defaults only when omitted.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-FIM-004 | Executor can read master; all writes 403 | P0 | AUTHORIZATION |

**Expected:** GET list/detail/stock-summary ok; POST/PATCH/DELETE/stock-in/out/adjustment → 403.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-FIM-005 | Deactivate item: hidden from active lists, history intact | P0 | FUNCTIONAL |

**Expected:** isActive=false → excluded from active dropdowns/list (isActive filter);
existing EventMaterial/request/return history still resolves (no orphan names).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-FIM-006 | Delete guarded when referenced | P0 | DATABASE |

**Expected:** item with inventory/transactions/planning references → 409 per
contract (verify + record); bare item deletes clean with audit.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-FIM-007 | Duplicate name handling | P1 | NEGATIVE |

**Expected:** duplicate → 400/409 (record); no silent second row.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-FIM-008 | List filters: isActive, categoryId, unitId, search + paging | P1 | FUNCTIONAL |

**Expected:** all filters work server-side; pageSize clamp ≤100; detail is
role-aware (executor sees issued-context, admin sees full).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-FIM-009 | PATCH edit + audit trail | P1 | FUNCTIONAL |

**Expected:** partial updates persist; empty-string masters rejected ("Name cannot be empty."); old/new audit snapshot.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-10 roll-up
Cases: 9 · P0: 5 · Automated: 0
