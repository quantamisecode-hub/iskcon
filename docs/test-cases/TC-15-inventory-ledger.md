# TC-15 — Inventory Ledger (immutable, admin-only)

**Repo surface:** `/api/v1/ledger` — GET list + GET /:id, adminOnly, read-only.
Filters: itemId, type (`STOCK_IN|STOCK_OUT|ADJUSTMENT|RETURN`), dateFrom,
dateTo, userId, page/pageSize (zod listLedgerQuerySchema). Ledger rows are
written exclusively by stock operations; there is NO create/edit/delete route
(immutability by design). Frontend: LedgerPage.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-LDG-001 | Every stock mutation appears with correct type/qty/balance | P0 | DATABASE | ADMIN |

**Steps:** perform stock-in, manual stock-out, adjustment, issue, return-accept;
read the ledger filtered to the item.
**Expected:** 5 rows: STOCK_IN, STOCK_OUT, ADJUSTMENT, STOCK_OUT (issue ref),
RETURN (or service-design equivalent — record the referenceType used by issue
vs manual out); each row qty + balanceAfter consistent with running balance.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-LDG-002 | Immutability: no write endpoints, historical rows never rewritten | P0 | SECURITY |

**Expected:** no POST/PATCH/DELETE routes exist on the ledger; after later
actions, earlier rows unchanged (byte-identical timestamps/quantities); audit
trail (not ledger) records who/when.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-LDG-003 | Running balance invariant across all rows of an item | P0 | DATABASE |

**Expected:** for any item, ordered by createdAt: balanceAfter(n) == balanceAfter(n−1) ± qty(n); first row balanceAfter == its qty; final == current inventory (ties to TC-REC-004).
**Status:** PASS (2026-11-11, scoped lifecycle) · Automation: `backend/tests/invariants.test.ts`
**Evidence:** owned item walked stock-in 100 → issue 40 → return-accept 15: ledger rows exactly [STOCK_IN 100, STOCK_OUT 40, RETURN 15]; running balance recomputed row-by-row matches every `balanceAfter`; final balance 75 == `Inventory.currentQuantity`.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-LDG-004 | Filters + pagination work and reject bad input | P1 | FUNCTIONAL |

**Test data:** type=RETURN; date range; userId; page=0 → clamp; bad uuid itemId → 400.
**Expected:** filtered rows only; 400 for invalid enums/uuids.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-LDG-005 | Executor blocked (route) | P0 | AUTHORIZATION |

**Expected:** 403 on list + detail.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-LDG-006 | Ledger UI renders rows + actor + dates | P2 | E2E |

**Expected:** LedgerPage shows type badges, item, qty, actor, timestamp; zero console errors; empty state clean.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-15 roll-up
Cases: 6 · P0: 3 · Automated: 1 (`invariants.test.ts`) — TC-LDG-003 PASS (scoped
lifecycle); LDG-001/002 remain manual (LDG-002's "no write routes" is structural).
