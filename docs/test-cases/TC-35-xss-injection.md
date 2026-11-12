# TC-35 — XSS & Injection (stored / reflected)

**Method:** payloads injected at every persisted string field; then read back
through API + UI and inspect rendering (React escapes by default — the test is
that no raw HTML/JS execution path exists; API must store data, never execute it).

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-XSS-001 | Stored XSS in names/descriptions | P0 | SECURITY |

**Test data:** user firstName `<img src=x onerror=alert(1)>`; category name
`<script>alert(1)</script>`; food-item description `"><svg onload=alert(1)>`;
event name + cancel reason + rejection reason payloads.
**Expected:** stored verbatim (or escaped) — NEVER rendered as HTML anywhere
(UsersPage, CategoriesPage, EventDetail, Ledger, Notifications); React
auto-escaping holds; no `dangerouslySetInnerHTML` usage in the codebase
(verify by grep — record result).
**Status:** PASS (API half, 2026-11-11, security.test.ts) + static UI half PASS · Automation: PARTIAL (API automated)
**Evidence (API):** payloads `<script>alert(1)</script>`, `"><svg onload=alert(1)>`, `'; DROP TABLE \`Category\`;--`, `')) OR ('1'='1` stored via POST /categories → round-trip VERBATIM as JSON (application/json content-type asserted; GET /:id returns identical string). Dish name `<img src=x onerror=alert(1)>-…` accepted and stored verbatim. DB unharmed (Category/FoodItem counts > 0 after all payloads).
**Evidence (UI, static):** grep over `frontend/src` — ZERO occurrences of `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` → no raw HTML sink exists; React auto-escaping is the only render path. Live browser-render sweep (payload visible as text in each page) remains manual.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-XSS-002 | Reflected XSS via query params | P0 | SECURITY |

**Test data:** `?search=<script>alert(1)</script>`, `?status="><img src=x>`.
**Expected:** param echoed only as text; no HTML injection in error states or empty-search UIs.
**Status:** PARTIAL (2026-11-11, security.test.ts) · Automation: PARTIAL
**Evidence:** `/food-items?search='; DROP TABLE \`FoodItem\`;--` → 200 JSON, payload never reflected as markup (API layer safe; JSON content-type enforced). React renders query echoes as text (no sink). Manual UI check of reflected error states remains.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-XSS-003 | XSS via notification message / deep-link rendering | P0 | SECURITY |

**Expected:** notification text built from event/request/return names — must render as text in bell + list; deep-link href must not become `javascript:` URL (validate link targets).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED
**Note:** notification text is data (JSON) over the API; same no-sink evidence as XSS-001 applies statically. Live probe (payload event name → notification bell) not yet automated.

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-XSS-004 | SQL/NoSQL injection probes | P0 | SECURITY |

**Test data:** `' OR '1'='1`, `1; DROP TABLE users;--`, `{"$gt":""}`, `%00`.
**Expected:** all harmless — Prisma parameterized queries; zod validates shapes; no string-concatenated SQL anywhere (verify by grep for `$queryRaw` — record and review any hit).
**Status:** PASS (2026-11-11, security.test.ts + static audit) · Automation: PARTIAL (API automated)
**Evidence (live):** SQLi payloads in category names, dish names, and food-item `search` queries all inert — data stored verbatim, tables intact (Category + FoodItem counts > 0 after every probe), no auth bypass (all probes ran authenticated).
**Evidence (static audit):** all 18 raw-SQL sites use tagged-template parameterized `$queryRaw`/`$executeRaw` — ZERO `$queryRawUnsafe`/`$executeRawUnsafe` (no string-concatenated SQL); no NoSQL anywhere (MySQL + Prisma only); `%00`/`$gt` shapes irrelevant to the stack. 

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-XSS-005 | Avatar data-URL content type enforcement | P1 | SECURITY |

**Test data:** `data:text/html;base64,...` payload claiming to be an image; SVG with embedded script.
**Expected:** only accepted image types stored (record validation); served with safe content-type; SVG-with-script never executes inline.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-XSS-006 | Template/command injection in logs (log forging) | P2 | SECURITY |

**Expected:** pino serializes objects; user strings cannot forge log lines into executable sinks; no child_process takes user input (verify grep).
**Status:** PARTIAL (static only, 2026-11-11) · Automation: STATIC
**Evidence:** pino serializers log structured objects (`msg` fixed strings, user data in fields); grep shows no `child_process` usage in backend src. Log-forging *impact* assessment: logs are server-side only, never rendered.

## TC-35 roll-up
Cases: 6 · P0: 4 · Automated: XSS-001/002/004 API halves (security.test.ts, all PASS) +
static UI/no-sink/no-unsafe-SQL audit PASS; remaining: manual browser-render sweeps
(XSS-001/002/003), avatar upload probes (005).
