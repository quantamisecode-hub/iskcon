# TC-29 — Management Reports

# ⚠️ MODULE ABSENT — GAP RECORD

> **Inspection result (§3):** No Reports module exists — no reports router, no
> report endpoints, no export endpoints anywhere (grep for csv|xlsx across
> routers returned zero), no Reports UI page. The Phase 11 brief's Ph-10
> reporting features are not implemented.

| ID | Feature | Priority | Type | Status |
|---|---|---|---|---|
| TC-RPT-001 | Event material summary report (per event) | P2 | MODULE ABSENT | GAP — §39 endpoint exists but is not a report/export |
| TC-RPT-002 | Consumption report over date range | P2 | MODULE ABSENT | GAP |
| TC-RPT-003 | Request/return cycle-time report | P2 | MODULE ABSENT | GAP |
| TC-RPT-004 | Stock valuation report | P2 | MODULE ABSENT | GAP |
| TC-RPT-005 | CSV/PDF export of any report | P2 | MODULE ABSENT | GAP |

**Impact analysis:** raw data for all of these is reliable (ledger, requests,
returns — verified by TC-15/TC-17/TC-23/TC-25). Export security concerns are
separately recorded in TC-42 (also ABSENT). Certification (§62) must list this
module as NOT SHIPPED.

## TC-29 roll-up
Cases: 5 (all GAP) · Automated: 0
