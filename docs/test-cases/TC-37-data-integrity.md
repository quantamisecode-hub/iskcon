# TC-37 — Data Integrity (constraints, rollback, never-rewritten history)

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-DIT-001 | FK cascade policy is intentional (no accidental data loss) | P0 | DATABASE |

**Steps:** inspect `schema.prisma` relations; attempt deletion of referenced entities (TC-FIM-006/DSH-005/CAT-006/UNT-005 already record outcomes).
**Expected:** no `onDelete: Cascade` on paths that would destroy financial/planning history without explicit intent; deletions guarded at service level.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-DIT-002 | Rollback atomicity on multi-table mutations | P0 | DATABASE |

**Steps:** force a mid-transaction failure (invalid state deep in the flow); snapshot all affected tables before/after.
**Expected:** zero partial rows anywhere (request items, timeline, audit, inventory, ledger all-or-nothing).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-DIT-003 | Historical records never rewritten | P0 | DATABASE |

**Steps:** snapshot request/return timelines + audit rows after each lifecycle
stage; diff snapshots at the end.
**Expected:** every historical row byte-identical (append-only); only NEW rows appear.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-DIT-004 | Timestamps/actors always stamped | P0 | DATABASE |

**Expected:** submittedAt/approvedAt/issuedAt/cancelledAt/acceptedAt set exactly
at their status transitions (never on unrelated ones); actor ids recorded on
timeline/audit/ledger rows; no nulls in mandatory stamps.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-DIT-005 | Money columns: int/decimal safety (no float drift) | P1 | DATABASE |

**Expected:** quantity columns are Int/Decimal; repeated partial arithmetic (30+40+30, 0.5-steps) is exact (TC-PART-001…003, TC-REC-010).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-DIT-006 | Unique constraints hold under race (codes, assignments, sessions) | P0 | DATABASE |

**Expected:** duplicate EVT/REQ/RET codes impossible; no double active assignment (TC-ASG-010); session token hashes unique.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-DIT-007 | Ledger == inventory after full regression + fail-safe on drift | P0 | DATABASE |

**Steps:** run the whole backend suite; then the global reconciliation query (TC-DQ-005).
**Expected:** zero mismatches after all suite activity (this is the certification DB gate).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-37 roll-up
Cases: 7 · P0: 6 · Automated: 0
