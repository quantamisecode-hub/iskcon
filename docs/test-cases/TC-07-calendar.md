# TC-07 — Calendar

**Repo surface:** `GET /api/v1/calendar/events?from&to` (anyRole; scope enforced
in the service; zod `calendarQuerySchema`). Frontend: CalendarPage (month grid).

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-CAL-001 | Month range returns only in-range events | P0 | FUNCTIONAL | both |

**Test data:** from=2026-11-01, to=2026-11-30; events seeded on both sides + inside.
**Expected:** only events overlapping the range (verify boundary semantics:
inclusive/exclusive per service — record); sorted by date; scoped to actor.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-CAL-002 | Boundary days: first/last day inclusive | P1 | BOUNDARY |

**Expected:** event exactly on `from` and exactly on `to` both appear (record actual).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-CAL-003 | Invalid/missing date params → 400 | P0 | NEGATIVE |

**Expected:** 400 VALIDATION_ERROR from calendarQuerySchema; no partial render crash.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CAL-004 | Scope: executor sees assigned admin's events only | P0 | AUTHORIZATION |

**Expected:** foreign events absent; own-created events present.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CAL-005 | Multiple events same day render stacked | P2 | E2E |

**Expected:** CalendarPage shows all; click navigates to EventDetail; CANCELLED visual state distinct.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-CAL-006 | Status filter payload correctness | P1 | FUNCTIONAL |

**Expected:** each returned row carries status/date fields the UI maps correctly (READY/COMPLETED/CANCELLED visuals).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-07 roll-up
Cases: 6 · P0: 3 · Automated: 0
