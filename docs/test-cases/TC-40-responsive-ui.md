# TC-40 — Responsive UI (breakpoints)

**Method:** browser viewport sweeps (360 / 768 / 1024 / 1440 widths) — browser
tooling available in-session for snapshots and console checks.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-RSP-001 | Core pages usable at 360×800 (mobile) | P0 | RESPONSIVE |

**Pages:** Login, Dashboard, EventsList, EventDetail (incl. §39 table), Requests,
RequestDetail, Returns, Notifications.
**Expected:** no horizontal scroll of the page shell; tables either scroll
within their container or collapse; nav collapses to hamburger/drawer; touch
targets ≥ 44 px (record actual).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-RSP-002 | Tablet 768: two-column layouts reflow correctly | P1 | RESPONSIVE |

**Expected:** dashboard cards wrap; event detail side panels stack; no clipped buttons.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-RSP-003 | Wide 1440: no stretched/blurry artifacts | P2 | RESPONSIVE |

**Expected:** max-width containers centered; tables use width sanely.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-RSP-004 | Modals responsive (cancel-event, review panels) | P1 | RESPONSIVE |

**Expected:** modals scroll internally on small heights; actions always reachable.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-RSP-005 | Zero console errors/warnings across sweep | P0 | RESPONSIVE |

**Expected:** no React layout warnings, no failed chunk loads, no 404 assets at any breakpoint.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-40 roll-up
Cases: 5 · P0: 2 · Automated: 0
