# TC-34 — Input Validation (zod contracts + boundaries)

**Repo surface:** `validateBody/validateParams/validateQuery` middleware +
`validators/*.validator.ts` (strict schemas) + inline route guards
(foodItem/category/unit). Error contract: 400 `VALIDATION_ERROR`.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-VAL-001 | Required fields missing everywhere | P0 | NEGATIVE |

**Steps:** for each create endpoint, post `{}`.
**Expected:** 400 with per-field messages; nothing persisted (spot-check DB counts before/after).
**Status:** PARTIAL (2026-11-11, via auth-negative + security test suites) · Automation: PARTIAL
**Evidence:** login `{}` → 400 with zero sessions created (auth-negative.test.ts); dish `{}`-style bad bodies → 400 VALIDATION_ERROR (strict schema). Remaining: a systematic `{}` sweep across ALL create endpoints.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-VAL-002 | Type confusion (string for number, array for string) | P0 | NEGATIVE |

**Test data:** `{"quantity":"100"}` on stock-in; `{"minimumStock":[1]}`; nested objects in scalar fields.
**Expected:** 400 (zod rejects); no coercion surprises (Number() guards fail closed).
**Status:** PASS (2026-11-11, security.test.ts) · Automation: FULL
**Evidence:** stock-in with `quantity: "100"` → 400; `quantity: -5` and `0` → 400; `1e308` → 400/500 both DB-safe. Every probe re-verified DB: inventory stayed exactly 50 (nothing moved); every error body scanned for `prisma|node_modules|path` — zero leaks. Fail-closed confirmed on the inline-validated stock routes.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-VAL-003 | Length boundaries (min/max) | P0 | BOUNDARY |

**Test data:** name 100/101 chars; reason 1000/1001 chars (cancel); email 254/255; password 128/129.
**Expected:** exactly at limit → pass; over → 400 (per NAME_PATTERN max 100, reason max 1000, email max 254, password max 128).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-VAL-004 | Numeric boundaries: 0, 0.0001, 1e308, -1, MAX_SAFE_INTEGER+1 | P0 | BOUNDARY |

**Expected:** 0/negative → 400; huge finite → 400 or DB-safe error (never negative stock nor int overflow); decimals per column type (record).
**Status:** PARTIAL (2026-11-11, security.test.ts) · Automation: PARTIAL
**Evidence:** on stock-in: 0 → 400, -5 → 400, 1e308 → 400/500 with generic message and no stock change (DECIMAL column survives). Remaining: 0.0001 decimals, MAX_SAFE_INTEGER+1, and the approve/issue/return quantity fields.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-VAL-005 | UUID params validated (no injection via :id) | P0 | SECURITY |

**Test data:** `:id=../auth/me`, `:id=' OR 1=1--`, `:id=<script>`.
**Expected:** 400 VALIDATION_ERROR (uuid schema); Prisma parameterization would also block — both layers hold.
**Status:** PASS with RECORDED split (2026-11-11, security.test.ts) · Automation: FULL
**Evidence:** validated routers → clean 400 VALIDATION_ERROR for `' OR 1=1--` on /events/:id, `<script>` on /events/:id, `abc` on /users/:id/status, path-traversal on /material-requests/:id. RECORDED: manual (inline) routers such as GET /categories/:id pass raw ids to Prisma — malformed uuid → generic 500 INTERNAL_ERROR ("Something went wrong."), zero internals leaked (P2023 intentionally mapped to the generic bucket by error.middleware). Parameterization holds; robustness gap (would prefer 404/400), not a security finding.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-VAL-006 | Query params: page/pageSize/enums clamped + validated | P1 | BOUNDARY |

**Test data:** page=-5, pageSize=99999, status=HACKED, isActive=banana.
**Expected:** clamped/400 per schema (list validators); no unbounded queries.
**Status:** PASS with RECORDED split (2026-11-11, security.test.ts) · Automation: FULL
**Evidence:** /material-requests with `status=HACKED&page=-5&pageSize=99999` → 400 VALIDATION_ERROR (zod query schema). /food-items (inline validation) with a DROP-TABLE `search` payload → 200 and FoodItem table intact (count > 0) — inline list clamps page/pageSize numerically; unknown enum-ish params handled loosely but never 500, no unbounded query. Recorded: inline routers clamp instead of reject.

| ID | Feature | Priority | Type |
|---|---|---|
| TC-VAL-007 | Unicode/locale inputs (emoji, RTL, combining marks) | P2 | BOUNDARY |

**Expected:** accepted where names allow Unicode letters (NAME_PATTERN `\p{L}`), stored + round-tripped losslessly, search still works.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-VAL-008 | Date boundaries: invalid formats, year 0001/9999, DST edges | P1 | BOUNDARY |

**Expected:** 400 for invalid; extremes handled without crash (calendar range clamp per schema).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-34 roll-up
Cases: 8 · P0: 5 · Automated: 4 (security.test.ts: VAL-002/005/006 FULL, VAL-001/004 PARTIAL) —
PASS 2 · PARTIAL 2 · NOT EXECUTED 4 (VAL-003/007/008 boundaries, VAL-001 full sweep).
Robustness gap recorded at VAL-005: manual routers answer malformed uuid params with a
generic (leak-free) 500 instead of a clean 4xx.
