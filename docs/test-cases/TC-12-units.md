# TC-12 — Units (no silent conversion)

**Repo surface:** `/api/v1/units` — GET/GET :id anyRole (dropdowns);
POST/PATCH/DELETE adminOnly. Create requires name + symbol + unitType. Business
rule: units are labels only — NO cross-unit conversion exists anywhere
(request/issue/return quantities are unit-denominated and compared strictly).

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-UNT-001 | Create unit (name, symbol, unitType) | P0 | FUNCTIONAL | ADMIN |

**Expected:** 201; audit; visible in dropdowns (planning, item master).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-UNT-002 | Missing name/symbol/unitType → 400 | P0 | NEGATIVE |

**Expected:** 400 "Name, symbol and unit type are required."
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-UNT-003 | Duplicate symbol/name rejected | P1 | NEGATIVE |

**Expected:** 400/409 (record); no duplicate rows.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-UNT-004 | No silent conversion between units | P0 | FUNCTIONAL |

**Test data:** item in KG; plan/request/issue quantities entered while UI shows
another unit; attempt issue with mismatched unit semantics.
**Expected:** quantities are strictly per-item-unit; no implicit ×1000 or
g↔kg math anywhere; a unit mismatch is either blocked or displayed unambiguously
(record actual UX); inventory math never mixes units.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-UNT-005 | Deactivate + delete guards | P0 | DATABASE |

**Expected:** deactivation hides from dropdowns; unit referenced by items →
delete guarded (409 per contract — record); history intact.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-UNT-006 | PATCH rename updates label everywhere consistently | P1 | FUNCTIONAL |

**Expected:** item pages, ledger rows, §39 summary all show the renamed symbol
(history rows display current label or stored snapshot per design — record).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-12 roll-up
Cases: 6 · P0: 3 · Automated: 0
