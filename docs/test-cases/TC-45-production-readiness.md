# TC-45 — Production Readiness (release gates §62)

**Gate rule:** a gate is PASS only with database-verified evidence, not "page opens".

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRD-001 | Full regression green (suite + typecheck + lint) | P0 | GATE |

**Expected:** backend 74/74 ×3 runs; both typechecks; both lints; no known flake.
**Status:** PASS (achieved 2026-11, re-run at cut) · Automation: AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRD-002 | DB invariant gate: no negative stock; ledger == inventory; over-issue/over-return impossible | P0 | GATE |

**Expected:** TC-DQ-001…005 all zero-violations after the final regression run.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED (invariants suite pending)

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRD-003 | Golden rules charter all green | P0 | GATE |

**Expected:** executor-only create/submit; admin-only approve/issue/accept/cancel;
self-approval ban; approval-never-deducts; issue/accept-atomic — every charter
case PASS with DB evidence.
**Status:** NOT EXECUTED (partial coverage today) · Automation: PARTIAL

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRD-004 | Security gates: 401/403 sweep, limiter, headers, cookie flags, no-leak errors | P0 | GATE |

**Expected:** TC-32 + TC-33 P0 cases all PASS.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRD-005 | Production build + boot check | P0 | GATE |

**Expected:** frontend `vite build` succeeds (chunks sane); backend production
start loads all routers + socket + DB; health endpoint 200.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRD-006 | Environment/config audit for prod | P0 | GATE |

**Expected:** secrets from env (no hardcoded creds — verify grep); cookie Secure
in prod; CORS prod origins; rate limits sane; logging redaction verified; DB
migrations applied cleanly (`prisma migrate`), seed idempotency reviewed
(BUG-QA-001 seed `update:{}` role behavior).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRD-007 | Deployment smoke on real VPS/domain | P1 | GATE |

**Expected:** HTTPS reachable, login + one full lifecycle over the wire, sockets
wss working, no mixed-content errors.
**Status:** BLOCKED — awaiting VPS credentials/domains (carried forward; does not block local certification work)

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRD-008 | Absent-module register signed off | P1 | GATE |

**Expected:** TC-27/28/29/42 (MODULE ABSENT) + TC-30 exposure gap explicitly
accepted or scheduled by the product owner in the certification document.
**Status:** NOT EXECUTED · Automation: N/A

| ID | Feature | Priority | Type |
|---|---|
| TC-PRD-009 | Certification documents produced from ACTUAL statuses | P0 | GATE |

**Expected:** TEST_EXECUTION_REPORT.md + TEST_CASE_COVERAGE_REPORT.md +
CERTIFICATION.md derive percentages ONLY from recorded case statuses; no
aspirational PASS.
**Status:** NOT EXECUTED · Automation: N/A

## TC-45 roll-up
Cases: 9 · P0: 6 · 1 BLOCKED (VPS) · Passes so far: TC-PRD-001.
