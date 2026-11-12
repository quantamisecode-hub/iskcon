# TC-04 — Admin ↔ Executor Assignment

**Repo surface:** `/api/v1/assignments` — adminOnly router-level. `POST`
(`{executorId, adminId?}` — adminId optional; defaults to creating admin),
`GET /` (list w/ filters), `DELETE /:id` (ends assignment WITHOUT destroying
history). Service serializes on a row-locked transaction: EXECUTOR role
required; duplicate → 409 "This executor is already assigned to this admin.";
list rows serialize `executor: toSafeUser(...)`.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-ASG-001 | Assign executor to admin | P0 | FUNCTIONAL | ADMIN |

**Test data:** active EXECUTOR user id.
**Expected:** 201; assignment row active; executor appears in admin's scope; audit row; list shows `executor` (safe fields, no passwordHash).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ASG-002 | Duplicate active assignment → 409 exact message | P0 | NEGATIVE |

**Expected:** 409 "This executor is already assigned to this admin."; only ONE active row exists even under racing creation (row-lock serialize).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ASG-003 | Non-EXECUTOR target rejected | P0 | NEGATIVE |

**Expected:** assigning an ADMIN or anonymous id → 400/409; no row.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ASG-004 | Executor blocked from all assignment routes | P0 | AUTHORIZATION |

**Expected:** 403 on GET/POST/DELETE.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ASG-005 | End assignment keeps history | P0 | DATABASE |

**Expected:** DELETE sets the row ended (endedAt or isActive=false per actual contract — record); historical events/requests created during the assignment remain accessible to the executor; NO row deletion.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ASG-006 | Re-assignment after end creates a new row | P1 | FUNCTIONAL |

**Expected:** ended pair can be re-assigned; two historical rows for the pair; history preserved on both.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ASG-007 | Cross-admin conflict: executor already assigned to admin B | P0 | NEGATIVE |

**Expected:** admin A assigning an executor who is active with admin B → 409 (one active assignment per executor per contract — verify actual behavior and record).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ASG-008 | Scope effects on events/requests | P0 | INTEGRATION |

**Expected:** after assignment, executor can see/act on the admin's events (TC-RBAC-009); after ending, NEW scoping denies but history remains.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ASG-009 | Invalid/deactivated executor rejected | P1 | NEGATIVE |

**Expected:** unknown uuid → 404/400; deactivated executor → 400 with explicit message.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ASG-010 | Concurrent duplicate creation race | P0 | CONCURRENCY |

**Expected:** two parallel POSTs with same executorId → exactly one 201, one 409 (row-lock); no duplicate active rows.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-04 roll-up
Cases: 10 · P0: 7 · Automated: 0
