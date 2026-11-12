# TC-08 — Events (create / edit / status chain / dishes / planning UI)

**Repo surface:** `POST /events` (anyRole create — creator becomes owner),
`GET /events`, `GET /events/:id`, `PATCH /events/:id`, `PATCH /events/:id/status`
(DRAFT→PLANNING→READY→COMPLETED; CANCELLED delegates to cancel()),
`POST /events/:id/dishes`, `POST /events/:id/complete`. Scope: creator +
assigned executors. Notifications on CREATED/READY/COMPLETED (TC-26).

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-EVT-001 | Create event → code + notification | P0 | FUNCTIONAL | both |

**Expected:** 201 with `EVT-<year>-<n>` sequential code (EventCodeCounter);
status DRAFT/PLANNING per contract; audit; §50 EVENT_CREATED notification to
assigned executors (minus actor) — verified live + automated.
**Status:** NOT EXECUTED · Automation: AUTOMATED — events.test.ts

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-EVT-002 | Mandatory fields validated | P0 | NEGATIVE |

**Test data:** missing name/date; past date; bad uuids in dishes.
**Expected:** 400; nothing persisted (no counter increment either).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-EVT-003 | Status chain forward-only: DRAFT→PLANNING→READY→COMPLETED | P0 | FUNCTIONAL |

**Expected:** each transition 200 with event notification per §49–§50;
invalid skips (DRAFT→COMPLETED) → 409 (record actual allowed matrix); READY/COMPLETED lock planning (TC-PLAN-008).
**Status:** NOT EXECUTED · Automation: PARTIAL — events.test.ts (READY milestone + silent PLANNING move covered)

| ID | Feature | Priority | Type |
|---|---|---|
| TC-EVT-004 | PATCH edit allowed in editable states only | P0 | NEGATIVE |

**Expected:** edit in DRAFT/PLANNING ok (audit); READY/COMPLETED/CANCELLED → 409 "can no longer be edited".
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-EVT-005 | Scope isolation (list + detail + edit) | P0 | AUTHORIZATION |

**Expected:** executor sees assigned-admin + own events; admin sees own; foreign detail → 403/404; foreign PATCH → 403.
**Status:** NOT EXECUTED · Automation: PARTIAL — events.test.ts

| ID | Feature | Priority | Type |
|---|---|---|
| TC-EVT-006 | Event code counter never duplicates or skips on failure | P0 | DATABASE |

**Expected:** parallel creates → unique sequential codes (counter transaction safe); a failed create does not burn a code permanently visible as a gap without a row.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-EVT-007 | Add/remove dishes on event | P1 | FUNCTIONAL |

**Expected:** dishes attach with per-event rows (EventDish); duplicates rejected; removal keeps request/return history coherent.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-EVT-008 | Complete event (executor or admin) | P0 | FUNCTIONAL |

**Expected:** status COMPLETED; EVENT_COMPLETED notification to creator+admin+assigned executors minus actor (automated); planning locked.
**Status:** NOT EXECUTED · Automation: AUTOMATED — events.test.ts

| ID | Feature | Priority | Type |
|---|---|---|
| TC-EVT-009 | EventDetail UI: tabs render §39 + lifecycle + planning | P1 | E2E |

**Expected:** all sections render with endpoint truth; §39 verified live; cancel modal per TC-CXL-003; zero console errors.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED (§39 live-verified)

| ID | Feature | Priority | Type |
|---|---|---|
| TC-EVT-010 | Events list filters + pagination | P1 | FUNCTIONAL |

**Expected:** status/search filters work server-side; pagination clamps; CANCELLED events visible with reason.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-08 roll-up
Cases: 10 · P0: 6 · Automated: 3 (events.test.ts) + live §39
