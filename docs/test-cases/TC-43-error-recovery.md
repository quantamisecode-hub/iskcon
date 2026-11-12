# TC-43 — Error Recovery & Resilience

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-ERR-001 | Backend restart: sessions + data survive | P0 | RECOVERY |

**Steps:** login; restart backend; /me + list endpoints still 200; socket rejoins.
**Expected:** DB-backed persistence holds; no re-login forced; notifications intact.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ERR-002 | Failed transaction leaves zero trace (rollback sweep) | P0 | RECOVERY |

**Steps:** trigger failures at each stage-gate (invalid transition, over-issue, over-return, deadlock exhaust).
**Expected:** table row-counts identical pre/post attempt (no orphans); user sees a clean error; retry works.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ERR-003 | Deadlock exhaustion degrades gracefully (no 500 storm) | P0 | RECOVERY |

**Expected:** withDeadlockRetry exhausts retries → structured error; post-commit
notification failures NEVER turn a committed success into a 500
(BUG-DB-001 fix contract).
**Status:** NOT EXECUTED · Automation: PARTIAL — db-retry.test.ts

| ID | Feature | Priority | Type |
|---|---|
| TC-ERR-004 | Frontend network-loss handling | P1 | RECOVERY |

**Steps:** submit form with backend stopped → restart → retry.
**Expected:** user-facing error message (not silent); no duplicate submission on retry where idempotency guards exist (409 path); no crash.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-ERR-005 | Double-submit / refresh mid-flight protection | P1 | RECOVERY |

**Expected:** duplicate stage-gate calls → 409; UI disables button while pending; no duplicated rows (timeline/notification).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-ERR-006 | Malformed JSON / oversized body | P1 | NEGATIVE |

**Test data:** truncated JSON; 10 MB body (verify body-limit config — record).
**Expected:** 400 structured error; server stays healthy; connection cleanup clean.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-ERR-007 | MySQL restart mid-suite: reconnect + retry | P2 | RECOVERY |

**Expected:** Prisma reconnects; retried transactions succeed or fail cleanly; suite resumable.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-43 roll-up
Cases: 7 · P0: 3 · Automated: 1 partial
