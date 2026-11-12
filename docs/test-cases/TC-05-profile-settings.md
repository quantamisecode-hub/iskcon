# TC-05 — Profile & Settings

**Repo surface:** `PATCH /auth/profile` (email change requires `currentPassword`;
strict schema — no role/status fields), `POST /auth/change-password`
(authLimiter + service password policy, min 8), `POST /auth/avatar`
(data-URL, ≤ 200,000 base64 chars), `GET /auth/me`. **Documented gap: NO
logout-all endpoint exists** (sessions are per-row only). Frontend: ProfilePage.

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-PRF-001 | Update first/last name | P1 | FUNCTIONAL | both |

**Expected:** 200; `/me` reflects new names; audit row; name pattern `^[\p{L}][\p{L} .'-]{0,99}$` enforced (leading digits/emoji/101 chars → 400).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-PRF-002 | Email change without currentPassword rejected | P0 | NEGATIVE |

**Expected:** 400 "current password required" semantics; email unchanged; works when correct currentPassword supplied.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRF-003 | Email change with WRONG currentPassword rejected | P0 | NEGATIVE |

**Expected:** 400/401; email unchanged; attempt audited; no lockout side effect.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRF-004 | Change password: old→new, re-login matrix | P0 | FUNCTIONAL |

**Test data:** valid old password + new `NewPass#2026!X` (≥8, mixed).
**Expected:** 200; old password fails login; new works; sessions per actual contract (record whether other sessions are revoked); limiter applies (authLimiter).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRF-005 | Weak new password rejected | P0 | NEGATIVE |

**Test data:** `123`, `abcdefgh`, `same-as-old` variants.
**Expected:** 400 policy message; password unchanged (old still works).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRF-006 | Avatar upload happy path + size guard | P1 | BOUNDARY |

**Test data:** valid data-URL PNG ≤200k base64; 201k-char data-URL; non-image string.
**Expected:** 200 for valid (persisted, shown in header/me); oversize → 400; invalid data-URL → 400.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRF-007 | Strict schema: role/status escalation via profile blocked | P0 | SECURITY |

**Expected:** PATCH `{role:"ADMIN"}`, `{isActive:false}` → 400 (unknown fields); DB untouched.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRF-008 | No sensitive data in profile responses | P0 | SECURITY |

**Expected:** `/me` + PATCH responses contain no passwordHash/token; logs redact.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRF-009 | Gap record: no logout-all (all-session revoke) | P2 | MODULE GAP |

**Expected (gap):** password change/email change do not necessarily revoke other sessions unless the service does it — VERIFY and record actual behavior; a logout-all endpoint is absent by design today; flag as a finding for the security report (TC-45).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-PRF-010 | Profile UI: form validation + save feedback | P2 | E2E |

**Expected:** ProfilePage validates before submit; shows success/error states; zero console errors.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-05 roll-up
Cases: 10 · P0: 5 · Automated: 0
