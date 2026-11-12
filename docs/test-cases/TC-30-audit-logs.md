# TC-30 — Audit Logs

# ⚠️ PARTIAL GAP — audit rows exist at DB level; NO API / NO UI

> **Inspection result (§3):** `AuditLog` model exists (24-model schema) and is
> WRITTEN by every mutating service action (user mgmt, masters, stock, event
> lifecycle, request lifecycle, returns, planning, assignment). However there is
> **no audit-log API route** and **no Audit UI page** — audit data is
> DB-only/ops-visible today. Grep across routers: zero audit endpoints.

| ID | Feature | Priority | Type | Status |
|---|---|---|---|---|
| TC-AUD-001 | Every golden-rule action writes an AuditLog row | P0 | DATABASE | EXECUTABLE — rows written by services (verify via DB) |

**Steps:** run one action per family (login, create user, stock-in, plan line,
create/submit/approve/issue request, create/accept return, cancel event,
assign) then dump `AuditLog`.
**Expected:** one row per action with actor id, action enum, entity type/id,
old/new values, IP/UA; actor never null for authenticated actions.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type | Status |
|---|---|---|---|---|
| TC-AUD-002 | Audit rows are append-only (no UPDATE path in code) | P0 | DATABASE | EXECUTABLE — grep for auditLog.update → expect none |

**Expected:** code inspection + DB snapshot diff over time shows rows never mutated.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type | Status |
|---|---|---|---|---|
| TC-AUD-003 | Audit list/filter API | P2 | MODULE ABSENT | GAP — no endpoint |
| TC-AUD-004 | Audit viewer UI with filters + actor detail | P2 | MODULE ABSENT | GAP — no page |
| TC-AUD-005 | Audit export | P2 | MODULE ABSENT | GAP |

**Impact:** the audit TRAIL exists and is complete; only the exposure layer is
missing. Traceability: audit expectations inside TC-03/10/13/19/21/23/24 files
can be verified via DB queries in the interim.

## TC-30 roll-up
Cases: 5 (2 executable, 3 GAP) · Automated: 0
