# TC-27 — Inventory Intelligence

# ⚠️ MODULE ABSENT — GAP RECORD

> **Inspection result (§3):** No Inventory Intelligence feature exists in the
> current build. There is no intelligence router
> (`backend/src/routes/index.ts` registers 16 routers — none intelligence), no
> service, no UI page, and no schema model beyond the raw data that WOULD feed
> such a module (Inventory, InventoryTransaction, EventMaterial, requests,
> returns). Per Phase 11 rules a missing module is a **finding**, not a skip.

| ID | Feature | Priority | Type | Status |
|---|---|---|---|---|
| TC-INT-001 | Consumption trends per item | P2 | MODULE ABSENT | GAP — no implementation |
| TC-INT-002 | Anomaly detection (spike/drift in usage) | P2 | MODULE ABSENT | GAP |
| TC-INT-003 | Demand forecast for event planning | P2 | MODULE ABSENT | GAP |
| TC-INT-004 | Smart reorder suggestions | P2 | MODULE ABSENT | GAP |

**Impact analysis:** Phase 11 brief expected Ph-8 intelligence features. All
 intelligence test intent is recorded here; the underlying data (ledger rows,
issue history) EXISTS and is correct per TC-15/TC-25, so a future module can be
built on trusted data. Certification (§62) must list this module as NOT SHIPPED.

## TC-27 roll-up
Cases: 4 (all GAP) · Automated: 0 · Requires: module implementation or explicit scope-cut sign-off.
