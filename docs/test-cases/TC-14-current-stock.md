# TC-14 — Current Stock (summary, filters, zero/low/out states)

**Repo surface:** `GET /food-items/stock/summary` (anyRole) — per-item
currentQuantity vs minimumStock/reorderLevel; InventoryPage + Inventory model.
State bands: ZERO (0), LOW (≤ reorder or ≤ minimum per design — record exact
band logic), OK, plus OUT_OF_STOCK / LOW_STOCK / REORDER_REQUIRED notification
thresholds driven at issue-time (TC-ISSUE-007).

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-STK-001 | Summary quantities equal Inventory table truth | P0 | DATABASE | both |

**Steps:** call stock/summary; compare every row with `Inventory.currentQuantity`.
**Expected:** identical (zero tolerance); items without Inventory rows report 0 (record).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-STK-002 | Zero / low / out state bands correct | P0 | FUNCTIONAL |

**Test data:** items at qty 0, below reorder, above reorder.
**Expected:** state labels match the service band logic exactly (record the
formula); UI color-coding matches; stock:alert thresholds consistent with bands.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-STK-003 | Filters + search on InventoryPage | P1 | FUNCTIONAL |

**Expected:** category/unit/search/isActive filters work server-side; empty state renders.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-STK-004 | Stock changes reflect immediately after issue/return | P1 | INTEGRATION |

**Steps:** issue → refresh summary; accept return → refresh summary.
**Expected:** values move exactly −issued / +accepted each time (ledger == inventory always, TC-REC-004).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-STK-005 | Executor read ok (planning context) | P1 | AUTHORIZATION |

**Expected:** executor sees summary for planning decisions; no admin-only writes exposed.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-14 roll-up
Cases: 5 · P0: 2 · Automated: 0
