# TC-03 — User Management

**Repo surface:** `/api/v1/users` — `userRouter.use(adminOnly)` guards EVERY
route (GET list, POST create, GET/PATCH/DELETE :id, PATCH :id/status,
POST :id/reset-password). Validators: createUserSchema, updateUserSchema,
updateUserStatusSchema, resetPasswordSchema, listUsersQuerySchema (zod, strict).
Frontend: UsersPage + UserDetailPage (admin nav only).

| ID | Feature | Priority | Type | Role |
|---|---|---|---|---|
| TC-USR-001 | Admin creates user (both roles) | P0 | FUNCTIONAL | ADMIN |

**Test data:** `{firstName:"Test",lastName:"Executor",email:"usr-001@dev.local",role:"EXECUTOR",password:"Test#2026!Pass"}` (and role ADMIN).
**Expected:** 201; row created with hashed password (never plaintext); duplicate
email → 400/409; actor + IP in audit; new EXECUTOR appears in UsersPage list.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-USR-002 | Weak password rejected on create | P0 | NEGATIVE |

**Test data:** `short`, `alllowercase123`, `NoNumber!`, `12345678!`.
**Expected:** 400 with policy message (min 8 + complexity per service policy); no row.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|---|
| TC-USR-003 | Duplicate email rejected (case-insensitive) | P0 | NEGATIVE |

**Expected:** `UPPER@dev.local` of existing `upper@dev.local` → 400/409; emails stored lowercase.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-USR-004 | Edit user fields preserves history | P1 | FUNCTIONAL |

**Expected:** PATCH name/email → audit row; old sessions keep working (user row updated, token hash unchanged); email uniqueness enforced on change too.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-USR-005 | Deactivate user (status PATCH) | P0 | FUNCTIONAL |

**Expected:** `isActive=false`; user can no longer log in (TC-AUTH-008); existing sessions rejected by session middleware re-check; audit row written.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-USR-006 | Self-deactivation / last-admin lockout prevention | P0 | NEGATIVE |

**Expected:** admin deactivating own account → 403 with explicit message; deactivating the last active admin → 403 (service guard).
**Status:** NOT EXECUTED · Automation: PARTIAL — auth-rbac.test.ts (self-deactivation path)

| ID | Feature | Priority | Type |
|---|---|---|
| TC-USR-007 | Reset password by admin | P0 | FUNCTIONAL |

**Expected:** new password works on next login; old sessions handled per contract (verify: revoke-all vs keep — record actual); reset action audited; response contains no plaintext.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-USR-008 | Delete user semantics | P0 | DATABASE |

**Expected:** deletion is guarded — user with historical references (requests created, events, assignments, audit rows) is either soft-deleted/isActive=false or 409 per actual contract; referenced rows are NEVER cascaded into data loss; record the actual behavior here.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-USR-009 | Executor blocked from every users route | P0 | AUTHORIZATION |

**Expected:** 403 on all 7 routes (router-level `use`); no data leak.
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|---|
| TC-USR-010 | List pagination + filters | P1 | FUNCTIONAL |

**Expected:** page/pageSize clamped; role/search filters work; no passwordHash in any list row (toSafeUser serialization).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

| ID | Feature | Priority | Type |
|---|---|
| TC-USR-011 | Validation: unknown fields / bad role / bad uuid | P0 | NEGATIVE |

**Expected:** strict schemas → 400 VALIDATION_ERROR (role must be ADMIN|EXECUTOR; id must be uuid).
**Status:** NOT EXECUTED · Automation: NOT AUTOMATED

## TC-03 roll-up
Cases: 11 · P0: 8 · Automated: 1 partial
