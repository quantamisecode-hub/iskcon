# TC-13 — Stock In (atomic + ledger + audit)

**Repo surface:** `POST /food-items/:id/stock-in` (adminOnly). Route validates
`Number.isFinite(quantity) && quantity > 0`. Service: atomic transaction —
Inventory upsert/increment + `InventoryTransaction STOCK_IN` row + audit; the
ledger is written ONLY by stock operations (never by hand). Ledger types:
`STOCK_IN | STOCK_OUT | ADJUSTMENT | RETURN`.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-STI-001 | Stock in increments inventory + writes ledger + audit | P0 | DATABASE | ADMIN |

**Test data:** item stock 0; stock-in 100.
**Expected:** 200; `Inventory.currentQuantity = 100`; one `STOCK_IN` transaction row (qty 100, actor admin, balanceAfter); audit row with IP/UA; UI reflects new stock.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-STI-002 | Quantity 0 / negative / NaN / string rejected | P0 | NEGATIVE |

**Expected:** 400 "Quantity must be a positive number."; inventory and ledger untouched.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-STI-003 | Executor blocked; anonymous 401 | P0 | AUTHORIZATION |

**Expected:** 403/401; zero side effects.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-STI-004 | Atomicity: no half-writes on failure | P0 | DATABASE |

**Expected:** if any step fails (forced), neither inventory nor ledger nor audit
rows are written (single transaction rollback).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-STI-005 | Rapid repeated stock-ins sum correctly | P1 | CONCURRENCY |

**Test data:** 10 parallel stock-in(10) calls.
**Expected:** final stock = initial + 100 exactly; 10 ledger rows; no lost update (row-lock).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-STI-006 | Unknown item id → 404 | P1 | NEGATIVE |

**Expected:** 404; nothing written.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-STI-007 | stock-in on deactivated item — record contract | P2 | BOUNDARY |

**Expected:** record actual behavior (allowed vs 400); must never corrupt ledger either way.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-13 roll-up
Cases: 7 · P0: 4 · Automated: 0
